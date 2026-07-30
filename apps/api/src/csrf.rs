//! Protection CSRF — pattern double-submit cookie.
//!
//! 1. Au login (consume), on pose un 2ᵉ cookie `alartic_csrf` avec un token
//!    aléatoire (32 octets, URL-safe base64). Ce cookie est **lisible** par
//!    le JS (HttpOnly = false) — c'est nécessaire pour que le front Astro le
//!    rejoue dans un header.
//! 2. Pour toute méthode mutante (POST, PUT, PATCH, DELETE), le client doit
//!    renvoyer ce token via le header `X-CSRF-Token`. Le middleware compare
//!    le cookie et le header en temps constant ; mismatch → 403.
//! 3. SameSite=Strict du cookie `alartic_session` est déjà notre 1ʳᵉ ligne
//!    de défense (un site tiers ne peut pas forger la requête). Le
//!    double-submit ajoute du defense-in-depth pour les agents non-browser
//!    ou les futurs flux où SameSite ne suffit pas.
//!
//! Hors du périmètre J3 :
//! - Rotation périodique du token CSRF.
//! - Endpoint `GET /auth/csrf` pour permettre au front de récupérer le token
//!   sans avoir d'abord à se connecter (sera utile pour les actions
//!   pré-login : formulaire de contact, demande de magic link sans cookie).
//!   À ce stade, le formulaire `/auth/magic-link/request` est exempté du check
//!   CSRF (voir matchers ci-dessous), parce qu'à ce moment-là il n'y a pas
//!   encore de session ni de cookie CSRF.

use crate::{crypto, session};
use axum::{
    body::Body,
    extract::Request,
    http::{HeaderMap, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};

pub const COOKIE_NAME: &str = "alartic_csrf";
pub const HEADER_NAME: &str = "X-CSRF-Token";

/// Génère un token CSRF (32 octets base64 URL-safe). Renvoyé tel quel au
/// client, mis dans le cookie ET dans le header par le front.
pub fn generate() -> String {
    let (clear, _hash) = crypto::generate_token();
    clear
}

/// Construit le header `Set-Cookie` du token CSRF. `HttpOnly = false` —
/// volontaire, pour que le JS du front puisse le lire et le rejouer dans
/// le header `X-CSRF-Token`.
pub fn build_cookie(value: &str, secure: bool) -> String {
    let max_age = session::SESSION_TTL.num_seconds();
    let mut s =
        format!("{COOKIE_NAME}={value}; Path=/; SameSite=Strict; Max-Age={max_age}");
    if secure {
        s.push_str("; Secure");
    }
    s
}

pub fn clear_cookie(secure: bool) -> String {
    let mut s = format!("{COOKIE_NAME}=; Path=/; SameSite=Strict; Max-Age=0");
    if secure {
        s.push_str("; Secure");
    }
    s
}

fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get("cookie")?.to_str().ok()?;
    for kv in raw.split(';') {
        let kv = kv.trim();
        if let Some((k, v)) = kv.split_once('=')
            && k == name
        {
            return Some(v.to_string());
        }
    }
    None
}

/// Middleware qui applique le check CSRF sur les méthodes mutantes.
/// Exemptions :
/// - GET, HEAD, OPTIONS (lectures, pas d'effet de bord).
/// - `POST /auth/magic-link/request` : pas encore de session/cookie CSRF.
/// - `GET /auth/magic-link/consume/*` : navigation depuis email, le token
///   magic link sert lui-même de preuve d'intention.
pub async fn require_csrf(req: Request<Body>, next: Next) -> Response {
    let method = req.method();
    let path = req.uri().path();

    let safe_method = matches!(method, &Method::GET | &Method::HEAD | &Method::OPTIONS);
    let exempt_path = path == "/auth/magic-link/request"
        || path.starts_with("/auth/magic-link/consume/")
        || path == "/contact"
        // Formulaire public anonyme — pas de session, donc pas de cookie CSRF.
        // Protection anti-spam via honeypot + rate-limit par email (cf. quotes.rs).
        || path == "/devis-pro"
        // Webhooks providers : Payplug/PayPal n'envoient ni cookie ni header CSRF.
        // L'authenticité est garantie par re-fetch côté Payplug (cf. orders.rs).
        || path == "/payments/payplug/webhook"
        || path == "/payments/paypal/webhook";

    if safe_method || exempt_path {
        return next.run(req).await;
    }

    let headers = req.headers();
    let cookie_token = match cookie_value(headers, COOKIE_NAME) {
        Some(v) => v,
        None => return forbid("missing_csrf_cookie"),
    };
    let header_token = match headers.get(HEADER_NAME).and_then(|v| v.to_str().ok()) {
        Some(v) => v.to_string(),
        None => return forbid("missing_csrf_header"),
    };

    if !crypto::constant_time_eq(cookie_token.as_bytes(), header_token.as_bytes()) {
        return forbid("csrf_mismatch");
    }

    next.run(req).await
}

fn forbid(reason: &'static str) -> Response {
    (
        StatusCode::FORBIDDEN,
        axum::Json(serde_json::json!({ "error": "forbidden", "reason": reason })),
    )
        .into_response()
}
