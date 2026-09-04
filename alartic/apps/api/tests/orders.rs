//! Tests d'intégration — tunnel d'achat (CDC §9.1).
//!
//! Le client Payplug n'est PAS mocké : les tests négatifs (validation,
//! auth, panier vide, etc.) sont déclenchés AVANT l'appel HTTP réel, et les
//! tests positifs jusqu'au bout sont laissés à la validation manuelle via
//! l'UI avec la clé sk_test_*. La création réelle de payment Payplug fera
//! l'objet de tests E2E en J5 (CDC §15.4).

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;

fn json_post(uri: &str, body: &str, session: &str, csrf: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("Content-Type", "application/json")
        .header(
            "Cookie",
            format!("alartic_session={session}; alartic_csrf={csrf}"),
        )
        .header("X-CSRF-Token", csrf)
        .body(Body::from(body.to_string()))
        .unwrap()
}

#[sqlx::test(migrations = "./migrations")]
async fn checkout_requires_auth(pool: PgPool) {
    let (state, _) = common::make_state(pool);
    let app = alartic_api::build_app(state);

    let resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/orders/checkout")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"items":[]}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    // CSRF middleware répond avant le handler → 403. Et même avec CSRF posé,
    // l'absence de session → 401. Ici on vérifie juste que ce n'est PAS un 2xx.
    assert!(
        resp.status() == StatusCode::FORBIDDEN || resp.status() == StatusCode::UNAUTHORIZED,
        "got {}",
        resp.status()
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn checkout_rejects_empty_cart(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = alartic_api::build_app(state);
    let (session, csrf) = common::login(app.clone(), inbox, "alice@example.com").await;

    let body = serde_json::json!({
        "items": [],
        "customer": {
            "email": "alice@example.com",
            "first_name": "Alice",
            "last_name": "Dupont",
        },
        "billing_address": {
            "address1": "1 rue de la Paix",
            "postcode": "75001",
            "city": "Paris",
            "country": "FR",
        },
        "is_pro": false,
        "cgv_accepted": true,
    });

    let resp = app
        .oneshot(json_post(
            "/orders/checkout",
            &body.to_string(),
            &session,
            &csrf,
        ))
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn checkout_rejects_unaccepted_cgv(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = alartic_api::build_app(state);
    let (session, csrf) = common::login(app.clone(), inbox, "bob@example.com").await;

    let body = serde_json::json!({
        "items": [{
            "product_slug": "pixel-9",
            "color_slug": "obsidian",
            "storage_slug": "128go",
            "qty": 1,
        }],
        "customer": {
            "email": "bob@example.com",
            "first_name": "Bob",
            "last_name": "Martin",
        },
        "billing_address": {
            "address1": "1 rue de la Paix",
            "postcode": "75001",
            "city": "Paris",
            "country": "FR",
        },
        "is_pro": false,
        "cgv_accepted": false,
    });

    let resp = app
        .oneshot(json_post(
            "/orders/checkout",
            &body.to_string(),
            &session,
            &csrf,
        ))
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let body_str = String::from_utf8_lossy(&body);
    assert!(body_str.contains("cgv_required"));
}

#[sqlx::test(migrations = "./migrations")]
async fn checkout_rejects_unknown_variant(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = alartic_api::build_app(state);
    let (session, csrf) = common::login(app.clone(), inbox, "carol@example.com").await;

    let body = serde_json::json!({
        "items": [{
            "product_slug": "pixel-9",
            "color_slug": "doesnotexist",
            "storage_slug": "128go",
            "qty": 1,
        }],
        "customer": {
            "email": "carol@example.com",
            "first_name": "Carol",
            "last_name": "Lopez",
        },
        "billing_address": {
            "address1": "1 rue de la Paix",
            "postcode": "75001",
            "city": "Paris",
            "country": "FR",
        },
        "is_pro": false,
        "cgv_accepted": true,
    });

    let resp = app
        .oneshot(json_post(
            "/orders/checkout",
            &body.to_string(),
            &session,
            &csrf,
        ))
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let body_str = String::from_utf8_lossy(&body);
    assert!(body_str.contains("unknown_variant"));
}

#[sqlx::test(migrations = "./migrations")]
async fn checkout_rejects_non_fr_country(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = alartic_api::build_app(state);
    let (session, csrf) = common::login(app.clone(), inbox, "dave@example.com").await;

    let body = serde_json::json!({
        "items": [{
            "product_slug": "pixel-9",
            "color_slug": "obsidian",
            "storage_slug": "128go",
            "qty": 1,
        }],
        "customer": {
            "email": "dave@example.com",
            "first_name": "Dave",
            "last_name": "Smith",
        },
        "billing_address": {
            "address1": "1 Downing Street",
            "postcode": "SW1A 2AA",
            "city": "London",
            "country": "GB",
        },
        "is_pro": false,
        "cgv_accepted": true,
    });

    let resp = app
        .oneshot(json_post(
            "/orders/checkout",
            &body.to_string(),
            &session,
            &csrf,
        ))
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let body_str = String::from_utf8_lossy(&body);
    assert!(body_str.contains("country_not_supported"));
}

#[sqlx::test(migrations = "./migrations")]
async fn checkout_b2b_requires_siret_and_company(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = alartic_api::build_app(state);
    let (session, csrf) = common::login(app.clone(), inbox, "eve@example.com").await;

    let body = serde_json::json!({
        "items": [{
            "product_slug": "pixel-9",
            "color_slug": "obsidian",
            "storage_slug": "128go",
            "qty": 1,
        }],
        "customer": {
            "email": "eve@example.com",
            "first_name": "Eve",
            "last_name": "Doe",
        },
        "billing_address": {
            "address1": "1 rue de la Paix",
            "postcode": "75001",
            "city": "Paris",
            "country": "FR",
        },
        "is_pro": true,
        "cgv_accepted": true,
    });

    let resp = app
        .oneshot(json_post(
            "/orders/checkout",
            &body.to_string(),
            &session,
            &csrf,
        ))
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn get_order_returns_404_for_unknown_id(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = alartic_api::build_app(state);
    let (session, csrf) = common::login(app.clone(), inbox, "frank@example.com").await;

    let resp = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/me/orders/00000000-0000-0000-0000-000000000000")
                .header(
                    "Cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

// ───────────────────────── Tests facture PDF ─────────────────────────

/// Insère directement une order `paid` + 1 item pour le `user_id` donné, avec
/// un numéro de facture attribué via `nextval('invoice_seq')`. Les champs
/// chiffrés sont remplis avec les bytes que le state de test peut déchiffrer
/// (master_key = [0x11;32]).
async fn insert_paid_order(
    pool: &PgPool,
    state: &alartic_api::state::AppState,
    user_id: uuid::Uuid,
) -> uuid::Uuid {
    use alartic_api::crypto;
    let key = &state.master_key;
    let email_enc = crypto::encrypt_string(key, "alice@example.com").unwrap();
    let first_enc = crypto::encrypt_string(key, "Alice").unwrap();
    let last_enc = crypto::encrypt_string(key, "Dupont").unwrap();
    let addr_json = r#"{"address1":"1 rue de la Paix","postcode":"75001","city":"Paris","country":"FR"}"#;
    let addr_enc = crypto::encrypt_string(key, addr_json).unwrap();
    let email_hash = crypto::email_hash(&state.email_hmac_key, "alice@example.com");

    let cgv_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT id FROM cgv_versions WHERE slug='cgv' ORDER BY version DESC LIMIT 1",
    )
    .fetch_one(pool)
    .await
    .unwrap();

    let order_id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO orders (
            user_id, email_hash, email_encrypted,
            first_name_encrypted, last_name_encrypted,
            billing_address_encrypted,
            subtotal_cents, shipping_cents, total_cents,
            status, paid_at, invoice_number, invoiced_at,
            cgv_version_id, payment_method
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            'paid', NOW(), nextval('invoice_seq'), NOW(),
            $10, 'payplug'
         ) RETURNING id",
    )
    .bind(user_id)
    .bind(&email_hash[..])
    .bind(&email_enc[..])
    .bind(&first_enc[..])
    .bind(&last_enc[..])
    .bind(&addr_enc[..])
    .bind(89900_i64)
    .bind(0_i64)
    .bind(89900_i64)
    .bind(cgv_id)
    .fetch_one(pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO order_items (
            order_id, product_slug, product_name,
            variant_color_slug, variant_color_name,
            variant_storage_slug, variant_storage_label,
            unit_price_cents, qty, line_total_cents
         ) VALUES ($1, 'pixel-9', 'Pixel 9',
                   'obsidian', 'Obsidian',
                   '128go', '128 Go',
                   89900, 1, 89900)",
    )
    .bind(order_id)
    .execute(pool)
    .await
    .unwrap();

    order_id
}

async fn user_id_of(pool: &PgPool, state: &alartic_api::state::AppState, email: &str) -> uuid::Uuid {
    use alartic_api::crypto;
    let h = crypto::email_hash(&state.email_hmac_key, email);
    sqlx::query_scalar("SELECT id FROM users WHERE email_hash = $1")
        .bind(&h[..])
        .fetch_one(pool)
        .await
        .unwrap()
}

#[sqlx::test(migrations = "./migrations")]
async fn invoice_endpoint_serves_pdf(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = alartic_api::build_app(state.clone());
    let (session, csrf) = common::login(app.clone(), inbox, "alice@example.com").await;
    let user_id = user_id_of(&pool, &state, "alice@example.com").await;
    let order_id = insert_paid_order(&pool, &state, user_id).await;

    let resp = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/me/orders/{order_id}/invoice"))
                .header(
                    "Cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(
        resp.headers().get("content-type").unwrap(),
        "application/pdf"
    );
    let cd = resp
        .headers()
        .get("content-disposition")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(cd.contains("attachment"));
    assert!(cd.contains("ALARTIC-"), "filename should embed invoice number, got {cd}");

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    assert!(body.starts_with(b"%PDF-"), "PDF magic missing");
    assert!(body.len() > 1000);
}

#[sqlx::test(migrations = "./migrations")]
async fn invoice_endpoint_blocks_other_user(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = alartic_api::build_app(state.clone());

    // Alice crée une commande
    let (_, _) = common::login(app.clone(), inbox.clone(), "alice@example.com").await;
    let alice_id = user_id_of(&pool, &state, "alice@example.com").await;
    let order_id = insert_paid_order(&pool, &state, alice_id).await;

    // Bob se connecte et essaie d'accéder
    let (session, csrf) = common::login(app.clone(), inbox, "bob@example.com").await;

    let resp = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/me/orders/{order_id}/invoice"))
                .header(
                    "Cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "./migrations")]
async fn invoice_endpoint_returns_404_without_invoice_number(pool: PgPool) {
    use alartic_api::crypto;
    let (state, inbox) = common::make_state(pool.clone());
    let app = alartic_api::build_app(state.clone());
    let (session, csrf) = common::login(app.clone(), inbox, "alice@example.com").await;
    let user_id = user_id_of(&pool, &state, "alice@example.com").await;

    // Order pending — pas de numéro attribué
    let key = &state.master_key;
    let email_enc = crypto::encrypt_string(key, "alice@example.com").unwrap();
    let first_enc = crypto::encrypt_string(key, "Alice").unwrap();
    let last_enc = crypto::encrypt_string(key, "Dupont").unwrap();
    let addr_enc = crypto::encrypt_string(
        key,
        r#"{"address1":"1 rue","postcode":"75001","city":"Paris","country":"FR"}"#,
    )
    .unwrap();
    let email_hash = crypto::email_hash(&state.email_hmac_key, "alice@example.com");
    let cgv_id: uuid::Uuid = sqlx::query_scalar(
        "SELECT id FROM cgv_versions WHERE slug='cgv' ORDER BY version DESC LIMIT 1",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let order_id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO orders (
            user_id, email_hash, email_encrypted,
            first_name_encrypted, last_name_encrypted,
            billing_address_encrypted,
            subtotal_cents, shipping_cents, total_cents,
            cgv_version_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $7, $8) RETURNING id",
    )
    .bind(user_id)
    .bind(&email_hash[..])
    .bind(&email_enc[..])
    .bind(&first_enc[..])
    .bind(&last_enc[..])
    .bind(&addr_enc[..])
    .bind(89900_i64)
    .bind(cgv_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    let resp = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/me/orders/{order_id}/invoice"))
                .header(
                    "Cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "./migrations")]
async fn order_view_exposes_invoice_number_when_attributed(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = alartic_api::build_app(state.clone());
    let (session, csrf) = common::login(app.clone(), inbox, "alice@example.com").await;
    let user_id = user_id_of(&pool, &state, "alice@example.com").await;
    let order_id = insert_paid_order(&pool, &state, user_id).await;

    let resp = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/me/orders/{order_id}"))
                .header(
                    "Cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let n = v["invoice_number"].as_str().expect("invoice_number string");
    assert!(n.starts_with("ALARTIC-"), "got {n}");
    assert!(v["invoiced_at"].is_string());
}

#[sqlx::test(migrations = "./migrations")]
async fn webhook_with_unknown_payment_id_returns_200(pool: PgPool) {
    // Le webhook va essayer de re-fetch via Payplug API. Avec une clé factice,
    // l'appel échoue → on renvoie 400 "payment_not_verified".
    // Ce test est plus une garantie qu'aucune route ne plante.
    let (state, _) = common::make_state(pool);
    let app = alartic_api::build_app(state);

    let resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/payments/payplug/webhook")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"id":"pay_doesnotexist","object":"payment","is_live":false}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Soit 400 (fetch échoué), soit 200 si on a déjà court-circuité. Tant que
    // ce n'est pas 5xx, la route n'a pas planté.
    assert!(
        resp.status().is_client_error() || resp.status().is_success(),
        "webhook should not 5xx, got {}",
        resp.status()
    );
}
