//! ALARTIC API — point d'entrée du binaire.
//!
//! Toute la logique est dans la lib `alartic_api`. Ce fichier ne fait que
//! lire l'environnement, construire l'`AppState` et démarrer le serveur.

use alartic_api::{
    build_app, crypto, db,
    invoice::SellerInfo,
    mailer::{Mailer, MailerConfig},
    payplug::PayplugClient,
    products,
    purge,
    state::AppState,
};
use axum::http::{HeaderName, HeaderValue, Method, header::CONTENT_TYPE};
use std::net::SocketAddr;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::info;

#[tokio::main]
async fn main() {
    // Charge le .env à la racine du repo si présent (dev). Chemin résolu au
    // build via CARGO_MANIFEST_DIR pour rester robuste au CWD d'invocation.
    // En prod (J5), no-op : les vars viennent du gestionnaire de secrets.
    let _ = dotenvy::from_path(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join(".env"),
    );

    init_tracing();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set (see .env.example)");

    let master_key = crypto::parse_hex_key(
        &std::env::var("ALARTIC_MASTER_KEY")
            .expect("ALARTIC_MASTER_KEY must be set (openssl rand -hex 32)"),
    )
    .expect("ALARTIC_MASTER_KEY must be 64 hex chars");

    let email_hmac_key = crypto::parse_hex_key(
        &std::env::var("ALARTIC_EMAIL_HMAC_KEY")
            .expect("ALARTIC_EMAIL_HMAC_KEY must be set (openssl rand -hex 32)"),
    )
    .expect("ALARTIC_EMAIL_HMAC_KEY must be 64 hex chars");

    let mailer = Mailer::smtp(MailerConfig {
        host: env_or("SMTP_HOST", "localhost"),
        port: env_or("SMTP_PORT", "1025").parse().expect("SMTP_PORT must be u16"),
        user: env_or("SMTP_USER", ""),
        password: env_or("SMTP_PASSWORD", ""),
        from: env_or("SMTP_FROM", "ALARTIC <noreply@alartic.fr>"),
        use_tls: env_or("SMTP_TLS", "false") == "true",
    })
    .expect("Mailer init");

    let base_url = env_or("ALARTIC_BASE_URL", "http://localhost:3000");
    let front_url = env_or("ALARTIC_FRONT_URL", &base_url);
    let secure_cookie = env_or("ALARTIC_SECURE_COOKIE", "false") == "true";

    // CORS — uniquement actif si `ALARTIC_CORS_ORIGIN` est set (dev front sur
    // port distinct). En prod, front et back sont sur le même domaine via
    // Caddy, donc CORS n'est pas nécessaire.
    let cors_layer = std::env::var("ALARTIC_CORS_ORIGIN")
        .ok()
        .and_then(|origin| origin.parse::<HeaderValue>().ok())
        .map(|origin| {
            CorsLayer::new()
                .allow_origin(AllowOrigin::exact(origin))
                .allow_credentials(true)
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::PATCH,
                    Method::DELETE,
                    Method::OPTIONS,
                ])
                .allow_headers([CONTENT_TYPE, HeaderName::from_static("x-csrf-token")])
        })
        .unwrap_or_default();

    let pool = db::make_pool(&database_url)
        .await
        .expect("Failed to connect to Postgres — is `npm run db:up` running ?");
    info!("Postgres pool ready");

    db::migrate(&pool)
        .await
        .expect("Failed to apply migrations");
    info!("Migrations applied");

    purge::spawn(pool.clone());
    info!("Purge job spawned");

    // Catalogue produits — chargé depuis Decap. Path par défaut résolu relatif
    // au workspace en dev ; surchargé via env en prod (image distroless).
    let products_dir = std::env::var("ALARTIC_PRODUCTS_DIR").unwrap_or_else(|_| {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("web")
            .join("content")
            .join("products")
            .to_string_lossy()
            .into_owned()
    });
    let catalog = products::load_from_dir(std::path::Path::new(&products_dir))
        .expect("Failed to load product catalog");

    // Client Payplug. La clé sk_test_* fonctionne pour développer le tunnel
    // sans déclencher de vrais débits. En prod : sk_live_* via secrets manager.
    let payplug_secret = std::env::var("PAYPLUG_SECRET_KEY")
        .expect("PAYPLUG_SECRET_KEY must be set (sk_test_* en dev, sk_live_* en prod)");
    let payplug = PayplugClient::new(payplug_secret).expect("Payplug client init");
    if payplug.is_test_mode() {
        info!("Payplug en mode TEST (sk_test_*) — aucun débit réel");
    }

    let seller = SellerInfo::from_env();

    let state = AppState::new(
        pool,
        master_key,
        email_hmac_key,
        mailer,
        base_url,
        front_url,
        secure_cookie,
        cors_layer,
        catalog,
        payplug,
        seller,
    );

    let app = build_app(state);

    let port: u16 = std::env::var("ALARTIC_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    // Bind 127.0.0.1 uniquement — Caddy fait le reverse proxy public en prod.
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind TCP listener");

    info!("ALARTIC API listening on http://{addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server error");

    info!("Shutdown complete");
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,alartic_api=debug,tower_http=info".into());

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .compact()
        .init();
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to install Ctrl+C handler");
    info!("Shutdown signal received");
}
