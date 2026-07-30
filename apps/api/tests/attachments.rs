//! Tests d'intégration — pièces jointes tickets SAV.

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

const BOUNDARY: &str = "----alartic-test-boundary-XYZ";


/// Crée un ticket et renvoie `(ticket_id, first_message_id)`.
async fn create_ticket(app: &axum::Router, session: &str, csrf: &str) -> (String, String) {
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/me/tickets")
                .header(
                    "cookie",
                    format!("alartic_session={session}; alartic_csrf={csrf}"),
                )
                .header("X-CSRF-Token", csrf)
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"category":"probleme_technique","subject":"Test attach","body":"Body initial du ticket."}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    (
        json["id"].as_str().unwrap().to_string(),
        json["message_id"].as_str().unwrap().to_string(),
    )
}

/// Construit un body multipart minimal avec un seul fichier.
fn multipart_body(filename: &str, mime: &str, content: &[u8]) -> Vec<u8> {
    let head = format!(
        "--{BOUNDARY}\r\n\
         Content-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n\
         Content-Type: {mime}\r\n\r\n"
    );
    let tail = format!("\r\n--{BOUNDARY}--\r\n");
    let mut out = Vec::with_capacity(head.len() + content.len() + tail.len());
    out.extend_from_slice(head.as_bytes());
    out.extend_from_slice(content);
    out.extend_from_slice(tail.as_bytes());
    out
}

fn upload_req(
    ticket_id: &str,
    message_id: &str,
    session: &str,
    csrf: &str,
    filename: &str,
    mime: &str,
    content: &[u8],
) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(format!(
            "/me/tickets/{ticket_id}/attachments?message_id={message_id}"
        ))
        .header(
            "cookie",
            format!("alartic_session={session}; alartic_csrf={csrf}"),
        )
        .header("X-CSRF-Token", csrf)
        .header(
            "Content-Type",
            format!("multipart/form-data; boundary={BOUNDARY}"),
        )
        .body(Body::from(multipart_body(filename, mime, content)))
        .unwrap()
}

#[sqlx::test(migrations = "./migrations")]
async fn upload_persists_attachment_encrypted(pool: PgPool) {
    let (state, inbox) = common::make_state(pool.clone());
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "alice@example.com").await;
    let (ticket_id, message_id) = create_ticket(&app, &session, &csrf).await;

    let payload = b"PNGFAKE_DATA_FOR_TEST_PURPOSE";
    let resp = app
        .clone()
        .oneshot(upload_req(
            &ticket_id,
            &message_id,
            &session,
            &csrf,
            "screenshot.png",
            "image/png",
            payload,
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    // Contenu stocké chiffré (pas en clair).
    let stored: Vec<u8> =
        sqlx::query_scalar("SELECT content_encrypted FROM ticket_attachments LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(!stored.windows(8).any(|w| w == &payload[..8]));

    // message_id bien posé en DB.
    let stored_msg_id: Option<uuid::Uuid> =
        sqlx::query_scalar("SELECT message_id FROM ticket_attachments LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(stored_msg_id.is_some());

    // Attachment exposé dans messages[0].attachments via le detail.
    let resp = app
        .oneshot(
            Request::builder()
                .uri(format!("/me/tickets/{ticket_id}"))
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let attachments = json["messages"][0]["attachments"].as_array().unwrap();
    assert_eq!(attachments.len(), 1);
    assert_eq!(attachments[0]["filename"], "screenshot.png");
    assert_eq!(attachments[0]["mime_type"], "image/png");
    assert_eq!(attachments[0]["size_bytes"], payload.len() as i64);
}

#[sqlx::test(migrations = "./migrations")]
async fn download_returns_decrypted_content(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "bob@example.com").await;
    let (ticket_id, message_id) = create_ticket(&app, &session, &csrf).await;

    let payload = b"Hello ALARTIC, ceci est un fichier texte de test.";
    let resp = app
        .clone()
        .oneshot(upload_req(
            &ticket_id,
            &message_id,
            &session,
            &csrf,
            "note.txt",
            "text/plain",
            payload,
        ))
        .await
        .unwrap();
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let attach_id = serde_json::from_slice::<Value>(&body).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();

    let resp = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/me/tickets/{ticket_id}/attachments/{attach_id}"
                ))
                .header("cookie", format!("alartic_session={session}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(
        resp.headers().get("content-type").unwrap().to_str().unwrap(),
        "text/plain"
    );
    assert!(resp
        .headers()
        .get("content-disposition")
        .unwrap()
        .to_str()
        .unwrap()
        .contains("note.txt"));

    let body = resp.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&body[..], payload);
}

#[sqlx::test(migrations = "./migrations")]
async fn upload_rejects_disallowed_mime(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "carol@example.com").await;
    let (ticket_id, message_id) = create_ticket(&app, &session, &csrf).await;

    let resp = app
        .oneshot(upload_req(
            &ticket_id,
            &message_id,
            &session,
            &csrf,
            "malware.exe",
            "application/x-msdownload",
            b"MZ\x90\x00",
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn upload_rejects_oversize(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "dave@example.com").await;
    let (ticket_id, message_id) = create_ticket(&app, &session, &csrf).await;

    // 6 MB > MAX_ATTACHMENT_SIZE (5 MB). Le DefaultBodyLimit du router est à
    // 6 MB max, donc la requête passe le filtre de body limit (à peu près) ;
    // c'est le handler qui rejette avec 400 file_too_large.
    let payload = vec![0u8; 5 * 1024 * 1024 + 1];
    let resp = app
        .oneshot(upload_req(
            &ticket_id,
            &message_id,
            &session,
            &csrf,
            "huge.bin",
            "image/png",
            &payload,
        ))
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrations = "./migrations")]
async fn another_user_cannot_download_attachment(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session_a, csrf_a) = common::login(app.clone(), inbox.clone(), "eve@example.com").await;
    let (session_b, _csrf_b) = common::login(app.clone(), inbox, "fred@example.com").await;
    let (ticket_id, message_id) = create_ticket(&app, &session_a, &csrf_a).await;

    let resp = app
        .clone()
        .oneshot(upload_req(
            &ticket_id,
            &message_id,
            &session_a,
            &csrf_a,
            "secret.pdf",
            "application/pdf",
            b"%PDF-1.4 fake content",
        ))
        .await
        .unwrap();
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    let attach_id = serde_json::from_slice::<Value>(&body).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();

    // Fred tente de télécharger l'attachment d'Eve → 404 (anti-énum).
    let resp = app
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/me/tickets/{ticket_id}/attachments/{attach_id}"
                ))
                .header("cookie", format!("alartic_session={session_b}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "./migrations")]
async fn upload_without_csrf_returns_403(pool: PgPool) {
    let (state, inbox) = common::make_state(pool);
    let app = build_app(state);

    let (session, csrf) = common::login(app.clone(), inbox, "gina@example.com").await;
    let (ticket_id, message_id) = create_ticket(&app, &session, &csrf).await;

    let req = Request::builder()
        .method("POST")
        .uri(format!(
            "/me/tickets/{ticket_id}/attachments?message_id={message_id}"
        ))
        .header("cookie", format!("alartic_session={session}"))
        .header(
            "Content-Type",
            format!("multipart/form-data; boundary={BOUNDARY}"),
        )
        .body(Body::from(multipart_body("a.png", "image/png", b"x")))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::FORBIDDEN);
}
