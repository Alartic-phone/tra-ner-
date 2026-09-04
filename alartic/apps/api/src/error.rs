//! Type d'erreur unifié pour les handlers Axum.
//!
//! Politique d'erreur publique : on n'expose JAMAIS de détail interne au client.
//! Tout est mappé sur un message générique côté JSON, et le détail va dans
//! les logs tracing (CDC §6 — logs serveur internes, pas d'info user).

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use tracing::error;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),

    #[error("crypto error: {0}")]
    Crypto(#[from] crate::crypto::CryptoError),

    #[error("mailer error: {0}")]
    Mailer(#[from] crate::mailer::MailerError),

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("not found")]
    NotFound,

    #[error("unauthorized")]
    Unauthorized,

    #[error("too many requests")]
    TooManyRequests,

    #[error("internal error")]
    Internal,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, public_msg) = match &self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::TooManyRequests => (StatusCode::TOO_MANY_REQUESTS, "rate_limited"),
            AppError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
            _ => {
                error!(error = %self, "internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal_error")
            }
        };
        (status, Json(json!({ "error": public_msg }))).into_response()
    }
}
