//! Tests d'intégration — audit log + purge RGPD.

mod common;

use alartic_api::{build_app, purge};
use axum::{body::Body, http::Request};
use sqlx::PgPool;
use tower::ServiceExt;

#[sqlx::test(migrations = "./migrations")]
async fn consume_writes_audit_entry(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let _ = common::login(app, inbox, "victor@example.com").await;

    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_log ORDER BY created_at ASC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(actions.contains(&"auth.magic_link.consume".to_string()));
}

#[sqlx::test(migrations = "./migrations")]
async fn delete_writes_audit_entry(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "wendy@example.com").await;

    app.oneshot(
        Request::builder()
            .method("DELETE")
            .uri("/me")
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

    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log WHERE action = 'user.delete'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn rgpd_purge_marks_inactive_users(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    // Crée un user via login normal (last_login_at = NOW).
    let _ = common::login(app, inbox, "xavier@example.com").await;

    // Pour simuler 3+ ans d'inactivité, rétro-date last_login_at.
    sqlx::query(
        "UPDATE users SET last_login_at = NOW() - INTERVAL '3 years' - INTERVAL '1 day'",
    )
    .execute(&pool)
    .await
    .unwrap();

    purge::run_rgpd(&pool).await.unwrap();

    let deleted: bool =
        sqlx::query_scalar("SELECT deleted_at IS NOT NULL FROM users LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(deleted, "user inactif > 3 ans doit être soft-deleted");

    // Entrée audit créée.
    let audit_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_log WHERE action = 'user.delete.rgpd_inactivity'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_count, 1);

    // Sessions du user purgées.
    let session_count: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(session_count, 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn rgpd_purge_skips_active_users(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let _ = common::login(app, inbox, "yasmine@example.com").await;

    // last_login_at = NOW (par défaut au consume).
    purge::run_rgpd(&pool).await.unwrap();

    let deleted: bool =
        sqlx::query_scalar("SELECT deleted_at IS NOT NULL FROM users LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!deleted, "user actif ne doit PAS être supprimé");
}
