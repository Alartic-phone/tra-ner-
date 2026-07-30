//! Tests d'intégration — devis pro multi-modèles CDC §7.3.

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;

fn post_json(body: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/devis-pro")
        .header("Content-Type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn body_with_items(items: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "items": items,
        "email": "buyer@cabinet.fr",
        "contact_name": "Marie Curie",
        "company_name": "Cabinet Curie & Associés",
        "siret": "12345678901234",
        "phone": "+33 1 23 45 67 89",
        "message": "Équipe avocats + juniors + tablettes meetings.",
        "consent": true,
    })
}

#[sqlx::test(migrations = "./migrations")]
async fn happy_path_multi_items(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = alartic_api::build_app(state);

    let body = body_with_items(serde_json::json!([
        {"product_slug": "pixel-9", "color_slug": "obsidian", "storage_slug": "128go", "quantity": 3},
        {"product_slug": "pixel-9-pro", "color_slug": "obsidian", "storage_slug": "256go", "quantity": 2},
    ]));

    let resp = app.oneshot(post_json(&body.to_string())).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let parent_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dispatch_requests")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(parent_count, 1);
    let items_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dispatch_request_items")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(items_count, 2);

    let total: Option<i32> =
        sqlx::query_scalar("SELECT quantity FROM dispatch_requests LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(total, Some(5));

    let sent = inbox.lock().await;
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].to, "pro@alartic.fr");
    assert!(sent[0].subject.contains("5 unités"));
    assert!(sent[0].subject.contains("2 ligne(s)"));
    assert!(sent[0].body.contains("Pixel 9"));
    assert!(sent[0].body.contains("Pixel 9 Pro"));
    assert!(sent[0].body.contains("3 ×"));
    assert!(sent[0].body.contains("2 ×"));
}

#[sqlx::test(migrations = "./migrations")]
async fn single_item_works_if_quantity_meets_min(pool: PgPool) {
    let (state, _) = common::make_state(pool.clone());
    let app = alartic_api::build_app(state);

    let body = body_with_items(serde_json::json!([
        {"product_slug": "pixel-9", "color_slug": "obsidian", "storage_slug": "128go", "quantity": 10},
    ]));

    let resp = app.oneshot(post_json(&body.to_string())).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[sqlx::test(migrations = "./migrations")]
async fn rejects_total_below_5(pool: PgPool) {
    let (state, _) = common::make_state(pool);
    let app = alartic_api::build_app(state);

    let body = body_with_items(serde_json::json!([
        {"product_slug": "pixel-9", "color_slug": "obsidian", "storage_slug": "128go", "quantity": 2},
        {"product_slug": "pixel-9-pro", "color_slug": "obsidian", "storage_slug": "256go", "quantity": 2},
    ]));

    let resp = app.oneshot(post_json(&body.to_string())).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    assert!(String::from_utf8_lossy(&body).contains("quantity_too_low"));
}

#[sqlx::test(migrations = "./migrations")]
async fn rejects_unknown_variant(pool: PgPool) {
    let (state, _) = common::make_state(pool);
    let app = alartic_api::build_app(state);

    let body = body_with_items(serde_json::json!([
        {"product_slug": "pixel-9", "color_slug": "doesnotexist", "storage_slug": "128go", "quantity": 10},
    ]));

    let resp = app.oneshot(post_json(&body.to_string())).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    assert!(String::from_utf8_lossy(&body).contains("unknown_variant"));
}

#[sqlx::test(migrations = "./migrations")]
async fn rejects_empty_items(pool: PgPool) {
    let (state, _) = common::make_state(pool);
    let app = alartic_api::build_app(state);

    let body = body_with_items(serde_json::json!([]));

    let resp = app.oneshot(post_json(&body.to_string())).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn rejects_missing_consent(pool: PgPool) {
    let (state, _) = common::make_state(pool);
    let app = alartic_api::build_app(state);

    let mut body = body_with_items(serde_json::json!([
        {"product_slug": "pixel-9", "color_slug": "obsidian", "storage_slug": "128go", "quantity": 10},
    ]));
    body["consent"] = serde_json::json!(false);

    let resp = app.oneshot(post_json(&body.to_string())).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    assert!(String::from_utf8_lossy(&body).contains("consent_required"));
}

#[sqlx::test(migrations = "./migrations")]
async fn rejects_invalid_siret(pool: PgPool) {
    let (state, _) = common::make_state(pool);
    let app = alartic_api::build_app(state);

    let mut body = body_with_items(serde_json::json!([
        {"product_slug": "pixel-9", "color_slug": "obsidian", "storage_slug": "128go", "quantity": 10},
    ]));
    body["siret"] = serde_json::json!("12345");

    let resp = app.oneshot(post_json(&body.to_string())).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn honeypot_silent_ok(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = alartic_api::build_app(state);

    let mut body = body_with_items(serde_json::json!([
        {"product_slug": "pixel-9", "color_slug": "obsidian", "storage_slug": "128go", "quantity": 10},
    ]));
    body["website"] = serde_json::json!("http://spammer.example");

    let resp = app.oneshot(post_json(&body.to_string())).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dispatch_requests")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0);
    assert!(inbox.lock().await.is_empty());
}
