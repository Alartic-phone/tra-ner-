//! Magic link custom — CDC §10.2.
//!
//! Endpoints :
//! - `POST /auth/magic-link/request` — body `{ "email": "..." }`. Toujours
//!   répond 200 (pas de leak d'existence d'email). Rate-limité 3 / 15 min /
//!   email. Si l'utilisateur n'existe pas, on le crée silencieusement (hash +
//!   chiffrement à la même clé).
//! - `GET /auth/magic-link/consume/:token` — décode + hash + DELETE atomique
//!   et lookup user. Le row est supprimé à la 1ʳᵉ consommation : un 2ᵉ
//!   appel ne trouvera plus rien, donc retombe en 401. Idem expiré.
//!
//! Audit obligatoire (CDC §5.7) avant MEP :
//! - Suppression hash post-consommation OK (DELETE...RETURNING).
//! - Comparaison hash en SQL = SQL ; on ajoute `constant_time_eq` en double-check.
//! - Rate-limit appliqué avant toute écriture DB.
//! - Toujours 200 sur /request (anti-énumération).

use crate::{
    audit, crypto, csrf,
    error::AppError,
    session::{self, AuthUser},
    state::{self, AppState},
};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{
        HeaderMap, StatusCode,
        header::{LOCATION, SET_COOKIE},
    },
    response::{AppendHeaders, IntoResponse},
    routing::{get, post},
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration as StdDuration;
use tracing::{info, warn};
use validator::Validate;

const MAGIC_LINK_WINDOW: StdDuration = StdDuration::from_secs(15 * 60);
const MAGIC_LINK_MAX: usize = 3;
const TOKEN_TTL: Duration = Duration::minutes(15);

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/auth/magic-link/request", post(request))
        .route("/auth/magic-link/consume/{token}", get(consume))
        .route("/auth/email-change/confirm/{token}", get(email_change_confirm))
        .route("/auth/logout", post(logout))
        .route("/me", get(me))
}

#[derive(Deserialize, Validate)]
pub struct RequestBody {
    #[validate(email, length(max = 254))]
    email: String,
    /// "login" (par défaut) ou "signup". Permet d'envoyer un contenu
    /// d'email adapté quand l'utilisateur se trompe de flux — sans
    /// révéler côté API si le compte existe (anti-énumération préservée :
    /// statut HTTP toujours 200, un mail est toujours envoyé).
    #[serde(default)]
    purpose: Option<String>,
}

#[derive(Serialize)]
pub struct GenericResponse {
    status: &'static str,
}

/// POST /auth/magic-link/request
async fn request(
    State(state): State<AppState>,
    Json(body): Json<RequestBody>,
) -> Result<Json<GenericResponse>, AppError> {
    body.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let email = body.email.trim().to_lowercase();
    let email_hash = crypto::email_hash(&state.email_hmac_key, &email);
    let is_signup = body.purpose.as_deref() == Some("signup");

    // Rate-limit avant toute autre opération (CDC §10.2).
    let rl_key = state::rl_key_magic_link(&email_hash);
    if !state::rate_limit_check(
        &state.rate_limiter,
        &rl_key,
        MAGIC_LINK_MAX,
        MAGIC_LINK_WINDOW,
    )
    .await
    {
        warn!("rate-limit hit for magic-link request");
        return Ok(Json(GenericResponse { status: "ok" }));
    }

    // Détecte si l'utilisateur existe déjà — informe le contenu du mail,
    // pas le code HTTP (toujours 200, anti-énumération).
    let user_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(
             SELECT 1 FROM users
             WHERE email_hash = $1 AND deleted_at IS NULL
         )",
    )
    .bind(&email_hash[..])
    .fetch_one(&state.pool)
    .await?;

    match (is_signup, user_exists) {
        // Tentative de login sur un email inconnu → mail informatif, pas de
        // token (l'attaquant énumérateur reçoit aussi ce mail, donc il ne peut
        // pas distinguer un email valide d'un email vide en lisant l'API).
        (false, false) => {
            let body_text = format!(
                "Bonjour,\n\n\
                 Quelqu'un (vous probablement) a tenté de se connecter à ALARTIC \
                 avec cette adresse email. Aucun compte n'est associé à cette adresse.\n\n\
                 Si vous souhaitez créer un compte, rendez-vous sur :\n\
                 {}/inscription\n\n\
                 Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n\
                 — ALARTIC\n",
                state.front_url
            );
            let _ = state
                .mailer
                .send_text(&email, "Tentative de connexion à ALARTIC", &body_text)
                .await;
            info!("login attempt on unknown email — info mail sent");
        }
        // Tentative de signup sur un email existant → mail "compte déjà créé"
        // avec un lien de connexion.
        (true, true) => {
            let (token_clear, token_hash) = crypto::generate_token();
            let expires_at = Utc::now() + TOKEN_TTL;
            sqlx::query(
                "INSERT INTO magic_link_tokens (token_hash, email_hash, expires_at)
                 VALUES ($1, $2, $3)",
            )
            .bind(&token_hash[..])
            .bind(&email_hash[..])
            .bind(expires_at)
            .execute(&state.pool)
            .await?;
            let link = format!(
                "{}/auth/magic-link/consume/{}",
                state.base_url, token_clear
            );
            let body_text = format!(
                "Bonjour,\n\n\
                 Quelqu'un (vous probablement) a tenté de créer un compte ALARTIC \
                 avec cette adresse email. Bonne nouvelle : vous avez déjà un compte !\n\n\
                 Voici un lien de connexion (valide 15 minutes, usage unique) :\n\
                 {link}\n\n\
                 Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n\
                 — ALARTIC\n"
            );
            let _ = state
                .mailer
                .send_text(&email, "Vous avez déjà un compte ALARTIC", &body_text)
                .await;
            info!("signup attempt on existing email — login link sent");
        }
        // Cas standards : login OK ou signup OK.
        _ => {
            if is_signup && !user_exists {
                // Création silencieuse du user.
                let email_encrypted = crypto::encrypt_string(&state.master_key, &email)?;
                sqlx::query(
                    "INSERT INTO users (email_hash, email_encrypted)
                     VALUES ($1, $2)
                     ON CONFLICT (email_hash) DO NOTHING",
                )
                .bind(&email_hash[..])
                .bind(&email_encrypted)
                .execute(&state.pool)
                .await?;
            }

            let (token_clear, token_hash) = crypto::generate_token();
            let expires_at = Utc::now() + TOKEN_TTL;
            sqlx::query(
                "INSERT INTO magic_link_tokens (token_hash, email_hash, expires_at)
                 VALUES ($1, $2, $3)",
            )
            .bind(&token_hash[..])
            .bind(&email_hash[..])
            .bind(expires_at)
            .execute(&state.pool)
            .await?;

            let link = format!(
                "{}/auth/magic-link/consume/{}",
                state.base_url, token_clear
            );
            if let Err(err) = state.mailer.send_magic_link(&email, &link).await {
                warn!(error = %err, "failed to send magic link email");
            } else {
                info!("magic link sent");
            }
        }
    }

    Ok(Json(GenericResponse { status: "ok" }))
}


/// GET /auth/magic-link/consume/:token
async fn consume(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    // Décode le token URL-safe. Une chaîne invalide → 401, comme un token inexistant.
    let raw = crypto::decode_token(&token).ok_or(AppError::Unauthorized)?;
    if raw.len() != crypto::TOKEN_LEN {
        return Err(AppError::Unauthorized);
    }
    let token_hash = crypto::hash_token(&raw);

    // DELETE atomique : la 1ʳᵉ consommation supprime le row. Une 2ᵉ tentative
    // ne trouvera plus rien → 401. Pas de race condition possible.
    let row: Option<(Vec<u8>, Vec<u8>)> = sqlx::query_as(
        "DELETE FROM magic_link_tokens
         WHERE token_hash = $1 AND expires_at > NOW()
         RETURNING token_hash, email_hash",
    )
    .bind(&token_hash[..])
    .fetch_optional(&state.pool)
    .await?;

    let (db_token_hash, email_hash) = row.ok_or(AppError::Unauthorized)?;

    // Double-check anti-timing : compare le hash retourné par la DB en CT
    // avec celui qu'on a recalculé. L'index lookup ci-dessus est déjà strict,
    // mais ce check ferme la porte à tout glitch théorique (CDC §10.2).
    if !crypto::constant_time_eq(&db_token_hash, &token_hash) {
        return Err(AppError::Unauthorized);
    }

    // Récupère l'utilisateur correspondant et met à jour `last_login_at`.
    let user_id: (uuid::Uuid,) = sqlx::query_as(
        "UPDATE users SET last_login_at = NOW()
         WHERE email_hash = $1 AND deleted_at IS NULL AND suspended_at IS NULL
         RETURNING id",
    )
    .bind(&email_hash)
    .fetch_one(&state.pool)
    .await?;

    // Crée la session + un token CSRF appariée. Les deux cookies sont posés
    // simultanément.
    let session_id = session::create(&state.pool, user_id.0).await?;
    let csrf_token = csrf::generate();
    let session_cookie = session::build_cookie(&session_id, state.secure_cookie);
    let csrf_cookie = csrf::build_cookie(&csrf_token, state.secure_cookie);

    info!(user_id = %user_id.0, "magic link consumed");
    audit::log(
        &state.pool,
        Some(user_id.0),
        "auth.magic_link.consume",
        Some("user"),
        Some(user_id.0),
        None,
    )
    .await;

    // Redirige le navigateur vers /compte du front. Le navigateur reçoit les
    // Set-Cookie de l'origine API, puis suit la redirection vers le front qui
    // fera ensuite des requêtes credentials:include vers cette même API.
    let location = format!("{}/compte", state.front_url);
    Ok((
        StatusCode::SEE_OTHER,
        AppendHeaders([
            (SET_COOKIE, session_cookie),
            (SET_COOKIE, csrf_cookie),
            (LOCATION, location),
        ]),
    ))
}

#[derive(Serialize)]
pub struct MeResponse {
    user_id: uuid::Uuid,
}

/// GET /me — protégé par l'extractor `AuthUser`.
async fn me(user: AuthUser) -> Json<MeResponse> {
    Json(MeResponse {
        user_id: user.user_id,
    })
}

/// GET /auth/email-change/confirm/:token — confirme un changement d'email.
///
/// Démarré par `PATCH /me/email` (double opt-in). À l'arrivée du clic :
/// 1. DELETE atomique du token (usage unique).
/// 2. Re-check unicité (un autre user a pu prendre l'email entre-temps).
/// 3. UPDATE users avec nouveau hash + chiffrement.
/// 4. DELETE anciennes sessions + crée une nouvelle session immédiate
///    (l'utilisateur arrive directement connecté avec son nouvel email,
///    pas besoin de redemander un magic link).
/// 5. Redirect 303 vers /compte avec les Set-Cookie session + csrf.
async fn email_change_confirm(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let raw = crypto::decode_token(&token).ok_or(AppError::Unauthorized)?;
    if raw.len() != crypto::TOKEN_LEN {
        return Err(AppError::Unauthorized);
    }
    let token_hash = crypto::hash_token(&raw);

    let row: Option<(uuid::Uuid, Vec<u8>, Vec<u8>)> = sqlx::query_as(
        "DELETE FROM email_change_tokens
         WHERE token_hash = $1 AND expires_at > NOW()
         RETURNING user_id, new_email_hash, new_email_encrypted",
    )
    .bind(&token_hash[..])
    .fetch_optional(&state.pool)
    .await?;

    let (user_id, new_email_hash, new_email_encrypted) =
        row.ok_or(AppError::Unauthorized)?;

    // Re-check unicité au cas où.
    let taken: bool = sqlx::query_scalar(
        "SELECT EXISTS(
             SELECT 1 FROM users
             WHERE email_hash = $1 AND deleted_at IS NULL AND id != $2
         )",
    )
    .bind(&new_email_hash[..])
    .bind(user_id)
    .fetch_one(&state.pool)
    .await?;
    if taken {
        return Err(AppError::BadRequest("email_already_used".into()));
    }

    // Applique le changement + invalide les anciennes sessions (defense-in-depth
    // si un cookie a été volé). UPDATE last_login_at au passage.
    sqlx::query(
        "UPDATE users SET email_hash = $1, email_encrypted = $2, last_login_at = NOW()
         WHERE id = $3 AND deleted_at IS NULL",
    )
    .bind(&new_email_hash[..])
    .bind(&new_email_encrypted)
    .bind(user_id)
    .execute(&state.pool)
    .await?;

    sqlx::query("DELETE FROM sessions WHERE user_id = $1")
        .bind(user_id)
        .execute(&state.pool)
        .await?;

    // Crée une nouvelle session immédiate — l'utilisateur arrive connecté.
    let session_id = session::create(&state.pool, user_id).await?;
    let csrf_token = csrf::generate();
    let session_cookie = session::build_cookie(&session_id, state.secure_cookie);
    let csrf_cookie = csrf::build_cookie(&csrf_token, state.secure_cookie);

    info!(user_id = %user_id, "email change confirmed, session refreshed");
    audit::log(
        &state.pool,
        Some(user_id),
        "user.email.change",
        Some("user"),
        Some(user_id),
        None,
    )
    .await;

    let location = format!("{}/compte?email_changed=1", state.front_url);
    Ok((
        StatusCode::SEE_OTHER,
        AppendHeaders([
            (SET_COOKIE, session_cookie),
            (SET_COOKIE, csrf_cookie),
            (LOCATION, location),
        ]),
    ))
}

/// POST /auth/logout — supprime la session courante côté DB + clear cookies.
async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    if let Some(clear) = session::extract_from_headers(&headers) {
        let _ = session::delete(&state.pool, &clear).await;
    }
    Ok((
        AppendHeaders([
            (SET_COOKIE, session::clear_cookie(state.secure_cookie)),
            (SET_COOKIE, csrf::clear_cookie(state.secure_cookie)),
        ]),
        Json(json!({ "status": "ok" })),
    ))
}

