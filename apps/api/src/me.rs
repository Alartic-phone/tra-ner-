//! Espace client minimal — CDC §7.2 + §10.6.
//!
//! Endpoints :
//! - `GET /me/profile` — profil enrichi (email déchiffré).
//! - `POST /me/suspend` — suspension volontaire. Sessions purgées. La
//!   réactivation passe par un nouveau magic link (qui échouera tant que
//!   `suspended_at` n'est pas remis à NULL — décision admin manuelle).
//! - `DELETE /me` — soft delete RGPD. `deleted_at` posé, sessions purgées,
//!   plus aucun accès via le compte. L'anonymisation des commandes liées
//!   sera faite par un job RGPD séparé (CDC §10.6).

use crate::{
    audit, crypto, csrf,
    error::AppError,
    session::{self, AuthUser},
    state::{self, AppState},
};
use std::time::Duration as StdDuration;
use axum::{
    Json, Router,
    extract::State,
    http::header::SET_COOKIE,
    response::{AppendHeaders, IntoResponse},
    routing::{delete, get, patch, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::info;
use uuid::Uuid;
use validator::Validate;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/me/profile", get(profile))
        .route("/me/email", patch(change_email))
        .route("/me/address", get(get_address).patch(patch_address))
        .route("/me/audit", get(audit_history))
        .route("/me/export", get(export))
        .route("/me/suspend", post(suspend))
        .route("/me", delete(delete_account))
}

#[derive(Serialize)]
pub struct ProfileResponse {
    user_id: Uuid,
    email: String,
    is_pro: bool,
    is_admin: bool,
    created_at: DateTime<Utc>,
    last_login_at: Option<DateTime<Utc>>,
    suspended_at: Option<DateTime<Utc>>,
}

async fn profile(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<ProfileResponse>, AppError> {
    let row: (
        Vec<u8>,
        bool,
        bool,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
        Option<DateTime<Utc>>,
    ) = sqlx::query_as(
        "SELECT email_encrypted, is_pro, is_admin, created_at, last_login_at, suspended_at
         FROM users
         WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;

    let email = crypto::decrypt_string(&state.master_key, &row.0)?;

    Ok(Json(ProfileResponse {
        user_id: user.user_id,
        email,
        is_pro: row.1,
        is_admin: row.2,
        created_at: row.3,
        last_login_at: row.4,
        suspended_at: row.5,
    }))
}

/// GET /me/export — export RGPD (art. 20 — droit à la portabilité).
///
/// Renvoie un JSON groupant tout ce qu'on a sur l'utilisateur dans une seule
/// réponse exploitable : profil, tickets avec messages déchiffrés, et le
/// journal d'audit le concernant. Le client front pourra l'offrir en
/// téléchargement direct via un `Content-Disposition: attachment`.
async fn export(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    // Profile
    let profile_row: (
        Vec<u8>,
        bool,
        bool,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
        Option<DateTime<Utc>>,
    ) = sqlx::query_as(
        "SELECT email_encrypted, is_pro, is_admin, created_at, last_login_at, suspended_at
         FROM users WHERE id = $1",
    )
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;
    let email = crypto::decrypt_string(&state.master_key, &profile_row.0)?;

    // Tickets + messages
    let ticket_rows: Vec<(
        uuid::Uuid,
        String,
        Vec<u8>,
        String,
        DateTime<Utc>,
        DateTime<Utc>,
    )> = sqlx::query_as(
        "SELECT id, category, subject_encrypted, status, created_at, updated_at
         FROM tickets WHERE user_id = $1 ORDER BY created_at ASC",
    )
    .bind(user.user_id)
    .fetch_all(&state.pool)
    .await?;

    let mut tickets_json = Vec::with_capacity(ticket_rows.len());
    for (id, category, subject_enc, status, created_at, updated_at) in ticket_rows {
        let subject = crypto::decrypt_string(&state.master_key, &subject_enc)
            .unwrap_or_else(|_| "(déchiffrement impossible)".into());
        let msgs: Vec<(String, Vec<u8>, DateTime<Utc>)> = sqlx::query_as(
            "SELECT sender, body_encrypted, created_at
             FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC",
        )
        .bind(id)
        .fetch_all(&state.pool)
        .await?;
        let msgs_json: Vec<_> = msgs
            .into_iter()
            .map(|(sender, body_enc, created_at)| {
                let body = crypto::decrypt_string(&state.master_key, &body_enc)
                    .unwrap_or_else(|_| "(déchiffrement impossible)".into());
                json!({
                    "sender": sender,
                    "body": body,
                    "created_at": created_at,
                })
            })
            .collect();
        tickets_json.push(json!({
            "id": id,
            "category": category,
            "subject": subject,
            "status": status,
            "created_at": created_at,
            "updated_at": updated_at,
            "messages": msgs_json,
        }));
    }

    // Audit log de l'utilisateur (entries où il est l'acteur)
    let audit_rows: Vec<(
        String,
        Option<String>,
        Option<uuid::Uuid>,
        Option<serde_json::Value>,
        DateTime<Utc>,
    )> = sqlx::query_as(
        "SELECT action, target_type, target_id, metadata, created_at
         FROM audit_log
         WHERE actor_user_id = $1
         ORDER BY created_at ASC",
    )
    .bind(user.user_id)
    .fetch_all(&state.pool)
    .await?;
    let audit_json: Vec<_> = audit_rows
        .into_iter()
        .map(|(action, target_type, target_id, metadata, created_at)| {
            json!({
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "metadata": metadata,
                "created_at": created_at,
            })
        })
        .collect();

    let payload = json!({
        "export_format": "alartic-rgpd-v1",
        "exported_at": Utc::now(),
        "profile": {
            "user_id": user.user_id,
            "email": email,
            "is_pro": profile_row.1,
            "is_admin": profile_row.2,
            "created_at": profile_row.3,
            "last_login_at": profile_row.4,
            "suspended_at": profile_row.5,
        },
        "tickets": tickets_json,
        "audit_log": audit_json,
    });

    info!(user_id = %user.user_id, "RGPD export served");
    audit::log(
        &state.pool,
        Some(user.user_id),
        "user.export.rgpd",
        Some("user"),
        Some(user.user_id),
        None,
    )
    .await;

    let filename = format!(
        "alartic_export_{}_{}.json",
        user.user_id,
        Utc::now().format("%Y%m%d")
    );
    Ok((
        [(
            axum::http::header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}\""),
        )],
        Json(payload),
    ))
}

#[derive(Deserialize, Validate)]
pub struct ChangeEmailBody {
    #[validate(email, length(max = 254))]
    new_email: String,
}

/// PATCH /me/email — démarre un changement d'email (double opt-in).
///
/// Ne touche **PAS** à `users.email_hash`. Crée un token dans `email_change
/// _tokens` et envoie un magic link au NOUVEL email. Tant que l'utilisateur
/// n'a pas cliqué, son compte reste tel quel (mêmes données, même email).
///
/// Le confirm est géré par `auth::email_change_confirm` (route GET
/// `/auth/email-change/confirm/:token`).
async fn change_email(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ChangeEmailBody>,
) -> Result<impl IntoResponse, AppError> {
    body.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    // Rate-limit : 3 demandes / heure / user. Empêche un bruteforce d'unicité
    // (probing d'emails existants en lisant les 400) et un flood d'emails vers
    // une adresse arbitraire.
    let rl_key = state::rl_key_user(b"email", user.user_id);
    if !state::rate_limit_check(
        &state.rate_limiter,
        &rl_key,
        3,
        StdDuration::from_secs(3600),
    )
    .await
    {
        return Err(AppError::TooManyRequests);
    }

    let new_email = body.new_email.trim().to_lowercase();
    let new_hash = crypto::email_hash(&state.email_hmac_key, &new_email);

    // Refus si l'email proposé est identique au courant.
    let current_hash: Vec<u8> =
        sqlx::query_scalar("SELECT email_hash FROM users WHERE id = $1")
            .bind(user.user_id)
            .fetch_one(&state.pool)
            .await?;
    if current_hash == new_hash[..] {
        return Err(AppError::BadRequest("same_email".into()));
    }

    // Vérifie qu'aucun autre user n'a déjà ce hash.
    let taken: bool = sqlx::query_scalar(
        "SELECT EXISTS(
             SELECT 1 FROM users
             WHERE email_hash = $1 AND deleted_at IS NULL AND id != $2
         )",
    )
    .bind(&new_hash[..])
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;
    if taken {
        return Err(AppError::BadRequest("email_already_used".into()));
    }

    let new_encrypted = crypto::encrypt_string(&state.master_key, &new_email)?;
    let (token_clear, token_hash) = crypto::generate_token();
    let expires_at = chrono::Utc::now() + chrono::Duration::minutes(15);

    sqlx::query(
        "INSERT INTO email_change_tokens
            (token_hash, user_id, new_email_hash, new_email_encrypted, expires_at)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(&token_hash[..])
    .bind(user.user_id)
    .bind(&new_hash[..])
    .bind(&new_encrypted)
    .bind(expires_at)
    .execute(&state.pool)
    .await?;

    let link = format!(
        "{}/auth/email-change/confirm/{}",
        state.base_url, token_clear
    );
    let body_text = format!(
        "Bonjour,\n\n\
         Vous avez demandé à changer l'email de votre compte ALARTIC vers cette adresse.\n\n\
         Cliquez ici pour confirmer (valide 15 minutes, usage unique) :\n{link}\n\n\
         Si vous n'êtes pas à l'origine de cette demande, ignorez cet email. \
         Votre compte reste inchangé.\n\n\
         — ALARTIC\n"
    );
    if let Err(err) = state
        .mailer
        .send_text(&new_email, "Confirmez votre nouvelle adresse ALARTIC", &body_text)
        .await
    {
        info!(error = %err, "email-change confirmation mail failed");
    }

    info!(user_id = %user.user_id, "email change requested, awaiting confirmation");
    audit::log(
        &state.pool,
        Some(user.user_id),
        "user.email.change.request",
        Some("user"),
        Some(user.user_id),
        None,
    )
    .await;

    Ok(Json(
        json!({ "status": "confirmation_sent", "new_email": new_email }),
    ))
}

#[derive(Deserialize, Serialize, Validate)]
pub struct Address {
    #[validate(length(min = 1, max = 100))]
    line1: String,
    #[validate(length(max = 100))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    line2: Option<String>,
    #[validate(length(min = 1, max = 20))]
    postcode: String,
    #[validate(length(min = 1, max = 100))]
    city: String,
    #[validate(length(min = 2, max = 3))]
    country: String,
}

#[derive(Deserialize, Validate)]
pub struct UpdateContactBody {
    #[serde(default)]
    address: Option<Address>,
    #[validate(length(max = 30))]
    #[serde(default)]
    phone: Option<String>,
}

#[derive(Serialize)]
pub struct ContactResponse {
    address: Option<Address>,
    phone: Option<String>,
}

async fn fetch_contact(state: &AppState, user_id: Uuid) -> Result<ContactResponse, AppError> {
    let row: (Option<Vec<u8>>, Option<Vec<u8>>) = sqlx::query_as(
        "SELECT address_encrypted, phone_encrypted
         FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user_id)
    .fetch_one(&state.pool)
    .await?;

    let address = row
        .0
        .map(|blob| crypto::decrypt_string(&state.master_key, &blob))
        .transpose()?
        .map(|json| serde_json::from_str::<Address>(&json))
        .transpose()
        .map_err(|_| AppError::BadRequest("address_corrupted".into()))?;

    let phone = row
        .1
        .map(|blob| crypto::decrypt_string(&state.master_key, &blob))
        .transpose()?;

    Ok(ContactResponse { address, phone })
}

/// GET /me/address — récupère l'adresse + téléphone déchiffrés.
async fn get_address(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<ContactResponse>, AppError> {
    fetch_contact(&state, user.user_id).await.map(Json)
}

/// PATCH /me/address — met à jour adresse / téléphone.
///
/// Body : `{ address: { line1, ... } | null, phone: "..." | null }`. Les
/// deux champs sont optionnels. `null` explicite efface le champ ; champ
/// absent = inchangé.
async fn patch_address(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UpdateContactBody>,
) -> Result<Json<ContactResponse>, AppError> {
    body.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    if let Some(addr) = &body.address {
        addr.validate()
            .map_err(|e| AppError::BadRequest(e.to_string()))?;
    }

    if let Some(addr) = body.address.as_ref() {
        let json = serde_json::to_string(addr)
            .map_err(|_| AppError::BadRequest("address_serialize".into()))?;
        let blob = crypto::encrypt_string(&state.master_key, &json)?;
        sqlx::query(
            "UPDATE users SET address_encrypted = $1 WHERE id = $2 AND deleted_at IS NULL",
        )
        .bind(&blob)
        .bind(user.user_id)
        .execute(&state.pool)
        .await?;
    }

    if let Some(phone) = body.phone.as_ref() {
        let trimmed = phone.trim();
        if trimmed.is_empty() {
            sqlx::query(
                "UPDATE users SET phone_encrypted = NULL WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(user.user_id)
            .execute(&state.pool)
            .await?;
        } else {
            let blob = crypto::encrypt_string(&state.master_key, trimmed)?;
            sqlx::query(
                "UPDATE users SET phone_encrypted = $1 WHERE id = $2 AND deleted_at IS NULL",
            )
            .bind(&blob)
            .bind(user.user_id)
            .execute(&state.pool)
            .await?;
        }
    }

    info!(user_id = %user.user_id, "contact details updated");
    audit::log(
        &state.pool,
        Some(user.user_id),
        "user.contact.update",
        Some("user"),
        Some(user.user_id),
        None,
    )
    .await;

    fetch_contact(&state, user.user_id).await.map(Json)
}

#[derive(Serialize)]
pub struct AuditEntry {
    action: String,
    target_type: Option<String>,
    target_id: Option<Uuid>,
    metadata: Option<serde_json::Value>,
    created_at: DateTime<Utc>,
}

/// GET /me/audit — renvoie les 50 dernières entrées audit_log dont
/// `actor_user_id` est l'utilisateur courant. Lecture seule.
async fn audit_history(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<Json<Vec<AuditEntry>>, AppError> {
    let rows: Vec<(
        String,
        Option<String>,
        Option<Uuid>,
        Option<serde_json::Value>,
        DateTime<Utc>,
    )> = sqlx::query_as(
        "SELECT action, target_type, target_id, metadata, created_at
         FROM audit_log
         WHERE actor_user_id = $1
         ORDER BY created_at DESC
         LIMIT 50",
    )
    .bind(user.user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(|(action, target_type, target_id, metadata, created_at)| AuditEntry {
                action,
                target_type,
                target_id,
                metadata,
                created_at,
            })
            .collect(),
    ))
}

async fn suspend(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    sqlx::query("UPDATE users SET suspended_at = NOW() WHERE id = $1 AND deleted_at IS NULL")
        .bind(user.user_id)
        .execute(&state.pool)
        .await?;

    sqlx::query("DELETE FROM sessions WHERE user_id = $1")
        .bind(user.user_id)
        .execute(&state.pool)
        .await?;

    info!(user_id = %user.user_id, "user self-suspended");
    audit::log(
        &state.pool,
        Some(user.user_id),
        "user.suspend",
        Some("user"),
        Some(user.user_id),
        None,
    )
    .await;

    Ok((
        AppendHeaders([
            (SET_COOKIE, session::clear_cookie(state.secure_cookie)),
            (SET_COOKIE, csrf::clear_cookie(state.secure_cookie)),
        ]),
        Json(json!({ "status": "suspended" })),
    ))
}

async fn delete_account(
    State(state): State<AppState>,
    user: AuthUser,
) -> Result<impl IntoResponse, AppError> {
    // Soft delete : conserve la row pour intégrité référentielle des futures
    // commandes/factures (archivage 10 ans, art. L123-22 CCom). Le job
    // d'anonymisation viendra plus tard remplacer `email_encrypted` par un
    // blob neutre (CDC §10.6).
    sqlx::query("UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL")
        .bind(user.user_id)
        .execute(&state.pool)
        .await?;

    sqlx::query("DELETE FROM sessions WHERE user_id = $1")
        .bind(user.user_id)
        .execute(&state.pool)
        .await?;

    info!(user_id = %user.user_id, "user self-deleted (soft)");
    audit::log(
        &state.pool,
        Some(user.user_id),
        "user.delete",
        Some("user"),
        Some(user.user_id),
        None,
    )
    .await;

    Ok((
        AppendHeaders([
            (SET_COOKIE, session::clear_cookie(state.secure_cookie)),
            (SET_COOKIE, csrf::clear_cookie(state.secure_cookie)),
        ]),
        Json(json!({ "status": "deleted" })),
    ))
}
