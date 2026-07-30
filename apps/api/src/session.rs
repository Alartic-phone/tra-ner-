//! Sessions cookie-based.
//!
//! - Session ID = 32 octets cryptographiques (`crypto::generate_token`).
//! - Cookie `alartic_session` envoyé au client en clair (URL-safe base64).
//! - DB stocke uniquement le SHA-256 du session ID (lookup déterministe, fuite
//!   table ≠ takeover possible).
//! - `verify` met à jour `last_activity_at` à chaque request authentifiée.
//! - `Secure` du cookie : omis en dev (HTTP localhost), à activer via
//!   `ALARTIC_SECURE_COOKIE=true` en prod derrière Caddy/HTTPS.

use crate::{
    crypto::{self, hash_token},
    error::AppError,
    state::AppState,
};
use axum::{
    extract::FromRequestParts,
    http::{HeaderMap, request::Parts},
};
use chrono::{DateTime, Duration, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub const COOKIE_NAME: &str = "alartic_session";
pub const SESSION_TTL: Duration = Duration::days(7);
/// Inactivité max pour les sessions admin (CDC §12). Plus laxiste pour les
/// utilisateurs B2C : seul `SESSION_TTL` absolu s'applique.
pub const ADMIN_INACTIVITY: Duration = Duration::minutes(30);

pub struct Session {
    pub user_id: Uuid,
    #[allow(dead_code)]
    pub expires_at: DateTime<Utc>,
    pub is_admin: bool,
}

/// Crée une session pour `user_id`. Retourne le session_id clair à mettre
/// dans le cookie.
pub async fn create(pool: &PgPool, user_id: Uuid) -> Result<String, sqlx::Error> {
    let (clear, id_hash) = crypto::generate_token();
    let expires_at = Utc::now() + SESSION_TTL;
    sqlx::query(
        "INSERT INTO sessions (id_hash, user_id, expires_at)
         VALUES ($1, $2, $3)",
    )
    .bind(&id_hash[..])
    .bind(user_id)
    .bind(expires_at)
    .execute(pool)
    .await?;
    Ok(clear)
}

/// Vérifie un session_id clair. Si valide et non expiré (et conforme à la
/// politique d'inactivité admin), met à jour `last_activity_at` et retourne
/// la `Session`. Sinon `None`.
///
/// Trois aller-retour DB (lookup + suppression conditionnelle + update). On
/// optimisera si nécessaire — pour J3 c'est lisible et correct.
pub async fn verify(pool: &PgPool, clear: &str) -> Option<Session> {
    let raw = crypto::decode_token(clear)?;
    if raw.len() != crypto::TOKEN_LEN {
        return None;
    }
    let id_hash = hash_token(&raw);

    // 1) Lookup : id valide + non expiré + flag admin. On rejette aussi les
    // sessions dont le user est suspendu ou supprimé — defense-in-depth, en
    // plus du `DELETE FROM sessions` qu'on fait au moment du suspend/delete.
    let row: Option<(Uuid, DateTime<Utc>, DateTime<Utc>, bool)> = sqlx::query_as(
        "SELECT s.user_id, s.expires_at, s.last_activity_at, u.is_admin
         FROM sessions s
         INNER JOIN users u ON s.user_id = u.id
         WHERE s.id_hash = $1
           AND s.expires_at > NOW()
           AND u.suspended_at IS NULL
           AND u.deleted_at IS NULL",
    )
    .bind(&id_hash[..])
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let (user_id, expires_at, last_activity, is_admin) = row?;

    // 2) Politique d'inactivité — admin uniquement (CDC §12).
    if is_admin && Utc::now() - last_activity > ADMIN_INACTIVITY {
        let _ = sqlx::query("DELETE FROM sessions WHERE id_hash = $1")
            .bind(&id_hash[..])
            .execute(pool)
            .await;
        return None;
    }

    // 3) Sliding update — best-effort, ne fait pas échouer la vérif si KO.
    let _ = sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id_hash = $1")
        .bind(&id_hash[..])
        .execute(pool)
        .await;

    Some(Session {
        user_id,
        expires_at,
        is_admin,
    })
}

/// Supprime la session correspondant au session_id clair fourni (logout).
/// No-op silencieuse si le cookie est mal formé.
pub async fn delete(pool: &PgPool, clear: &str) -> Result<(), sqlx::Error> {
    let Some(raw) = crypto::decode_token(clear) else {
        return Ok(());
    };
    if raw.len() != crypto::TOKEN_LEN {
        return Ok(());
    }
    let id_hash = hash_token(&raw);
    sqlx::query("DELETE FROM sessions WHERE id_hash = $1")
        .bind(&id_hash[..])
        .execute(pool)
        .await?;
    Ok(())
}

/// Construit le header `Set-Cookie` pour pose de session. `secure` à true en
/// prod uniquement (sinon le browser drop le cookie en HTTP).
pub fn build_cookie(value: &str, secure: bool) -> String {
    let max_age = SESSION_TTL.num_seconds();
    let mut s = format!(
        "{COOKIE_NAME}={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}"
    );
    if secure {
        s.push_str("; Secure");
    }
    s
}

/// Header `Set-Cookie` pour effacer la session côté client.
pub fn clear_cookie(secure: bool) -> String {
    let mut s = format!("{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    if secure {
        s.push_str("; Secure");
    }
    s
}

/// Récupère le `alartic_session` parmi tous les cookies du header `Cookie`.
pub fn extract_from_headers(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get("cookie")?.to_str().ok()?;
    parse_cookie(raw, COOKIE_NAME)
}

fn parse_cookie(header: &str, name: &str) -> Option<String> {
    for kv in header.split(';') {
        let kv = kv.trim();
        if let Some((k, v)) = kv.split_once('=')
            && k == name
        {
            return Some(v.to_string());
        }
    }
    None
}

/// Extractor axum : présence + validité du cookie de session.
pub struct AuthUser {
    pub user_id: Uuid,
    #[allow(dead_code)]
    pub is_admin: bool,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let clear = extract_from_headers(&parts.headers).ok_or(AppError::Unauthorized)?;
        let session = verify(&state.pool, &clear)
            .await
            .ok_or(AppError::Unauthorized)?;
        Ok(AuthUser {
            user_id: session.user_id,
            is_admin: session.is_admin,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn parse_cookie_finds_the_right_one() {
        let mut h = HeaderMap::new();
        h.insert(
            "cookie",
            HeaderValue::from_static("other=xx; alartic_session=abc123; foo=bar"),
        );
        assert_eq!(extract_from_headers(&h).as_deref(), Some("abc123"));
    }

    #[test]
    fn parse_cookie_missing_returns_none() {
        let mut h = HeaderMap::new();
        h.insert("cookie", HeaderValue::from_static("foo=bar"));
        assert_eq!(extract_from_headers(&h), None);
    }

    #[test]
    fn build_cookie_omits_secure_in_dev() {
        let c = build_cookie("xyz", false);
        assert!(c.contains("HttpOnly"));
        assert!(c.contains("SameSite=Strict"));
        assert!(!c.contains("Secure"));
    }

    #[test]
    fn build_cookie_includes_secure_in_prod() {
        let c = build_cookie("xyz", true);
        assert!(c.contains("Secure"));
    }
}
