//! Helpers partagés par les tests d'intégration.

#![allow(dead_code)] // les helpers sont consommés par plusieurs binaires test ; chacun n'utilise pas tout.

use alartic_api::{
    invoice::SellerInfo,
    mailer::{MailRecord, Mailer},
    payplug::PayplugClient,
    products::Catalog,
    state::AppState,
};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower::ServiceExt;
use tower_http::cors::CorsLayer;

/// Charge `.env` (à la racine du repo) une seule fois avant tout test.
/// Indispensable pour que `sqlx::test` trouve `DATABASE_URL`.
#[ctor::ctor]
fn load_dotenv() {
    let _ = dotenvy::from_path(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join(".env"),
    );
}

/// Construit un `AppState` de test avec un Mailer in-memory. Renvoie l'inbox
/// pour inspection.
///
/// Le catalogue est minimal (cf. `test_catalog`) et le client Payplug est
/// initialisé avec une clé factice — les tests positifs du tunnel d'achat
/// patchent l'AppState ou skippent la création réelle de payment.
pub fn make_state(pool: PgPool) -> (AppState, Arc<Mutex<Vec<MailRecord>>>) {
    let (mailer, inbox) = Mailer::in_memory();
    let catalog = test_catalog();
    let payplug = PayplugClient::new("sk_test_dummy_key_for_tests".into())
        .expect("payplug client should init with dummy key");
    let state = AppState::new(
        pool,
        [0x11; 32], // master_key déterministe pour reproductibilité
        [0x22; 32], // hmac_key
        mailer,
        "http://test.local".into(),
        "http://test.local".into(),
        false,
        CorsLayer::new(), // no-op : les oneshot tower ne déclenchent pas CORS
        catalog,
        payplug,
        test_seller(),
    );
    (state, inbox)
}

/// Vendeur de test déterministe — utilisé pour la génération de facture PDF
/// dans les tests d'intégration.
pub fn test_seller() -> SellerInfo {
    SellerInfo {
        name: "ALARTIC TEST".into(),
        address_line1: "1 rue du Test".into(),
        address_line2: "75000 Paris, France".into(),
        siret: "00000000000000".into(),
        tva_intra: None,
        email: "contact@test.local".into(),
        phone: None,
        website: "test.local".into(),
    }
}

/// Catalogue de test minimal : 1 produit (pixel-9), 1 couleur (obsidian),
/// 2 stockages (128go @ 899€, 256go @ 999€). Suffit pour valider la
/// résolution prix côté checkout.
pub fn test_catalog() -> Arc<Catalog> {
    // On lit directement le dossier réel apps/web/content/products pour les
    // tests — c'est rapide (~10 fichiers) et garantit qu'on teste avec le
    // vrai catalogue.
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("web")
        .join("content")
        .join("products");
    alartic_api::products::load_from_dir(&dir).expect("test catalog must load")
}

/// Effectue le parcours `request → consume` et retourne `(session_cookie_value,
/// csrf_token_value)` extraits depuis les Set-Cookie de la réponse 303.
pub async fn login(
    app: axum::Router,
    inbox: Arc<Mutex<Vec<MailRecord>>>,
    email: &str,
) -> (String, String) {
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/magic-link/request")
                .header("Content-Type", "application/json")
                .body(Body::from(format!(
                    r#"{{"email":"{email}","purpose":"signup"}}"#
                )))
                .unwrap(),
        )
        .await
        .unwrap();

    let token = {
        let sent = inbox.lock().await;
        sent.last()
            .expect("inbox should contain the magic link email")
            .link()
            .expect("magic link present in body")
            .rsplit('/')
            .next()
            .unwrap()
            .to_string()
    };

    let resp = app
        .oneshot(
            Request::builder()
                .uri(format!("/auth/magic-link/consume/{token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::SEE_OTHER);

    let mut session_cookie = None;
    let mut csrf = None;
    for h in resp.headers().get_all("set-cookie").iter() {
        if let Ok(s) = h.to_str() {
            if let Some(rest) = s.strip_prefix("alartic_session=") {
                session_cookie = rest.split(';').next().map(String::from);
            } else if let Some(rest) = s.strip_prefix("alartic_csrf=") {
                csrf = rest.split(';').next().map(String::from);
            }
        }
    }
    (session_cookie.unwrap(), csrf.unwrap())
}
