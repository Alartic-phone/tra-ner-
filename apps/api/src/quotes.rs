//! Demandes de devis pro > 5 unités — CDC §7.3.
//!
//! Endpoint public : `POST /devis-pro`.
//!
//! Différence avec `/contact?type=pro` (qui reste en place pour les
//! demandes texte libres) :
//! - Persistance dans `dispatch_requests` (+ `dispatch_request_items`)
//!   → visible en back-office (J4 admin).
//! - Champs structurés : société/SIRET/contact + une ou plusieurs lignes
//!   (modèle / coloris / stockage / quantité). Total ≥ 5 unités.
//! - Email envoyé à `pro@alartic.fr` avec récap complet.
//!
//! Pas d'auth : un visiteur anonyme peut demander un devis. CSRF exempté
//! (cf. csrf.rs) puisqu'il n'y a pas de session.

use crate::{
    audit, crypto,
    error::AppError,
    state::{self, AppState},
};
use axum::{Json, Router, extract::State, routing::post};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{info, warn};
use uuid::Uuid;
use validator::Validate;

const QUOTE_MAX: usize = 5;
const QUOTE_WINDOW: Duration = Duration::from_secs(3600);
const MIN_TOTAL_QTY_PRO: i32 = 5;
const MAX_ITEMS: usize = 20;

pub fn routes() -> Router<AppState> {
    Router::new().route("/devis-pro", post(submit))
}

#[derive(Deserialize, Serialize, Validate)]
pub struct QuoteItem {
    #[validate(length(min = 1, max = 64))]
    product_slug: String,
    #[validate(length(min = 1, max = 32))]
    color_slug: String,
    #[validate(length(min = 1, max = 16))]
    storage_slug: String,
    #[validate(range(min = 1, max = 999))]
    quantity: i32,
}

#[derive(Deserialize, Validate)]
pub struct QuoteBody {
    /// 1 à MAX_ITEMS lignes. La somme des quantités doit atteindre MIN_TOTAL_QTY_PRO.
    #[validate(length(min = 1, max = 20), nested)]
    items: Vec<QuoteItem>,

    #[validate(email, length(max = 254))]
    email: String,
    #[validate(length(min = 1, max = 60))]
    contact_name: String,
    #[validate(length(min = 1, max = 120))]
    company_name: String,
    /// SIRET français = 14 chiffres.
    #[validate(length(equal = 14))]
    siret: String,
    #[validate(length(min = 5, max = 30))]
    phone: Option<String>,
    #[validate(length(max = 5000))]
    message: Option<String>,

    /// Honeypot. Bot remplit, humain ignore.
    #[serde(default)]
    website: String,
    /// Consentement RGPD (CDC §4).
    consent: bool,
}

#[derive(Serialize)]
pub struct QuoteResponse {
    pub status: &'static str,
    pub request_id: Option<Uuid>,
}

/// Item résolu côté serveur après lookup catalogue : on a les noms lisibles
/// pour le mail à pro@.
struct ResolvedItem {
    product_slug: String,
    product_name: String,
    color_slug: String,
    color_name: String,
    storage_slug: String,
    storage_label: String,
    quantity: i32,
}

async fn submit(
    State(state): State<AppState>,
    Json(body): Json<QuoteBody>,
) -> Result<Json<QuoteResponse>, AppError> {
    body.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    if !body.consent {
        return Err(AppError::BadRequest("consent_required".into()));
    }
    if body.items.is_empty() {
        return Err(AppError::BadRequest("empty_items".into()));
    }
    if body.items.len() > MAX_ITEMS {
        return Err(AppError::BadRequest("too_many_items".into()));
    }

    // Honeypot — silent ok.
    if !body.website.trim().is_empty() {
        info!("devis-pro honeypot tripped, silently dropped");
        return Ok(Json(QuoteResponse {
            status: "ok",
            request_id: None,
        }));
    }

    // SIRET : digits-only
    let siret_digits: String = body.siret.chars().filter(|c| c.is_ascii_digit()).collect();
    if siret_digits.len() != 14 {
        return Err(AppError::BadRequest("siret_invalid".into()));
    }

    // Résolution + somme.
    let mut resolved = Vec::with_capacity(body.items.len());
    let mut total_qty: i64 = 0;
    for it in &body.items {
        let v = state
            .catalog
            .resolve_variant(&it.product_slug, &it.color_slug, &it.storage_slug)
            .ok_or_else(|| AppError::BadRequest("unknown_variant".into()))?;
        total_qty += it.quantity as i64;
        resolved.push(ResolvedItem {
            product_slug: it.product_slug.clone(),
            product_name: v.product_name,
            color_slug: it.color_slug.clone(),
            color_name: v.color_name,
            storage_slug: it.storage_slug.clone(),
            storage_label: v.storage_label,
            quantity: it.quantity,
        });
    }
    if total_qty < MIN_TOTAL_QTY_PRO as i64 {
        return Err(AppError::BadRequest("quantity_too_low".into()));
    }

    let email_norm = body.email.trim().to_lowercase();
    let email_hash = crypto::email_hash(&state.email_hmac_key, &email_norm);

    // Rate-limit 5 demandes / heure / email_hash.
    let mut rl_key = b"quote:".to_vec();
    rl_key.extend_from_slice(&email_hash);
    if !state::rate_limit_check(&state.rate_limiter, &rl_key, QUOTE_MAX, QUOTE_WINDOW).await {
        warn!("rate-limit hit for devis-pro");
        return Ok(Json(QuoteResponse {
            status: "ok",
            request_id: None,
        }));
    }

    // Chiffrement des champs sensibles.
    let key = &state.master_key;
    let email_enc = crypto::encrypt_string(key, &email_norm)?;
    let company_enc = crypto::encrypt_string(key, body.company_name.trim())?;
    let siret_enc = crypto::encrypt_string(key, &siret_digits)?;

    // contact_name + phone + message → JSON dans message_encrypted (la table parent
    // n'a pas de colonnes dédiées, on évite une migration en plus pour ça).
    let payload = serde_json::json!({
        "contact_name": body.contact_name.trim(),
        "phone": body.phone.as_deref().map(str::trim),
        "message": body.message.as_deref().map(str::trim),
    });
    let message_enc = crypto::encrypt_string(key, &payload.to_string())?;

    // Transaction : INSERT parent + INSERT items.
    let mut tx = state.pool.begin().await?;

    let request_id: Uuid = sqlx::query_scalar(
        "INSERT INTO dispatch_requests
            (email_encrypted, company_name_encrypted, siret_encrypted,
             quantity, message_encrypted)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(&email_enc[..])
    .bind(&company_enc[..])
    .bind(&siret_enc[..])
    .bind(total_qty as i32)
    .bind(&message_enc[..])
    .fetch_one(&mut *tx)
    .await?;

    for r in &resolved {
        sqlx::query(
            "INSERT INTO dispatch_request_items
                (dispatch_request_id, product_slug, color_slug, storage_slug, quantity)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(request_id)
        .bind(&r.product_slug)
        .bind(&r.color_slug)
        .bind(&r.storage_slug)
        .bind(r.quantity)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    // Mail à pro@alartic.fr — récap complet.
    let mut items_block = String::new();
    for r in &resolved {
        items_block.push_str(&format!(
            "  • {qty} × {product} ({storage} / {color})\n",
            qty = r.quantity,
            product = r.product_name,
            storage = r.storage_label,
            color = r.color_name,
        ));
    }
    let mail_body = format!(
        "Nouvelle demande de devis pro\n\
         ─────────────────────────────\n\n\
         Référence : {request_id}\n\
         Total     : {total} unités sur {n_lines} ligne(s)\n\n\
         ─── Articles ────────────────\n\
         {items}\n\
         ─── Contact ─────────────────\n\
         Société  : {company}\n\
         SIRET    : {siret}\n\
         Nom      : {name}\n\
         Email    : {email}\n\
         Tél      : {phone}\n\n\
         ─── Message ─────────────────\n\
         {message}\n\n\
         ─────────────────────────────\n\
         Cette demande est aussi visible dans le back-office\n\
         (module Demandes de devis pro).\n",
        request_id = request_id,
        total = total_qty,
        n_lines = resolved.len(),
        items = items_block,
        company = body.company_name.trim(),
        siret = siret_digits,
        name = body.contact_name.trim(),
        email = email_norm,
        phone = body.phone.as_deref().unwrap_or("(non renseigné)"),
        message = body
            .message
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("(aucun message)"),
    );
    let subject = format!("[devis-pro] {total_qty} unités · {n} ligne(s)", n = resolved.len());
    if let Err(err) = state
        .mailer
        .send_text("pro@alartic.fr", &subject, &mail_body)
        .await
    {
        warn!(error = %err, %request_id, "devis-pro email send failed (insert ok)");
    } else {
        info!(%request_id, "devis-pro forwarded to pro@alartic.fr");
    }

    audit::log(
        &state.pool,
        None,
        "dispatch.create",
        Some("dispatch_request"),
        Some(request_id),
        Some(serde_json::json!({
            "total_quantity": total_qty,
            "items": resolved.len(),
        })),
    )
    .await;

    Ok(Json(QuoteResponse {
        status: "ok",
        request_id: Some(request_id),
    }))
}
