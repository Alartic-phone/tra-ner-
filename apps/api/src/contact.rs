//! Formulaire de contact public (sans session) — `POST /contact`.
//!
//! Le message est envoyé par email à la boîte appropriée selon le `type`.
//! Aucune persistance DB (le suivi est géré dans la boîte mail de l'équipe,
//! pas dans l'API).
//!
//! Anti-spam :
//! - Honeypot `website` : si rempli, on retourne 200 silencieux et on n'envoie
//!   rien (CDC §5.4 : pas de Google reCAPTCHA).
//! - Rate-limit 5 messages / heure / email_hash.
//! - Validation stricte des longueurs.

use crate::{
    audit, crypto,
    error::AppError,
    state::{self, AppState},
};
use axum::{Json, Router, extract::State, routing::post};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{info, warn};
use validator::Validate;

const CONTACT_MAX: usize = 5;
const CONTACT_WINDOW: Duration = Duration::from_secs(3600);

pub fn routes() -> Router<AppState> {
    Router::new().route("/contact", post(submit))
}

#[derive(Deserialize, Validate)]
pub struct ContactBody {
    #[serde(rename = "type")]
    type_: String,
    #[validate(email, length(max = 254))]
    email: String,
    #[validate(length(min = 3, max = 120))]
    subject: String,
    #[validate(length(min = 10, max = 5000))]
    message: String,
    /// Honeypot. Bots remplissent, humains pas (champ aria-hidden côté front).
    #[serde(default)]
    website: String,
    /// Coche RGPD. Bloquante.
    consent: bool,
}

#[derive(Serialize)]
pub struct OkResponse {
    status: &'static str,
}

fn route_to_mailbox(type_: &str) -> &'static str {
    match type_ {
        "sav" => "sav@alartic.fr",
        "pro" => "pro@alartic.fr",
        "securite" => "security@alartic.fr",
        _ => "contact@alartic.fr",
    }
}

async fn submit(
    State(state): State<AppState>,
    Json(body): Json<ContactBody>,
) -> Result<Json<OkResponse>, AppError> {
    body.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    // Consentement RGPD obligatoire — côté serveur, on refuse explicitement
    // (le front a déjà l'attribut `required`, mais pas de confiance aveugle).
    if !body.consent {
        return Err(AppError::BadRequest("consent_required".into()));
    }

    // Honeypot — silent 200, anti-énumération.
    if !body.website.trim().is_empty() {
        info!("contact form honeypot tripped, silently dropped");
        return Ok(Json(OkResponse { status: "ok" }));
    }

    let email = body.email.trim().to_lowercase();
    let email_hash = crypto::email_hash(&state.email_hmac_key, &email);

    // Rate-limit par email_hash. Limite atteinte = silencieux (anti-énum).
    let mut rl_key = b"contact:".to_vec();
    rl_key.extend_from_slice(&email_hash);
    if !state::rate_limit_check(
        &state.rate_limiter,
        &rl_key,
        CONTACT_MAX,
        CONTACT_WINDOW,
    )
    .await
    {
        warn!("rate-limit hit for contact form");
        return Ok(Json(OkResponse { status: "ok" }));
    }

    let target = route_to_mailbox(&body.type_);
    let mail_subject = format!("[{}] {}", body.type_, body.subject);
    let mail_body = format!(
        "Type   : {}\n\
         De     : {}\n\
         Sujet  : {}\n\
         \n\
         {}\n\
         \n\
         —\n\
         Envoyé via le formulaire alartic.fr/contact.\n",
        body.type_, email, body.subject, body.message
    );

    if let Err(err) = state.mailer.send_text(target, &mail_subject, &mail_body).await {
        warn!(error = %err, "contact email send failed");
        // Le client n'a pas besoin de savoir — on log + 200 silencieux.
    } else {
        info!(target, "contact form forwarded");
    }

    audit::log(
        &state.pool,
        None, // pas authentifié
        "contact.message",
        None,
        None,
        Some(serde_json::json!({ "type": body.type_, "target": target })),
    )
    .await;

    Ok(Json(OkResponse { status: "ok" }))
}
