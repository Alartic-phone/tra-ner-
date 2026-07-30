//! Tests d'intégration — tickets SAV.

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

fn auth_post(uri: &str, session: &str, csrf: &str, body: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header(
            "cookie",
            format!("alartic_session={session}; alartic_csrf={csrf}"),
        )
        .header("X-CSRF-Token", csrf)
        .header("Content-Type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn auth_get(uri: &str, session: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header("cookie", format!("alartic_session={session}"))
        .body(Body::empty())
        .unwrap()
}

#[sqlx::test(migrations = "./migrations")]
async fn create_ticket_persists_subject_and_first_message(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "oscar@example.com").await;

    let resp = app
        .clone()
        .oneshot(auth_post(
            "/me/tickets",
            &session,
            &csrf,
            r#"{"category":"question","subject":"Problème écran","body":"Mon Pixel a un défaut d'affichage côté gauche."}"#,
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let ticket_id = json["id"].as_str().unwrap();

    let ticket_count: i64 = sqlx::query_scalar("SELECT count(*) FROM tickets")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(ticket_count, 1);

    let msg_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM ticket_messages WHERE ticket_id = $1::uuid")
            .bind(ticket_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(msg_count, 1);

    // Sujet bien chiffré (pas en clair).
    let subject_blob: Vec<u8> =
        sqlx::query_scalar("SELECT subject_encrypted FROM tickets LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!subject_blob.windows(8).any(|w| w == b"Probl\xc3\xa8m" || w == b"ecran"));
}

#[sqlx::test(migrations = "./migrations")]
async fn detail_returns_decrypted_subject_and_messages(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "paul@example.com").await;

    let create_resp = app
        .clone()
        .oneshot(auth_post(
            "/me/tickets",
            &session,
            &csrf,
            r#"{"category":"garantie","subject":"Demande de garantie","body":"Mon appareil ne charge plus depuis ce matin."}"#,
        ))
        .await
        .unwrap();
    let body = create_resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let ticket_id = json["id"].as_str().unwrap().to_string();

    let resp = app
        .oneshot(auth_get(&format!("/me/tickets/{ticket_id}"), &session))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(json["subject"], "Demande de garantie");
    assert_eq!(json["category"], "garantie");
    assert_eq!(json["status"], "open");
    assert_eq!(json["messages"].as_array().unwrap().len(), 1);
    assert_eq!(json["messages"][0]["sender"], "user");
    assert_eq!(
        json["messages"][0]["body"],
        "Mon appareil ne charge plus depuis ce matin."
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn reply_appends_user_message(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "quentin@example.com").await;

    let resp = app
        .clone()
        .oneshot(auth_post(
            "/me/tickets",
            &session,
            &csrf,
            r#"{"category":"probleme_technique","subject":"Bug app","body":"L'app crash au lancement."}"#,
        ))
        .await
        .unwrap();
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let ticket_id = serde_json::from_slice::<Value>(&body).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();

    let resp = app
        .oneshot(auth_post(
            &format!("/me/tickets/{ticket_id}/messages"),
            &session,
            &csrf,
            r#"{"body":"Précision : seulement sous Wi-Fi public."}"#,
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM ticket_messages WHERE ticket_id = $1::uuid",
    )
    .bind(&ticket_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 2);
}

#[sqlx::test(migrations = "./migrations")]
async fn another_user_cannot_read_someones_ticket(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session_a, csrf_a) = common::login(app.clone(), inbox.clone(), "raj@example.com").await;
    let (session_b, _csrf_b) = common::login(app.clone(), inbox, "sara@example.com").await;

    let resp = app
        .clone()
        .oneshot(auth_post(
            "/me/tickets",
            &session_a,
            &csrf_a,
            r#"{"category":"autre","subject":"Question privée","body":"Contenu réservé."}"#,
        ))
        .await
        .unwrap();
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let ticket_id = serde_json::from_slice::<Value>(&body).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();

    // User B essaie de lire le ticket de A → 404 (pas 403 pour ne pas révéler
    // l'existence du ticket — anti-énumération).
    let resp = app
        .clone()
        .oneshot(auth_get(&format!("/me/tickets/{ticket_id}"), &session_b))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // Et B ne le voit pas non plus dans son listing.
    let resp = app
        .oneshot(auth_get("/me/tickets", &session_b))
        .await
        .unwrap();
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json.as_array().unwrap().len(), 0);
}

#[sqlx::test(migrations = "./migrations")]
async fn create_rejects_invalid_category(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "tom@example.com").await;

    let resp = app
        .oneshot(auth_post(
            "/me/tickets",
            &session,
            &csrf,
            r#"{"category":"hack_attempt","subject":"Test","body":"Should not pass."}"#,
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn list_returns_tickets_sorted_by_updated_desc(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "uma@example.com").await;

    for i in 0..3 {
        let resp = app
            .clone()
            .oneshot(auth_post(
                "/me/tickets",
                &session,
                &csrf,
                &format!(
                    r#"{{"category":"question","subject":"Ticket {i}","body":"Contenu {i}"}}"#
                ),
            ))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::CREATED);
    }

    let resp = app
        .oneshot(auth_get("/me/tickets", &session))
        .await
        .unwrap();
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let arr = json.as_array().unwrap();
    assert_eq!(arr.len(), 3);

    // Le plus récent en premier.
    assert_eq!(arr[0]["subject"], "Ticket 2");
    assert_eq!(arr[2]["subject"], "Ticket 0");
}
