//! Tests d'intégration — magic link CDC §10.2.
//!
//! Sont validés ici :
//! - Création silencieuse du user + persistance du token + envoi du mail
//! - Consommation valide → 200, suppression du token, last_login_at MAJ
//! - Token expiré → 401, row pas supprimé
//! - Token déjà consommé → 401
//! - Token invalide (base64 cassé / mauvaise longueur / hash inconnu) → 401
//! - Rate-limit 3 demandes / 15 min / email

mod common;

use alartic_api::{build_app, crypto};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use chrono::Utc;
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;

const MIGRATIONS: &str = "./migrations";

fn json_post(uri: &str, body: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("Content-Type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

#[sqlx::test(migrations = "./migrations")]
async fn request_creates_token_and_sends_mail(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let resp = app
        .oneshot(json_post(
            "/auth/magic-link/request",
            r#"{"email":"alice@example.com","purpose":"signup"}"#,
        ))
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);

    let token_count: i64 = sqlx::query_scalar("SELECT count(*) FROM magic_link_tokens")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(token_count, 1);

    let user_count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(user_count, 1);

    let sent = inbox.lock().await;
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].to, "alice@example.com");
    assert!(sent[0].link().unwrap().contains("/auth/magic-link/consume/"));
}

#[sqlx::test(migrations = "./migrations")]
async fn consume_valid_token_redirects_with_cookies(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    app.clone()
        .oneshot(json_post(
            "/auth/magic-link/request",
            r#"{"email":"bob@example.com","purpose":"signup"}"#,
        ))
        .await
        .unwrap();

    let link = inbox.lock().await[0].link().expect("link present");
    let token = link.rsplit('/').next().unwrap().to_string();

    let resp = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/auth/magic-link/consume/{token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // 303 See Other vers le front /compte.
    assert_eq!(resp.status(), StatusCode::SEE_OTHER);
    let location = resp.headers().get("location").unwrap().to_str().unwrap();
    assert!(location.ends_with("/compte"), "Location = {location}");

    // Cookies de session + CSRF posés sur la redirection.
    let cookies: Vec<_> = resp.headers().get_all("set-cookie").iter().collect();
    assert_eq!(cookies.len(), 2);
    assert!(cookies.iter().any(|c| c.to_str().unwrap().contains("alartic_session=")));
    assert!(cookies.iter().any(|c| c.to_str().unwrap().contains("alartic_csrf=")));

    // Token supprimé (usage unique).
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM magic_link_tokens")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);

    // last_login_at mis à jour.
    let last_login: Option<chrono::DateTime<Utc>> =
        sqlx::query_scalar("SELECT last_login_at FROM users LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(last_login.is_some());
}

#[sqlx::test(migrations = "./migrations")]
async fn consume_already_used_token_returns_401(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    app.clone()
        .oneshot(json_post(
            "/auth/magic-link/request",
            r#"{"email":"charlie@example.com","purpose":"signup"}"#,
        ))
        .await
        .unwrap();

    let token = inbox.lock().await[0]
        .link()
        .expect("link")
        .rsplit('/')
        .next()
        .unwrap()
        .to_string();

    let first = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/auth/magic-link/consume/{token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::SEE_OTHER);

    let second = app
        .oneshot(
            Request::builder()
                .uri(format!("/auth/magic-link/consume/{token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(second.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn consume_invalid_token_returns_401(pool: PgPool) {
    let (state, _inbox) = common::make_state(pool);
    let app = build_app(state);

    let resp = app
        .oneshot(
            Request::builder()
                .uri("/auth/magic-link/consume/totally_fake_token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn consume_expired_token_returns_401(pool: PgPool) {
    let (state, _inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    // Génère un token "à la main", insère le hash avec expires_at dans le passé.
    let (token_clear, token_hash) = crypto::generate_token();
    let email_hash = crypto::email_hash(&[0x22; 32], "dany@example.com");
    let encrypted = crypto::encrypt_string(&[0x11; 32], "dany@example.com").unwrap();
    sqlx::query("INSERT INTO users (email_hash, email_encrypted) VALUES ($1, $2)")
        .bind(&email_hash[..])
        .bind(&encrypted)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO magic_link_tokens (token_hash, email_hash, expires_at)
         VALUES ($1, $2, NOW() - INTERVAL '1 minute')",
    )
    .bind(&token_hash[..])
    .bind(&email_hash[..])
    .execute(&pool)
    .await
    .unwrap();

    let resp = app
        .oneshot(
            Request::builder()
                .uri(format!("/auth/magic-link/consume/{token_clear}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    // Le row n'est PAS supprimé par la consommation (le DELETE ne match pas
    // car expires_at < NOW()). Il sera nettoyé par le job de purge.
    let still_there: i64 =
        sqlx::query_scalar("SELECT count(*) FROM magic_link_tokens")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(still_there, 1);
}

#[sqlx::test(migrations = "./migrations")]
async fn rate_limit_blocks_after_three_requests(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    for _ in 0..5 {
        let resp = app
            .clone()
            .oneshot(json_post(
                "/auth/magic-link/request",
                r#"{"email":"eve@example.com","purpose":"signup"}"#,
            ))
            .await
            .unwrap();
        // Toujours 200 (anti-énumération), mais les 2 dernières sont silencieuses.
        assert_eq!(resp.status(), StatusCode::OK);
    }

    let sent_count = inbox.lock().await.len();
    assert_eq!(sent_count, 3, "rate-limit must cap at 3 emails / window");

    let token_count: i64 = sqlx::query_scalar("SELECT count(*) FROM magic_link_tokens")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(token_count, 3, "rate-limit must cap at 3 DB rows / window");

    // Touche au pour éviter dead_code sur MIGRATIONS si pas utilisé ailleurs.
    let _ = MIGRATIONS;
}

#[sqlx::test(migrations = "./migrations")]
async fn request_invalid_email_returns_400(pool: PgPool) {
    let (state, _) = common::make_state(pool);
    let app = build_app(state);

    let resp = app
        .oneshot(json_post(
            "/auth/magic-link/request",
            r#"{"email":"not-an-email","purpose":"signup"}"#,
        ))
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let text = std::str::from_utf8(&body).unwrap();
    assert!(text.contains("error"));
}
