//! Commandes — CDC §9.1 (tunnel Payplug).
//!
//! Endpoints :
//! - `POST /orders/checkout`            — créer une commande + session Payplug
//! - `GET  /me/orders`                  — liste des commandes du user
//! - `GET  /me/orders/:id`              — détail commande (récap page confirmée)
//! - `POST /payments/payplug/webhook`   — notification Payplug (public)
//!
//! ## Sécurité prix
//!
//! Le client envoie uniquement (`product_slug`, `color_slug`, `storage_slug`,
//! `qty`, `mods`). Le **back recalcule le prix** depuis le catalogue chargé
//! au boot (`AppState.catalog`). Un client ne peut donc pas envoyer un prix
//! forgé.
//!
//! ## Webhook Payplug
//!
//! Pas de signature HMAC côté Payplug. La validation officielle est de
//! **re-fetch** l'objet via `GET /v1/payments/{id}` avec la clé secrète.
//! Si le fetch réussit et que `is_paid=true`, on passe l'order en `paid`.

use crate::{
    crypto,
    error::AppError,
    invoice::{self, InvoiceCustomer, InvoiceData, InvoiceItem},
    mailer::{OrderEmailDetails, OrderEmailItem},
    payplug::{BillingShipping, CreatePaymentRequest, HostedPayment},
    products::Catalog,
    session::AuthUser,
    state::AppState,
};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderValue, StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{info, warn};
use uuid::Uuid;
use validator::Validate;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/orders/checkout", post(checkout))
        .route("/me/orders", get(list_mine))
        .route("/me/orders/{id}", get(get_mine))
        .route("/me/orders/{id}/invoice", get(get_invoice))
        .route("/payments/payplug/webhook", post(payplug_webhook))
}

// ───────────────────────── Types — request ─────────────────────────

#[derive(Debug, Deserialize, Validate)]
pub struct CheckoutBody {
    #[validate(length(min = 1, max = 50), nested)]
    pub items: Vec<CheckoutItem>,
    #[validate(nested)]
    pub customer: CheckoutCustomer,
    #[validate(nested)]
    pub billing_address: CheckoutAddress,
    /// Si absent : on réutilise `billing_address`.
    #[validate(nested)]
    pub shipping_address: Option<CheckoutAddress>,
    /// B2B
    #[serde(default)]
    pub is_pro: bool,
    #[validate(length(max = 120))]
    pub company_name: Option<String>,
    /// SIRET (14 chiffres) si is_pro.
    #[validate(length(min = 14, max = 14))]
    pub siret: Option<String>,
    /// Acceptation explicite des CGV (art. 1369-5 Code civil). Non précochée
    /// côté front, bloquante côté back.
    pub cgv_accepted: bool,
}

// Serialize est requis sur les types nested par `validator` 0.20 (le derive
// macro le réutilise pour formatter les erreurs). On ne s'en sert pas pour
// renvoyer ces structs au client.
#[derive(Debug, Deserialize, Serialize, Validate)]
pub struct CheckoutItem {
    #[validate(length(min = 1, max = 64))]
    pub product_slug: String,
    #[validate(length(min = 1, max = 32))]
    pub color_slug: String,
    #[validate(length(min = 1, max = 16))]
    pub storage_slug: String,
    #[validate(range(min = 1, max = 5))] // > 5 = devis pro, géré côté front
    pub qty: i32,
    #[serde(default)]
    pub mods: CheckoutMods,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct CheckoutMods {
    #[serde(default)]
    pub mic: bool,
    #[serde(default)]
    pub front_cam: bool,
    #[serde(default)]
    pub rear_cam: bool,
}

#[derive(Debug, Deserialize, Serialize, Validate)]
pub struct CheckoutCustomer {
    #[validate(email, length(max = 254))]
    pub email: String,
    #[validate(length(min = 1, max = 60))]
    pub first_name: String,
    #[validate(length(min = 1, max = 60))]
    pub last_name: String,
    #[validate(length(min = 5, max = 30))]
    pub phone: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Validate, Clone)]
pub struct CheckoutAddress {
    #[validate(length(min = 3, max = 120))]
    pub address1: String,
    #[validate(length(max = 120))]
    pub address2: Option<String>,
    #[validate(length(min = 3, max = 12))]
    pub postcode: String,
    #[validate(length(min = 1, max = 80))]
    pub city: String,
    /// ISO-3166-1 alpha-2 (FR par défaut). MVP J4 : France métropolitaine uniquement.
    #[validate(length(equal = 2))]
    pub country: String,
}

// ───────────────────────── Types — response ─────────────────────────

#[derive(Serialize)]
pub struct CheckoutResponse {
    pub order_id: Uuid,
    pub payment_url: String,
}

#[derive(Serialize)]
pub struct OrderItemView {
    pub product_slug: String,
    pub product_name: String,
    pub variant_color_name: String,
    pub variant_storage_label: String,
    pub mods: ModsView,
    pub unit_price_cents: i64,
    pub qty: i32,
    pub line_total_cents: i64,
}

#[derive(Serialize)]
pub struct ModsView {
    pub mic: bool,
    pub front_cam: bool,
    pub rear_cam: bool,
}

#[derive(Serialize)]
pub struct OrderView {
    pub id: Uuid,
    pub status: String,
    pub subtotal_cents: i64,
    pub shipping_cents: i64,
    pub total_cents: i64,
    pub currency: String,
    pub created_at: DateTime<Utc>,
    pub paid_at: Option<DateTime<Utc>>,
    pub items: Vec<OrderItemView>,
    /// Numéro de facture formatté `ALARTIC-YYYY-NNNNNN`. `None` tant que le
    /// paiement n'est pas confirmé (la facture n'existe qu'après attribution
    /// du numéro, cf. migration 0017).
    pub invoice_number: Option<String>,
    pub invoiced_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
pub struct OrderSummary {
    pub id: Uuid,
    pub status: String,
    pub total_cents: i64,
    pub currency: String,
    pub created_at: DateTime<Utc>,
    pub items_count: i64,
}

// ───────────────────────── Handlers ─────────────────────────

async fn checkout(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CheckoutBody>,
) -> Result<Json<CheckoutResponse>, AppError> {
    body.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    if !body.cgv_accepted {
        return Err(AppError::BadRequest("cgv_required".into()));
    }
    if body.is_pro {
        if body.company_name.as_deref().unwrap_or("").trim().is_empty() {
            return Err(AppError::BadRequest("company_name_required".into()));
        }
        if body.siret.as_deref().unwrap_or("").trim().is_empty() {
            return Err(AppError::BadRequest("siret_required".into()));
        }
    }
    // MVP : France métropolitaine uniquement (CDC §9.4).
    if body.billing_address.country.to_uppercase() != "FR" {
        return Err(AppError::BadRequest("country_not_supported".into()));
    }
    if let Some(sa) = &body.shipping_address
        && sa.country.to_uppercase() != "FR"
    {
        return Err(AppError::BadRequest("country_not_supported".into()));
    }

    // Résolution + validation prix côté serveur (jamais le client).
    let resolved = resolve_items(&state.catalog, &body.items)?;
    let subtotal_cents: i64 = resolved.iter().map(|r| r.line_total_cents).sum();
    let shipping_cents: i64 = 0; // MVP : livraison offerte. À tarifer en J4+.
    let total_cents = subtotal_cents + shipping_cents;
    if total_cents <= 0 {
        return Err(AppError::BadRequest("empty_cart".into()));
    }

    // Récupère la version CGV active.
    let cgv_version_id: Uuid = sqlx::query_scalar(
        "SELECT id FROM cgv_versions
         WHERE slug = 'cgv' AND effective_from <= NOW()
         ORDER BY version DESC LIMIT 1",
    )
    .fetch_one(&state.pool)
    .await?;

    // Chiffrement applicatif des champs sensibles.
    let key = &state.master_key;
    let email_norm = body.customer.email.trim().to_lowercase();
    let email_hash = crypto::email_hash(&state.email_hmac_key, &email_norm);
    let email_enc = crypto::encrypt_string(key, &email_norm)?;
    let first_name_enc = crypto::encrypt_string(key, body.customer.first_name.trim())?;
    let last_name_enc = crypto::encrypt_string(key, body.customer.last_name.trim())?;
    let phone_enc = body
        .customer
        .phone
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|p| crypto::encrypt_string(key, p))
        .transpose()?;
    let billing_addr_json = serde_json::to_string(&body.billing_address)
        .map_err(|_| AppError::BadRequest("invalid_address".into()))?;
    let billing_addr_enc = crypto::encrypt_string(key, &billing_addr_json)?;
    let shipping_addr_enc = match &body.shipping_address {
        Some(addr) => {
            let j = serde_json::to_string(addr)
                .map_err(|_| AppError::BadRequest("invalid_address".into()))?;
            Some(crypto::encrypt_string(key, &j)?)
        }
        None => None,
    };
    let company_enc = body
        .company_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|c| crypto::encrypt_string(key, c))
        .transpose()?;
    let siret_enc = body
        .siret
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| crypto::encrypt_string(key, s))
        .transpose()?;

    // Transaction : INSERT orders + order_items.
    let mut tx = state.pool.begin().await?;

    let order_id: Uuid = sqlx::query_scalar(
        "INSERT INTO orders (
            user_id, email_hash, email_encrypted,
            first_name_encrypted, last_name_encrypted, phone_encrypted,
            billing_address_encrypted, shipping_address_encrypted,
            is_pro, company_name_encrypted, siret_encrypted,
            subtotal_cents, shipping_cents, total_cents,
            cgv_version_id
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
         ) RETURNING id",
    )
    .bind(auth.user_id)
    .bind(&email_hash[..])
    .bind(&email_enc[..])
    .bind(&first_name_enc[..])
    .bind(&last_name_enc[..])
    .bind(phone_enc.as_deref())
    .bind(&billing_addr_enc[..])
    .bind(shipping_addr_enc.as_deref())
    .bind(body.is_pro)
    .bind(company_enc.as_deref())
    .bind(siret_enc.as_deref())
    .bind(subtotal_cents)
    .bind(shipping_cents)
    .bind(total_cents)
    .bind(cgv_version_id)
    .fetch_one(&mut *tx)
    .await?;

    for r in &resolved {
        sqlx::query(
            "INSERT INTO order_items (
                order_id, product_slug, product_name,
                variant_color_slug, variant_color_name,
                variant_storage_slug, variant_storage_label,
                mod_mic, mod_front_cam, mod_rear_cam,
                unit_price_cents, qty, line_total_cents
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        )
        .bind(order_id)
        .bind(&r.product_slug)
        .bind(&r.product_name)
        .bind(&r.color_slug)
        .bind(&r.color_name)
        .bind(&r.storage_slug)
        .bind(&r.storage_label)
        .bind(r.mods.mic)
        .bind(r.mods.front_cam)
        .bind(r.mods.rear_cam)
        .bind(r.unit_price_cents)
        .bind(r.qty)
        .bind(r.line_total_cents)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    // Create Payplug payment (best-effort — si KO on marque l'order failed).
    let payplug_payment = match build_and_send_payplug(
        &state,
        order_id,
        total_cents,
        &email_norm,
        body.customer.first_name.trim(),
        body.customer.last_name.trim(),
        &body.billing_address,
        body.shipping_address.as_ref().unwrap_or(&body.billing_address),
    )
    .await
    {
        Ok(p) => p,
        Err(err) => {
            warn!(error = %err, %order_id, "Payplug payment creation failed");
            let _ = sqlx::query("UPDATE orders SET status = 'failed' WHERE id = $1")
                .bind(order_id)
                .execute(&state.pool)
                .await;
            return Err(AppError::BadRequest("payment_provider_error".into()));
        }
    };

    let payment_url = payplug_payment
        .hosted_payment
        .as_ref()
        .and_then(|h| h.payment_url.clone())
        .ok_or_else(|| {
            warn!(%order_id, "Payplug response missing hosted_payment.payment_url");
            AppError::BadRequest("payment_provider_error".into())
        })?;

    sqlx::query(
        "UPDATE orders SET payplug_payment_id = $1, payment_method = 'payplug' WHERE id = $2",
    )
    .bind(&payplug_payment.id)
    .bind(order_id)
    .execute(&state.pool)
    .await?;

    crate::audit::log(
        &state.pool,
        Some(auth.user_id),
        "order.checkout",
        Some("order"),
        Some(order_id),
        Some(serde_json::json!({
            "total_cents": total_cents,
            "items": resolved.len(),
            "payplug_id": payplug_payment.id,
        })),
    )
    .await;

    info!(%order_id, %total_cents, "checkout created, redirecting to Payplug");

    Ok(Json(CheckoutResponse {
        order_id,
        payment_url,
    }))
}

async fn list_mine(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<OrderSummary>>, AppError> {
    let rows: Vec<(Uuid, String, i64, String, DateTime<Utc>, i64)> = sqlx::query_as(
        "SELECT o.id, o.status, o.total_cents, o.currency, o.created_at,
                COALESCE((SELECT COUNT(*) FROM order_items WHERE order_id = o.id), 0)
         FROM orders o
         WHERE o.user_id = $1
         ORDER BY o.created_at DESC",
    )
    .bind(auth.user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(|(id, status, total_cents, currency, created_at, items_count)| OrderSummary {
                id,
                status,
                total_cents,
                currency,
                created_at,
                items_count,
            })
            .collect(),
    ))
}

async fn get_mine(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<OrderView>, AppError> {
    let row: Option<(
        Uuid,
        String,
        i64,
        i64,
        i64,
        String,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
        Option<i64>,
        Option<DateTime<Utc>>,
    )> = sqlx::query_as(
        "SELECT id, status, subtotal_cents, shipping_cents, total_cents, currency,
                created_at, paid_at, invoice_number, invoiced_at
         FROM orders
         WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_optional(&state.pool)
    .await?;

    let (
        id,
        status,
        subtotal_cents,
        shipping_cents,
        total_cents,
        currency,
        created_at,
        paid_at,
        invoice_number,
        invoiced_at,
    ) = row.ok_or(AppError::NotFound)?;

    let items: Vec<(
        String,
        String,
        String,
        String,
        bool,
        bool,
        bool,
        i64,
        i32,
        i64,
    )> = sqlx::query_as(
        "SELECT product_slug, product_name, variant_color_name, variant_storage_label,
                mod_mic, mod_front_cam, mod_rear_cam,
                unit_price_cents, qty, line_total_cents
         FROM order_items
         WHERE order_id = $1
         ORDER BY created_at ASC",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    let items = items
        .into_iter()
        .map(
            |(
                product_slug,
                product_name,
                variant_color_name,
                variant_storage_label,
                mod_mic,
                mod_front_cam,
                mod_rear_cam,
                unit_price_cents,
                qty,
                line_total_cents,
            )| OrderItemView {
                product_slug,
                product_name,
                variant_color_name,
                variant_storage_label,
                mods: ModsView {
                    mic: mod_mic,
                    front_cam: mod_front_cam,
                    rear_cam: mod_rear_cam,
                },
                unit_price_cents,
                qty,
                line_total_cents,
            },
        )
        .collect();

    let invoice_number_str = invoice_number
        .zip(invoiced_at)
        .map(|(n, dt)| crate::invoice::format_number(n, dt));

    Ok(Json(OrderView {
        id,
        status,
        subtotal_cents,
        shipping_cents,
        total_cents,
        currency,
        created_at,
        paid_at,
        items,
        invoice_number: invoice_number_str,
        invoiced_at,
    }))
}

// ───────────────────────── Webhook Payplug ─────────────────────────

#[derive(Deserialize)]
pub struct PayplugWebhookBody {
    pub id: String,
    #[serde(default)]
    pub object: Option<String>,
    #[serde(default)]
    pub is_live: Option<bool>,
}

async fn payplug_webhook(
    State(state): State<AppState>,
    Json(body): Json<PayplugWebhookBody>,
) -> Result<Json<serde_json::Value>, AppError> {
    info!(payment_id = %body.id, "Payplug webhook received, fetching to verify");

    // Re-fetch obligatoire (Payplug ne signe pas — voir docs).
    let payment = state.payplug.fetch_payment(&body.id).await.map_err(|err| {
        warn!(error = %err, payment_id = %body.id, "Payplug fetch failed in webhook");
        AppError::BadRequest("payment_not_verified".into())
    })?;

    // Lookup l'order via le payplug_payment_id (mis à jour au checkout).
    let order_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM orders WHERE payplug_payment_id = $1",
    )
    .bind(&payment.id)
    .fetch_optional(&state.pool)
    .await?;

    // Log de l'événement quoi qu'il arrive (audit / idempotence).
    let event_type = if payment.is_paid { "paid" } else { "pending" };
    let _ = sqlx::query(
        "INSERT INTO payment_events (order_id, provider, provider_payment_id, event_type, raw_body)
         VALUES ($1, 'payplug', $2, $3, $4)",
    )
    .bind(order_id)
    .bind(&payment.id)
    .bind(event_type)
    .bind(serde_json::json!({
        "id": payment.id,
        "amount": payment.amount,
        "is_paid": payment.is_paid,
        "is_live": payment.is_live,
    }))
    .execute(&state.pool)
    .await;

    let Some(order_id) = order_id else {
        warn!(payment_id = %payment.id, "Payplug webhook : aucun order trouvé pour ce payment_id");
        // 200 quand même pour que Payplug ne re-essaye pas (idempotence).
        return Ok(Json(serde_json::json!({ "status": "ignored_unknown" })));
    };

    if payment.is_paid {
        // UPDATE conditionnel : passe à 'paid' uniquement si encore 'pending'.
        // Idempotent : un second webhook ne fera rien.
        let updated = sqlx::query(
            "UPDATE orders
             SET status = 'paid', paid_at = NOW()
             WHERE id = $1 AND status = 'pending'",
        )
        .bind(order_id)
        .execute(&state.pool)
        .await?;

        if updated.rows_affected() > 0 {
            crate::audit::log(
                &state.pool,
                None,
                "order.paid",
                Some("order"),
                Some(order_id),
                Some(serde_json::json!({
                    "payplug_id": payment.id,
                    "amount": payment.amount,
                })),
            )
            .await;
            info!(%order_id, "order marked as paid");

            // Attribution du numéro de facture (atomique, séquence Postgres).
            // Si l'UPDATE ne renvoie rien (numéro déjà attribué = webhook
            // rejoué), on continue quand même — l'email + le PDF restent OK
            // car ils relisent depuis la DB.
            match attribute_invoice_number(&state.pool, order_id).await {
                Ok(Some((n, _))) => info!(%order_id, invoice = n, "invoice number attributed"),
                Ok(None) => info!(%order_id, "invoice number already attributed"),
                Err(err) => warn!(error = %err, %order_id, "invoice number attribution failed"),
            }

            // Mail de confirmation au client — best-effort, on n'échoue pas
            // le webhook si SMTP est KO (Payplug retenterait, et l'email peut
            // être renvoyé manuellement via le back-office plus tard).
            if let Err(err) = send_paid_confirmation(&state, order_id).await {
                warn!(error = %err, %order_id, "send order confirmation email failed");
            }
        }
    }

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

// ───────────────────────── Helpers ─────────────────────────

struct ResolvedItem {
    product_slug: String,
    product_name: String,
    color_slug: String,
    color_name: String,
    storage_slug: String,
    storage_label: String,
    mods: CheckoutMods,
    unit_price_cents: i64,
    qty: i32,
    line_total_cents: i64,
}

fn resolve_items(
    catalog: &Arc<Catalog>,
    items: &[CheckoutItem],
) -> Result<Vec<ResolvedItem>, AppError> {
    if items.is_empty() {
        return Err(AppError::BadRequest("empty_cart".into()));
    }
    items
        .iter()
        .map(|it| {
            let v = catalog
                .resolve_variant(&it.product_slug, &it.color_slug, &it.storage_slug)
                .ok_or_else(|| AppError::BadRequest("unknown_variant".into()))?;
            let line_total_cents = v.unit_price_cents * (it.qty as i64);
            Ok(ResolvedItem {
                product_slug: it.product_slug.clone(),
                product_name: v.product_name,
                color_slug: it.color_slug.clone(),
                color_name: v.color_name,
                storage_slug: it.storage_slug.clone(),
                storage_label: v.storage_label,
                mods: CheckoutMods {
                    mic: it.mods.mic,
                    front_cam: it.mods.front_cam,
                    rear_cam: it.mods.rear_cam,
                },
                unit_price_cents: v.unit_price_cents,
                qty: it.qty,
                line_total_cents,
            })
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
async fn build_and_send_payplug(
    state: &AppState,
    order_id: Uuid,
    total_cents: i64,
    email: &str,
    first_name: &str,
    last_name: &str,
    billing: &CheckoutAddress,
    shipping: &CheckoutAddress,
) -> Result<crate::payplug::Payment, crate::payplug::PayplugError> {
    let return_url = format!("{}/commande/confirmee?order={}", state.front_url, order_id);
    let cancel_url = format!("{}/commande/annulee?order={}", state.front_url, order_id);
    let notification_url = format!("{}/payments/payplug/webhook", state.base_url);

    let billing_obj = BillingShipping {
        first_name: first_name.to_string(),
        last_name: last_name.to_string(),
        email: email.to_string(),
        address1: billing.address1.clone(),
        postcode: billing.postcode.clone(),
        city: billing.city.clone(),
        country: billing.country.to_uppercase(),
        language: "fr",
        delivery_type: None,
    };
    let shipping_obj = BillingShipping {
        first_name: first_name.to_string(),
        last_name: last_name.to_string(),
        email: email.to_string(),
        address1: shipping.address1.clone(),
        postcode: shipping.postcode.clone(),
        city: shipping.city.clone(),
        country: shipping.country.to_uppercase(),
        language: "fr",
        delivery_type: Some("BILLING"),
    };

    let req = CreatePaymentRequest {
        amount: total_cents,
        currency: "EUR",
        billing: billing_obj,
        shipping: shipping_obj,
        hosted_payment: HostedPayment {
            return_url,
            cancel_url,
        },
        notification_url,
        metadata: serde_json::json!({ "order_id": order_id.to_string() }),
        force_3ds: true,
    };
    state.payplug.create_payment(&req).await
}

/// Récupère les détails d'une order, déchiffre email + prénom, génère la
/// facture PDF (si numéro attribué) et formate le mail de confirmation.
/// Best-effort : appelé depuis le webhook après UPDATE paid.
async fn send_paid_confirmation(state: &AppState, order_id: Uuid) -> Result<(), AppError> {
    let loaded = match load_invoice(state, order_id).await? {
        Some(l) => l,
        None => {
            warn!(%order_id, "send_paid_confirmation : order introuvable ou pas encore facturée");
            return Ok(());
        }
    };

    let items_email: Vec<OrderEmailItem<'_>> = loaded
        .items
        .iter()
        .map(|it| OrderEmailItem {
            product_name: &it.product_name,
            variant_color_name: &it.variant_color_name,
            variant_storage_label: &it.variant_storage_label,
            qty: it.qty,
            unit_price_cents: it.unit_price_cents,
            line_total_cents: it.line_total_cents,
        })
        .collect();

    let order_id_str = order_id.to_string();
    let account_url = format!("{}/compte", state.front_url);
    let details = OrderEmailDetails {
        order_id: &order_id_str,
        first_name: &loaded.first_name,
        items: &items_email,
        subtotal_cents: loaded.subtotal_cents,
        shipping_cents: loaded.shipping_cents,
        total_cents: loaded.total_cents,
        account_url: &account_url,
    };

    let invoice_pdf = build_invoice_pdf(&loaded, &state.seller).map_err(|err| {
        warn!(error = ?err, %order_id, "invoice PDF generation failed");
        AppError::Internal
    })?;
    let invoice_filename = format!(
        "{}.pdf",
        invoice::format_number(loaded.invoice_number, loaded.invoiced_at)
    );

    state
        .mailer
        .send_order_confirmation_with_invoice(
            &loaded.email,
            &details,
            &invoice_filename,
            invoice_pdf,
        )
        .await?;
    Ok(())
}

// ───────────────────────── Invoice — endpoint + helpers ─────────────────────────

/// Téléchargement de la facture PDF par le client propriétaire de la commande.
/// 200 + `application/pdf` si paid + numéro attribué. 404 sinon (anti-énumération,
/// pas de distinction entre "order pas à moi" et "pas encore facturée").
async fn get_invoice(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    // Vérifie ownership
    let owns: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM orders WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(auth.user_id)
            .fetch_optional(&state.pool)
            .await?;
    if owns.is_none() {
        return Err(AppError::NotFound);
    }

    let loaded = load_invoice(&state, id).await?.ok_or(AppError::NotFound)?;
    let pdf = build_invoice_pdf(&loaded, &state.seller).map_err(|err| {
        warn!(error = ?err, order_id = %id, "invoice PDF generation failed");
        AppError::Internal
    })?;

    let filename = format!(
        "{}.pdf",
        invoice::format_number(loaded.invoice_number, loaded.invoiced_at)
    );
    let disposition = format!("attachment; filename=\"{filename}\"");

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, HeaderValue::from_static("application/pdf")),
            (
                header::CONTENT_DISPOSITION,
                HeaderValue::from_str(&disposition).unwrap_or(HeaderValue::from_static(
                    "attachment; filename=\"facture.pdf\"",
                )),
            ),
            (header::CACHE_CONTROL, HeaderValue::from_static("private, no-store")),
        ],
        pdf,
    ))
}

/// Attribution atomique du numéro de facture via `nextval('invoice_seq')`.
/// Renvoie `Some((number, invoiced_at))` si attribué, `None` si l'order avait
/// déjà un numéro (webhook rejoué).
async fn attribute_invoice_number(
    pool: &sqlx::PgPool,
    order_id: Uuid,
) -> Result<Option<(i64, DateTime<Utc>)>, sqlx::Error> {
    sqlx::query_as::<_, (i64, DateTime<Utc>)>(
        "UPDATE orders
         SET invoice_number = nextval('invoice_seq'),
             invoiced_at = NOW()
         WHERE id = $1 AND invoice_number IS NULL
         RETURNING invoice_number, invoiced_at",
    )
    .bind(order_id)
    .fetch_optional(pool)
    .await
}

/// Données owning nécessaires pour construire l'`InvoiceData` à passer à
/// `invoice::generate_pdf`.
struct LoadedInvoice {
    order_id: Uuid,
    invoice_number: i64,
    invoiced_at: DateTime<Utc>,
    paid_at: DateTime<Utc>,
    email: String,
    first_name: String,
    last_name: String,
    is_pro: bool,
    company_name: Option<String>,
    siret: Option<String>,
    billing_address: CheckoutAddress,
    items: Vec<LoadedItem>,
    subtotal_cents: i64,
    shipping_cents: i64,
    total_cents: i64,
    payment_method: String,
}

struct LoadedItem {
    product_name: String,
    variant_color_name: String,
    variant_storage_label: String,
    qty: i32,
    unit_price_cents: i64,
    line_total_cents: i64,
}

/// Charge l'order, déchiffre les champs nécessaires à la facture, charge les
/// items. Renvoie `None` si l'order n'existe pas ou n'a pas encore de numéro
/// de facture attribué.
async fn load_invoice(state: &AppState, order_id: Uuid) -> Result<Option<LoadedInvoice>, AppError> {
    let row: Option<(
        Vec<u8>,
        Vec<u8>,
        Vec<u8>,
        Vec<u8>,
        bool,
        Option<Vec<u8>>,
        Option<Vec<u8>>,
        i64,
        i64,
        i64,
        Option<DateTime<Utc>>,
        Option<i64>,
        Option<DateTime<Utc>>,
        Option<String>,
    )> = sqlx::query_as(
        "SELECT email_encrypted, first_name_encrypted, last_name_encrypted,
                billing_address_encrypted,
                is_pro, company_name_encrypted, siret_encrypted,
                subtotal_cents, shipping_cents, total_cents,
                paid_at, invoice_number, invoiced_at, payment_method
         FROM orders
         WHERE id = $1",
    )
    .bind(order_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some((
        email_blob,
        first_name_blob,
        last_name_blob,
        billing_blob,
        is_pro,
        company_blob,
        siret_blob,
        subtotal_cents,
        shipping_cents,
        total_cents,
        paid_at,
        invoice_number,
        invoiced_at,
        payment_method,
    )) = row
    else {
        return Ok(None);
    };

    let (Some(invoice_number), Some(invoiced_at), Some(paid_at)) =
        (invoice_number, invoiced_at, paid_at)
    else {
        return Ok(None);
    };

    let key = &state.master_key;
    let email = crypto::decrypt_string(key, &email_blob)?;
    let first_name = crypto::decrypt_string(key, &first_name_blob)?;
    let last_name = crypto::decrypt_string(key, &last_name_blob)?;
    let billing_json = crypto::decrypt_string(key, &billing_blob)?;
    let billing_address: CheckoutAddress = serde_json::from_str(&billing_json)
        .map_err(|_| AppError::Internal)?;
    let company_name = company_blob
        .as_deref()
        .map(|b| crypto::decrypt_string(key, b))
        .transpose()?;
    let siret = siret_blob
        .as_deref()
        .map(|b| crypto::decrypt_string(key, b))
        .transpose()?;

    let item_rows: Vec<(String, String, String, i32, i64, i64)> = sqlx::query_as(
        "SELECT product_name, variant_color_name, variant_storage_label,
                qty, unit_price_cents, line_total_cents
         FROM order_items WHERE order_id = $1
         ORDER BY created_at ASC",
    )
    .bind(order_id)
    .fetch_all(&state.pool)
    .await?;

    let items = item_rows
        .into_iter()
        .map(
            |(product_name, variant_color_name, variant_storage_label, qty, unit, line)| {
                LoadedItem {
                    product_name,
                    variant_color_name,
                    variant_storage_label,
                    qty,
                    unit_price_cents: unit,
                    line_total_cents: line,
                }
            },
        )
        .collect();

    Ok(Some(LoadedInvoice {
        order_id,
        invoice_number,
        invoiced_at,
        paid_at,
        email,
        first_name,
        last_name,
        is_pro,
        company_name,
        siret,
        billing_address,
        items,
        subtotal_cents,
        shipping_cents,
        total_cents,
        payment_method: payment_method.unwrap_or_else(|| "payplug".to_string()),
    }))
}

fn build_invoice_pdf(
    loaded: &LoadedInvoice,
    seller: &crate::invoice::SellerInfo,
) -> Result<Vec<u8>, printpdf::Error> {
    let items: Vec<InvoiceItem<'_>> = loaded
        .items
        .iter()
        .map(|it| InvoiceItem {
            product_name: &it.product_name,
            variant_color_name: &it.variant_color_name,
            variant_storage_label: &it.variant_storage_label,
            qty: it.qty,
            unit_price_cents: it.unit_price_cents,
            line_total_cents: it.line_total_cents,
        })
        .collect();
    let data = InvoiceData {
        number: loaded.invoice_number,
        invoiced_at: loaded.invoiced_at,
        paid_at: loaded.paid_at,
        order_id: loaded.order_id,
        customer: InvoiceCustomer {
            first_name: &loaded.first_name,
            last_name: &loaded.last_name,
            email: &loaded.email,
            address_line1: &loaded.billing_address.address1,
            address_line2: loaded.billing_address.address2.as_deref(),
            postcode: &loaded.billing_address.postcode,
            city: &loaded.billing_address.city,
            country: &loaded.billing_address.country,
            is_pro: loaded.is_pro,
            company_name: loaded.company_name.as_deref(),
            siret: loaded.siret.as_deref(),
        },
        items: &items,
        subtotal_cents: loaded.subtotal_cents,
        shipping_cents: loaded.shipping_cents,
        total_cents: loaded.total_cents,
        payment_method: &loaded.payment_method,
    };
    invoice::generate_pdf(&data, seller)
}

// Tests d'intégration via #[sqlx::test] dans tests/orders.rs.
