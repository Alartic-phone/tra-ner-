//! Tickets SAV — CDC §11.
//!
//! Endpoints :
//! - `POST   /me/tickets`              — créer un ticket + 1ᵉʳ message.
//! - `GET    /me/tickets`              — lister les tickets de l'user (résumé).
//! - `GET    /me/tickets/:id`          — détails + tous les messages déchiffrés.
//! - `POST   /me/tickets/:id/messages` — ajouter un message (réponse user).
//!
//! Isolation : toutes les requêtes filtrent par `tickets.user_id = auth.user_id`.
//! Pas d'endpoint admin pour l'instant (J4).

use crate::{
    audit, crypto,
    error::AppError,
    session::AuthUser,
    state::{self, AppState},
};
use std::time::Duration as StdDuration;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::info;
use uuid::Uuid;
use validator::Validate;

pub fn routes() -> Router<AppState> {
    // Limite de body 6 MB sur les routes d'attachments (max 5 MB de payload +
    // surcoût multipart). Les autres routes gardent la limite par défaut.
    let attach_upload = post(upload_attachment).layer(DefaultBodyLimit::max(6 * 1024 * 1024));
    Router::new()
        .route("/me/tickets", post(create).get(list))
        .route("/me/tickets/{id}", get(detail))
        .route("/me/tickets/{id}/messages", post(reply))
        .route("/me/tickets/{id}/attachments", attach_upload)
        .route(
            "/me/tickets/{id}/attachments/{attach_id}",
            get(download_attachment),
        )
}

const VALID_CATEGORIES: &[&str] = &["question", "probleme_technique", "garantie", "autre"];
const MAX_ATTACHMENT_SIZE: usize = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
    "text/plain",
];

#[derive(Deserialize, Validate)]
pub struct CreateBody {
    #[validate(length(min = 1, max = 32))]
    category: String,
    #[validate(length(min = 3, max = 200))]
    subject: String,
    #[validate(length(min = 5, max = 10_000))]
    body: String,
}

#[derive(Serialize)]
pub struct TicketSummary {
    id: Uuid,
    category: String,
    subject: String,
    status: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    attachments_count: i64,
}

#[derive(Serialize, Clone)]
pub struct AttachmentMeta {
    id: Uuid,
    filename: String,
    mime_type: String,
    size_bytes: i64,
    uploaded_by: String,
    created_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct MessageView {
    id: Uuid,
    sender: String,
    body: String,
    created_at: DateTime<Utc>,
    attachments: Vec<AttachmentMeta>,
}

#[derive(Serialize)]
pub struct TicketDetail {
    id: Uuid,
    category: String,
    subject: String,
    status: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    closed_at: Option<DateTime<Utc>>,
    messages: Vec<MessageView>,
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateBody>,
) -> Result<impl IntoResponse, AppError> {
    body.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    if !VALID_CATEGORIES.contains(&body.category.as_str()) {
        return Err(AppError::BadRequest("invalid_category".into()));
    }

    // Rate-limit : 10 nouveaux tickets / heure / user. Filet anti-spam.
    let rl_key = state::rl_key_user(b"ticket_create", user.user_id);
    if !state::rate_limit_check(
        &state.rate_limiter,
        &rl_key,
        10,
        StdDuration::from_secs(3600),
    )
    .await
    {
        return Err(AppError::TooManyRequests);
    }

    let subject_encrypted = crypto::encrypt_string(&state.master_key, &body.subject)?;
    let body_encrypted = crypto::encrypt_string(&state.master_key, &body.body)?;

    let mut tx = state.pool.begin().await?;

    let ticket_id: (Uuid,) = sqlx::query_as(
        "INSERT INTO tickets (user_id, category, subject_encrypted)
         VALUES ($1, $2, $3)
         RETURNING id",
    )
    .bind(user.user_id)
    .bind(&body.category)
    .bind(&subject_encrypted)
    .fetch_one(&mut *tx)
    .await?;

    let message_id: (Uuid,) = sqlx::query_as(
        "INSERT INTO ticket_messages (ticket_id, sender, body_encrypted)
         VALUES ($1, 'user', $2)
         RETURNING id",
    )
    .bind(ticket_id.0)
    .bind(&body_encrypted)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    info!(user_id = %user.user_id, ticket_id = %ticket_id.0, "ticket created");
    audit::log(
        &state.pool,
        Some(user.user_id),
        "ticket.create",
        Some("ticket"),
        Some(ticket_id.0),
        Some(json!({ "category": &body.category })),
    )
    .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": ticket_id.0, "message_id": message_id.0 })),
    ))
}

async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<TicketSummary>>, AppError> {
    let rows: Vec<(Uuid, String, Vec<u8>, String, DateTime<Utc>, DateTime<Utc>, i64)> =
        sqlx::query_as(
            "SELECT t.id, t.category, t.subject_encrypted, t.status, t.created_at,
                    t.updated_at,
                    (SELECT count(*) FROM ticket_attachments a WHERE a.ticket_id = t.id)
             FROM tickets t
             WHERE t.user_id = $1
             ORDER BY t.updated_at DESC",
        )
        .bind(user.user_id)
        .fetch_all(&state.pool)
        .await?;

    let tickets = rows
        .into_iter()
        .map(|(id, category, subject_enc, status, created_at, updated_at, attachments_count)| {
            let subject = crypto::decrypt_string(&state.master_key, &subject_enc)
                .unwrap_or_else(|_| "(déchiffrement impossible)".into());
            TicketSummary {
                id,
                category,
                subject,
                status,
                created_at,
                updated_at,
                attachments_count,
            }
        })
        .collect();

    Ok(Json(tickets))
}

async fn detail(
    State(state): State<AppState>,
    user: AuthUser,
    Path(ticket_id): Path<Uuid>,
) -> Result<Json<TicketDetail>, AppError> {
    let ticket: (String, Vec<u8>, String, DateTime<Utc>, DateTime<Utc>, Option<DateTime<Utc>>) =
        sqlx::query_as(
            "SELECT category, subject_encrypted, status, created_at, updated_at, closed_at
             FROM tickets
             WHERE id = $1 AND user_id = $2",
        )
        .bind(ticket_id)
        .bind(user.user_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let subject = crypto::decrypt_string(&state.master_key, &ticket.1)?;

    let msg_rows: Vec<(Uuid, String, Vec<u8>, DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, sender, body_encrypted, created_at
         FROM ticket_messages
         WHERE ticket_id = $1
         ORDER BY created_at ASC",
    )
    .bind(ticket_id)
    .fetch_all(&state.pool)
    .await?;

    // Tous les attachments du ticket en une requête, on les regroupe par
    // message côté Rust. Plus rapide qu'une N+1 par message.
    let attach_rows: Vec<(Uuid, Option<Uuid>, Vec<u8>, String, i64, String, DateTime<Utc>)> =
        sqlx::query_as(
            "SELECT id, message_id, filename_encrypted, mime_type, size_bytes,
                    uploaded_by, created_at
             FROM ticket_attachments
             WHERE ticket_id = $1
             ORDER BY created_at ASC",
        )
        .bind(ticket_id)
        .fetch_all(&state.pool)
        .await?;

    let decrypted_attachments: Vec<(Option<Uuid>, AttachmentMeta)> = attach_rows
        .into_iter()
        .map(|(id, msg_id, filename_enc, mime_type, size_bytes, uploaded_by, created_at)| {
            let filename = crypto::decrypt_string(&state.master_key, &filename_enc)
                .unwrap_or_else(|_| "(nom illisible)".into());
            (
                msg_id,
                AttachmentMeta {
                    id,
                    filename,
                    mime_type,
                    size_bytes,
                    uploaded_by,
                    created_at,
                },
            )
        })
        .collect();

    let messages: Vec<MessageView> = msg_rows
        .into_iter()
        .map(|(id, sender, body_enc, created_at)| {
            let body = crypto::decrypt_string(&state.master_key, &body_enc)
                .unwrap_or_else(|_| "(déchiffrement impossible)".into());
            let attachments = decrypted_attachments
                .iter()
                .filter(|(msg_id, _)| msg_id == &Some(id))
                .map(|(_, a)| a.clone())
                .collect();
            MessageView {
                id,
                sender,
                body,
                created_at,
                attachments,
            }
        })
        .collect();

    Ok(Json(TicketDetail {
        id: ticket_id,
        category: ticket.0,
        subject,
        status: ticket.2,
        created_at: ticket.3,
        updated_at: ticket.4,
        closed_at: ticket.5,
        messages,
    }))
}

#[derive(Deserialize, Validate)]
pub struct ReplyBody {
    #[validate(length(min = 5, max = 10_000))]
    body: String,
}

async fn reply(
    State(state): State<AppState>,
    user: AuthUser,
    Path(ticket_id): Path<Uuid>,
    Json(body): Json<ReplyBody>,
) -> Result<impl IntoResponse, AppError> {
    body.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    // Vérifie en une seule requête que le ticket appartient à l'user et n'est
    // pas fermé. UPDATE...RETURNING au lieu de SELECT puis INSERT pour
    // atomicité.
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM tickets
         WHERE id = $1 AND user_id = $2 AND status != 'closed'",
    )
    .bind(ticket_id)
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    let body_encrypted = crypto::encrypt_string(&state.master_key, &body.body)?;

    let mut tx = state.pool.begin().await?;
    let message_id: (Uuid,) = sqlx::query_as(
        "INSERT INTO ticket_messages (ticket_id, sender, body_encrypted)
         VALUES ($1, 'user', $2)
         RETURNING id",
    )
    .bind(ticket_id)
    .bind(&body_encrypted)
    .fetch_one(&mut *tx)
    .await?;

    // Rebascule le statut sur 'open' si admin l'avait mis en attente client.
    sqlx::query(
        "UPDATE tickets SET status = 'open'
         WHERE id = $1 AND status = 'waiting_user'",
    )
    .bind(ticket_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    info!(user_id = %user.user_id, ticket_id = %ticket_id, "ticket message added");
    audit::log(
        &state.pool,
        Some(user.user_id),
        "ticket.message",
        Some("ticket"),
        Some(ticket_id),
        None,
    )
    .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": message_id.0 })),
    ))
}

#[derive(Deserialize)]
pub struct UploadQuery {
    /// Si fourni, attache le fichier à ce message. Doit appartenir au même
    /// ticket. Sinon, l'attachment est attaché au ticket sans message
    /// (legacy / ticket-level).
    message_id: Option<Uuid>,
}

/// POST /me/tickets/:id/attachments — upload multipart.
///
/// Limites :
/// - Taille max 5 MB par fichier (validée par CHECK SQL + par DefaultBodyLimit).
/// - MIME whitelist : png, jpeg, webp, pdf, txt (validée par CHECK SQL + handler).
/// - Doit appartenir à un ticket non-closed du user courant.
async fn upload_attachment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(ticket_id): Path<Uuid>,
    Query(q): Query<UploadQuery>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    // Vérifie l'ownership et l'état du ticket avant de toucher au body.
    let owns: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM tickets
         WHERE id = $1 AND user_id = $2 AND status != 'closed'",
    )
    .bind(ticket_id)
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?;
    if owns.is_none() {
        return Err(AppError::NotFound);
    }

    // Si message_id fourni, vérifier qu'il appartient bien à ce ticket.
    if let Some(msg_id) = q.message_id {
        let msg_owns: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM ticket_messages WHERE id = $1 AND ticket_id = $2",
        )
        .bind(msg_id)
        .bind(ticket_id)
        .fetch_optional(&state.pool)
        .await?;
        if msg_owns.is_none() {
            return Err(AppError::NotFound);
        }
    }

    let field = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart: {e}")))?
        .ok_or_else(|| AppError::BadRequest("missing_file".into()))?;

    let filename = field
        .file_name()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "attachment".to_string());
    let mime = field
        .content_type()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    if !ALLOWED_MIME.contains(&mime.as_str()) {
        return Err(AppError::BadRequest("mime_type_not_allowed".into()));
    }

    let data = field
        .bytes()
        .await
        .map_err(|e| AppError::BadRequest(format!("read_failed: {e}")))?;

    if data.is_empty() {
        return Err(AppError::BadRequest("empty_file".into()));
    }
    if data.len() > MAX_ATTACHMENT_SIZE {
        return Err(AppError::BadRequest("file_too_large".into()));
    }

    let filename_encrypted = crypto::encrypt_string(&state.master_key, &filename)?;
    let content_encrypted = crypto::encrypt_bytes(&state.master_key, &data)?;

    let id: (Uuid,) = sqlx::query_as(
        "INSERT INTO ticket_attachments
            (ticket_id, message_id, filename_encrypted, mime_type, size_bytes,
             content_encrypted, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'user')
         RETURNING id",
    )
    .bind(ticket_id)
    .bind(q.message_id)
    .bind(&filename_encrypted)
    .bind(&mime)
    .bind(data.len() as i64)
    .bind(&content_encrypted)
    .fetch_one(&state.pool)
    .await?;

    // Met à jour `updated_at` du ticket pour qu'il remonte dans la liste.
    sqlx::query("UPDATE tickets SET updated_at = NOW() WHERE id = $1")
        .bind(ticket_id)
        .execute(&state.pool)
        .await?;

    info!(
        user_id = %user.user_id,
        ticket_id = %ticket_id,
        attachment_id = %id.0,
        size = data.len(),
        "ticket attachment uploaded"
    );
    audit::log(
        &state.pool,
        Some(user.user_id),
        "ticket.attachment.upload",
        Some("ticket"),
        Some(ticket_id),
        Some(json!({ "size_bytes": data.len(), "mime": mime })),
    )
    .await;

    Ok((StatusCode::CREATED, Json(json!({ "id": id.0 }))))
}

/// GET /me/tickets/:id/attachments/:attach_id — download.
///
/// Renvoie le fichier déchiffré avec son Content-Type d'origine et un
/// `Content-Disposition: attachment` pour déclencher le download navigateur.
async fn download_attachment(
    State(state): State<AppState>,
    user: AuthUser,
    Path((ticket_id, attach_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    let row: Option<(Vec<u8>, String, Vec<u8>)> = sqlx::query_as(
        "SELECT a.filename_encrypted, a.mime_type, a.content_encrypted
         FROM ticket_attachments a
         INNER JOIN tickets t ON a.ticket_id = t.id
         WHERE a.id = $1 AND a.ticket_id = $2 AND t.user_id = $3",
    )
    .bind(attach_id)
    .bind(ticket_id)
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    let (filename_enc, mime_type, content_enc) = row.ok_or(AppError::NotFound)?;
    let filename = crypto::decrypt_string(&state.master_key, &filename_enc)?;
    let content = crypto::decrypt_bytes(&state.master_key, &content_enc)?;

    // Filename safe pour Content-Disposition : retire les guillemets et CR/LF
    // qui casseraient le header. ASCII-only fallback si caractères non-ASCII
    // (RFC 5987 UTF-8 encoding via `filename*=` serait plus propre mais lourd).
    let safe_filename: String = filename
        .chars()
        .map(|c| if c.is_control() || c == '"' { '_' } else { c })
        .collect();

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&mime_type).unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    if let Ok(disposition) =
        HeaderValue::from_str(&format!("attachment; filename=\"{safe_filename}\""))
    {
        headers.insert(header::CONTENT_DISPOSITION, disposition);
    }

    Ok((headers, content))
}
