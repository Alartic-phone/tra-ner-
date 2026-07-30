//! Client API Payplug — création de paiement + vérification post-notification.
//!
//! CDC §9.1 : tunnel d'achat principal. Payplug Hosted Pages : on POST une
//! description de paiement, Payplug renvoie une URL où rediriger le client.
//! Le client paie sur le domaine Payplug (PCI-DSS chez eux), revient sur
//! `return_url`. En parallèle, Payplug envoie une notification POST à
//! `notification_url`.
//!
//! ## Sécurité webhook (important)
//!
//! Payplug **ne signe pas** ses notifications avec un HMAC. La méthode
//! officielle pour valider une notif est de **re-fetch l'objet** via
//! `GET /v1/payments/{id}` avec la clé secrète. Si le fetch réussit avec le
//! même ID et que `is_paid=true`, on considère le paiement valide. Source :
//! docs.payplug.com/api/apiref.html (section Security notice).
//!
//! Conséquence : ne **jamais** faire confiance au body brut du webhook,
//! toujours re-fetch.

use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

const API_BASE: &str = "https://api.payplug.com/v1";
const API_VERSION: &str = "2019-08-06";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Error)]
pub enum PayplugError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Payplug API error: {status} — {body}")]
    Api { status: StatusCode, body: String },
    #[error("Payment {0} not found")]
    NotFound(String),
}

#[derive(Clone)]
pub struct PayplugClient {
    http: Client,
    secret_key: String,
}

impl PayplugClient {
    pub fn new(secret_key: String) -> Result<Self, PayplugError> {
        let http = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Ok(Self { http, secret_key })
    }

    /// `true` si la clé est en mode test (`sk_test_*`) — utile pour bannière
    /// admin / désactiver des emails en dev.
    #[allow(dead_code)]
    pub fn is_test_mode(&self) -> bool {
        self.secret_key.starts_with("sk_test_")
    }

    /// POST /v1/payments — crée une session de paiement Hosted Pages.
    /// Renvoie l'objet paiement avec son `id` et l'URL hostée.
    pub async fn create_payment(
        &self,
        req: &CreatePaymentRequest,
    ) -> Result<Payment, PayplugError> {
        let res = self
            .http
            .post(format!("{API_BASE}/payments"))
            .bearer_auth(&self.secret_key)
            .header("PayPlug-Version", API_VERSION)
            .json(req)
            .send()
            .await?;

        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            return Err(PayplugError::Api { status, body });
        }
        Ok(res.json::<Payment>().await?)
    }

    /// GET /v1/payments/{id} — utilisé pour valider une notification webhook.
    pub async fn fetch_payment(&self, payment_id: &str) -> Result<Payment, PayplugError> {
        let res = self
            .http
            .get(format!("{API_BASE}/payments/{payment_id}"))
            .bearer_auth(&self.secret_key)
            .header("PayPlug-Version", API_VERSION)
            .send()
            .await?;

        let status = res.status();
        if status == StatusCode::NOT_FOUND {
            return Err(PayplugError::NotFound(payment_id.to_string()));
        }
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            return Err(PayplugError::Api { status, body });
        }
        Ok(res.json::<Payment>().await?)
    }
}

// ───────────────────────── Types — request ─────────────────────────

#[derive(Debug, Serialize)]
pub struct CreatePaymentRequest {
    /// Montant en centimes (EUR uniquement).
    pub amount: i64,
    pub currency: &'static str,
    pub billing: BillingShipping,
    pub shipping: BillingShipping,
    pub hosted_payment: HostedPayment,
    pub notification_url: String,
    pub metadata: serde_json::Value,
    /// 3DS forcé par défaut — recommandé pour limiter la fraude (CDC §9.1).
    pub force_3ds: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct BillingShipping {
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    pub address1: String,
    pub postcode: String,
    pub city: String,
    /// Code ISO-3166-1 alpha-2 (FR, BE, …).
    pub country: String,
    pub language: &'static str,
    /// Présent uniquement sur `shipping`. Pour `billing`, mettre `None` =
    /// champ omis (Serde `skip_serializing_if`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivery_type: Option<&'static str>,
}

#[derive(Debug, Serialize)]
pub struct HostedPayment {
    pub return_url: String,
    pub cancel_url: String,
}

// ───────────────────────── Types — response ─────────────────────────

/// Subset des champs du payment Payplug qu'on consomme. Inclut tout ce qui est
/// nécessaire pour redirect après create + verify après webhook.
#[derive(Debug, Deserialize)]
pub struct Payment {
    pub id: String,
    pub amount: i64,
    pub currency: String,
    pub is_paid: bool,
    pub is_live: bool,
    pub hosted_payment: Option<HostedPaymentResponse>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct HostedPaymentResponse {
    pub payment_url: Option<String>,
}
