//! Crate `alartic_api` — modules et `build_app` partagés entre le binaire
//! (`main.rs`) et les tests d'intégration (`tests/`).

// Les requêtes sqlx::query_as renvoient régulièrement des tuples larges
// (souvent ≥ 5 champs). Les convertir en structs `FromRow` ailleurs apporte
// peu — on assume le lint au niveau crate.
#![allow(clippy::type_complexity)]

pub mod audit;
pub mod auth;
pub mod contact;
pub mod crypto;
pub mod csrf;
pub mod db;
pub mod error;
pub mod invoice;
pub mod mailer;
pub mod me;
pub mod orders;
pub mod payplug;
pub mod products;
pub mod purge;
pub mod quotes;
pub mod session;
pub mod state;
pub mod tickets;

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    middleware,
    routing::get,
};
use serde::Serialize;
use state::AppState;
use tower_http::trace::TraceLayer;
use tracing::error;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
    pub database: &'static str,
}

pub async fn root() -> &'static str {
    "ALARTIC API. Voir /health pour la disponibilité."
}

pub async fn health(State(state): State<AppState>) -> (StatusCode, Json<HealthResponse>) {
    match db::ping(&state.pool).await {
        Ok(()) => (
            StatusCode::OK,
            Json(HealthResponse {
                status: "ok",
                service: "alartic-api",
                version: env!("CARGO_PKG_VERSION"),
                database: "ok",
            }),
        ),
        Err(err) => {
            error!(error = %err, "DB health check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(HealthResponse {
                    status: "degraded",
                    service: "alartic-api",
                    version: env!("CARGO_PKG_VERSION"),
                    database: "down",
                }),
            )
        }
    }
}

/// Construit le Router complet. Réutilisé en prod et dans les tests.
pub fn build_app(state: AppState) -> Router {
    let cors = state.cors_layer.clone();
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .merge(auth::routes())
        .merge(contact::routes())
        .merge(me::routes())
        .merge(orders::routes())
        .merge(quotes::routes())
        .merge(tickets::routes())
        // Ordre `.layer()` : la dernière couche posée est la plus EXTÉRIEURE.
        // CORS doit englober CSRF pour que les pre-flight OPTIONS reçoivent
        // les Access-Control-* avant d'être bloqués par le check CSRF.
        .layer(middleware::from_fn(csrf::require_csrf))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
