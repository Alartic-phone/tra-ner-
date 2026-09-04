//! Tests d'intégration — espace client (`/me/*`).

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
async fn profile_without_cookie_returns_401(pool: PgPool) {
    let (state, _) = common::make_state(pool);
    let app = build_app(state);

    let resp = app
        .oneshot(
            Request::builder()
                .uri("/me/profile")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn profile_returns_decrypted_email(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, _csrf) = common::login(app.clone(), inbox, "kim@example.com").await;

    let resp = app
        .oneshot(
            Request::builder()
                .uri("/me/profile")
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["email"], "kim@example.com");
    assert_eq!(json["is_pro"], false);
    assert_eq!(json["is_admin"], false);
    assert!(json["suspended_at"].is_null());
    assert!(json["created_at"].is_string());
}

#[sqlx::test(migrations = "./migrations")]
async fn suspend_invalidates_session_and_blocks_profile(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "leo@example.com").await;

    // Suspend
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/me/suspend")
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

    // suspended_at posé en DB.
    let suspended: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT suspended_at FROM users LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(suspended.is_some());

    // Sessions purgées.
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);

    // Ancien cookie inutilisable.
    let resp = app
        .oneshot(
            Request::builder()
                .uri("/me/profile")
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn delete_marks_user_and_invalidates_session(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "mia@example.com").await;

    let resp = app
        .clone()
        .oneshot(
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
    assert_eq!(resp.status(), StatusCode::OK);

    // deleted_at posé.
    let deleted: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT deleted_at FROM users LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(deleted.is_some());

    // Sessions purgées.
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);

    // Le cookie de l'ancienne session ne sert plus.
    let resp = app
        .oneshot(
            Request::builder()
                .uri("/me/profile")
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn export_returns_full_user_payload(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "zoe@example.com").await;

    // Crée un ticket pour qu'on l'ait dans l'export.
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/me/tickets")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .header("X-CSRF-Token", &csrf)
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"category":"question","subject":"Demande export","body":"Test du flux export."}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let resp = app
        .oneshot(
            Request::builder()
                .uri("/me/export")
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
    assert!(resp
        .headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.starts_with("attachment; filename="))
        .unwrap_or(false));

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["export_format"], "alartic-rgpd-v1");
    assert_eq!(json["profile"]["email"], "zoe@example.com");
    assert_eq!(json["tickets"].as_array().unwrap().len(), 1);
    assert_eq!(json["tickets"][0]["subject"], "Demande export");
    assert_eq!(
        json["tickets"][0]["messages"][0]["body"],
        "Test du flux export."
    );
    // Audit log doit contenir au moins le consume + ticket.create.
    assert!(json["audit_log"].as_array().unwrap().len() >= 2);
}

#[sqlx::test(migrations = "./migrations")]
async fn change_email_creates_pending_token_no_immediate_update(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox.clone(), "old@example.com").await;

    // Demande de change vers un nouvel email.
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/me/email")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .header("X-CSRF-Token", &csrf)
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"new_email":"new@example.com"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "confirmation_sent");

    // PAS d'UPDATE de users : l'email_hash reste celui d'old@.
    let profile_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/me/profile")
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(profile_resp.status(), StatusCode::OK);
    let body = profile_resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["email"], "old@example.com", "email pas encore changé");

    // Sessions intactes (1 = la courante).
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);

    // Un email_change_token créé.
    let tok_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM email_change_tokens")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(tok_count, 1);

    // Mail envoyé au NOUVEL email.
    let sent = inbox.lock().await;
    let last = sent.last().unwrap();
    assert_eq!(last.to, "new@example.com");
    assert!(last.link().unwrap().contains("/auth/email-change/confirm/"));
}

#[sqlx::test(migrations = "./migrations")]
async fn confirm_email_change_applies_update_and_invalidates_sessions(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox.clone(), "before@example.com").await;

    // Demande de change.
    app.clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/me/email")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .header("X-CSRF-Token", &csrf)
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"new_email":"after@example.com"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    // Extraire le token du mail.
    let confirm_link = {
        let sent = inbox.lock().await;
        sent.last().unwrap().link().expect("link present")
    };
    let token = confirm_link.rsplit('/').next().unwrap().to_string();

    // Click sur le lien de confirmation.
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/auth/email-change/confirm/{token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::SEE_OTHER);
    let location = resp.headers().get("location").unwrap().to_str().unwrap();
    assert!(location.contains("/compte"), "Location = {location}");

    // Cookies posés immédiatement (nouvelle session, pas de re-login requis).
    let cookies: Vec<_> = resp.headers().get_all("set-cookie").iter().collect();
    assert!(cookies.iter().any(|c| c.to_str().unwrap().starts_with("alartic_session=")
        && !c.to_str().unwrap().contains("Max-Age=0")));

    // Email maintenant changé en DB.
    let user_count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(user_count, 1, "exactement 1 user en DB");

    // Anciennes sessions purgées, exactement 1 nouvelle créée.
    let session_count: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(session_count, 1, "nouvelle session active");

    // Token consommé.
    let tok_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM email_change_tokens")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(tok_count, 0);

    // Login avec le nouvel email doit retrouver le MÊME user_id (preuve que
    // c'est bien un UPDATE de la row existante, pas une création).
    let (_session2, _csrf2) = common::login(app, inbox, "after@example.com").await;
    let user_count_after: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(user_count_after, 1, "toujours 1 seul user");
}

#[sqlx::test(migrations = "./migrations")]
async fn confirm_email_change_rejects_used_token(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox.clone(), "user1@example.com").await;

    app.clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/me/email")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .header("X-CSRF-Token", &csrf)
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"new_email":"user1-new@example.com"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    let token = inbox
        .lock()
        .await
        .last()
        .unwrap()
        .link()
        .expect("link")
        .rsplit('/')
        .next()
        .unwrap()
        .to_string();

    // 1ʳᵉ consommation : 303 OK.
    let r1 = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/auth/email-change/confirm/{token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r1.status(), StatusCode::SEE_OTHER);

    // 2ᵉ tentative : 401.
    let r2 = app
        .oneshot(
            Request::builder()
                .uri(format!("/auth/email-change/confirm/{token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r2.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn change_email_rejects_same_email(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "same@example.com").await;

    let resp = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/me/email")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .header("X-CSRF-Token", &csrf)
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"new_email":"same@example.com"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn change_email_rejects_duplicate_email(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    // Crée deux users
    let (session_a, csrf_a) = common::login(app.clone(), inbox.clone(), "alice@x.com").await;
    let _ = common::login(app.clone(), inbox, "bob@x.com").await;

    // Alice tente de prendre l'email de Bob
    let resp = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/me/email")
                .header(
                    "cookie",
                    format!("alartic_session={session_a}; alartic_csrf={csrf_a}"),
                )
                .header("X-CSRF-Token", &csrf_a)
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"new_email":"bob@x.com"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn address_starts_null_and_can_be_updated(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "olga@example.com").await;

    // GET → null/null au départ
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/me/address")
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert!(json["address"].is_null());
    assert!(json["phone"].is_null());

    // PATCH → set adresse + téléphone
    let payload = serde_json::json!({
        "address": {
            "line1": "12 rue de la République",
            "postcode": "75001",
            "city": "Paris",
            "country": "FR"
        },
        "phone": "+33 6 00 00 00 00"
    });
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/me/address")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .header("X-CSRF-Token", &csrf)
                .header("Content-Type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["address"]["line1"], "12 rue de la République");
    assert_eq!(json["address"]["city"], "Paris");
    assert_eq!(json["phone"], "+33 6 00 00 00 00");

    // Vérif que stocké chiffré en DB.
    let addr_blob: Vec<u8> =
        sqlx::query_scalar("SELECT address_encrypted FROM users LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!addr_blob.windows(8).any(|w| w == b"R\xc3\xa9publi" || w == b"Paris"));
}

#[sqlx::test(migrations = "./migrations")]
async fn address_rejects_invalid_payload(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "peter@example.com").await;

    // line1 vide → 400
    let payload = serde_json::json!({
        "address": {
            "line1": "",
            "postcode": "75001",
            "city": "Paris",
            "country": "FR"
        }
    });
    let resp = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/me/address")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .header("X-CSRF-Token", &csrf)
                .header("Content-Type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn suspend_without_csrf_returns_403(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, _csrf) = common::login(app.clone(), inbox, "noah@example.com").await;

    let resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/me/suspend")
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::FORBIDDEN);
}
