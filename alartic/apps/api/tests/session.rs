//! Tests d'intégration — sessions cookie + CSRF.

mod common;

use alartic_api::build_app;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt;

#[sqlx::test(migrations = "./migrations")]
async fn me_without_cookie_returns_401(pool: PgPool) {
    let (state, _) = common::make_state(pool);
    let app = build_app(state);

    let resp = app
        .oneshot(Request::builder().uri("/me").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn me_with_valid_cookie_returns_user(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, _csrf) = common::login(app.clone(), inbox, "fiona@example.com").await;

    let resp = app
        .oneshot(
            Request::builder()
                .uri("/me")
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert!(json["user_id"].is_string());
}

#[sqlx::test(migrations = "./migrations")]
async fn logout_without_csrf_returns_403(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, _csrf) = common::login(app.clone(), inbox, "gabe@example.com").await;

    let resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/logout")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf=any"),
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "./migrations")]
async fn logout_with_wrong_csrf_returns_403(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "hannah@example.com").await;

    let resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/logout")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .header("X-CSRF-Token", "wrong_token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::FORBIDDEN);
}

#[sqlx::test(migrations = "./migrations")]
async fn logout_with_correct_csrf_clears_session(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "iris@example.com").await;

    let count_before: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count_before, 1);

    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/logout")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .header("X-CSRF-Token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let count_after: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count_after, 0, "logout doit supprimer la session côté DB");

    // L'ancien cookie ne doit plus servir.
    let resp_me = app
        .oneshot(
            Request::builder()
                .uri("/me")
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp_me.status(), StatusCode::UNAUTHORIZED);
}
