//! État applicatif partagé entre handlers.

use crate::{
    crypto::KEY_LEN, invoice::SellerInfo, mailer::Mailer, payplug::PayplugClient,
    products::Catalog,
};
use sqlx::PgPool;
use std::{
    collections::{HashMap, VecDeque},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use uuid::Uuid;

/// Rate-limiter en mémoire, multi-actions.
///
/// La clé est un préfixe d'action + un identifiant (`email_hash`, `user_id`…).
/// Les helpers `rl_key_*` ci-dessous construisent des clés sans collision.
///
/// Limites connues — assumées pour le J3 :
/// - Reset au restart du process (acceptable en dev, à remplacer par Redis
///   ou table Postgres avant MEP — CDC §10.2 audit).
/// - Pas de cluster-aware. Mono-instance suffit pour MVP J3/J4.
pub type RateLimiter = Arc<Mutex<HashMap<Vec<u8>, VecDeque<Instant>>>>;

/// Construit une clé `magic_link:<email_hash hex>`.
pub fn rl_key_magic_link(email_hash: &[u8; 32]) -> Vec<u8> {
    let mut k = b"ml:".to_vec();
    k.extend_from_slice(email_hash);
    k
}

/// Construit une clé `<action>:<user_uuid bytes>` pour les endpoints
/// authentifiés (typiquement /me/email, /me/tickets create).
pub fn rl_key_user(action: &[u8], user_id: Uuid) -> Vec<u8> {
    let mut k = action.to_vec();
    k.push(b':');
    k.extend_from_slice(user_id.as_bytes());
    k
}

/// Vérifie + incrémente le rate-limit pour `key` sur la fenêtre `window` avec
/// un max de `max` hits. Retourne `true` si la requête doit passer, `false`
/// si la limite est atteinte (le caller décide alors quoi renvoyer — souvent
/// 200 silencieux pour anti-énumération, 429 pour les endpoints authentifiés).
pub async fn rate_limit_check(
    limiter: &RateLimiter,
    key: &[u8],
    max: usize,
    window: Duration,
) -> bool {
    let mut map = limiter.lock().await;
    let now = Instant::now();
    let entry = map.entry(key.to_vec()).or_default();
    while let Some(&front) = entry.front() {
        if now.duration_since(front) > window {
            entry.pop_front();
        } else {
            break;
        }
    }
    if entry.len() >= max {
        return false;
    }
    entry.push_back(now);
    true
}

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub master_key: [u8; KEY_LEN],
    pub email_hmac_key: [u8; KEY_LEN],
    pub mailer: Mailer,
    pub rate_limiter: RateLimiter,
    pub base_url: String,
    /// URL externe du front, utilisée pour rediriger l'utilisateur après le
    /// consume d'un magic link. En dev : `http://localhost:4321`. En prod :
    /// même domaine que `base_url` via Caddy.
    pub front_url: String,
    /// Pose le flag `Secure` sur les cookies de session. False en dev
    /// (HTTP localhost), true en prod derrière Caddy/HTTPS.
    pub secure_cookie: bool,
    /// Layer CORS appliqué au router. En dev cross-origin (front 4321 →
    /// back 3000), set via env `ALARTIC_CORS_ORIGIN`. En prod (same origin
    /// via Caddy), valeur par défaut = no-op.
    pub cors_layer: CorsLayer,
    /// Catalogue produits chargé au démarrage depuis `apps/web/content/products`.
    /// Source de vérité pour les prix lors du checkout (CDC §9.1).
    pub catalog: Arc<Catalog>,
    /// Client API Payplug. Configuré avec `PAYPLUG_SECRET_KEY` (sk_test_* en dev).
    pub payplug: PayplugClient,
    /// Identité légale du vendeur (mentions obligatoires facture, CGI art. 242
    /// nonies A). Chargée depuis env au boot.
    pub seller: SellerInfo,
}

impl AppState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        pool: PgPool,
        master_key: [u8; KEY_LEN],
        email_hmac_key: [u8; KEY_LEN],
        mailer: Mailer,
        base_url: String,
        front_url: String,
        secure_cookie: bool,
        cors_layer: CorsLayer,
        catalog: Arc<Catalog>,
        payplug: PayplugClient,
        seller: SellerInfo,
    ) -> Self {
        Self {
            pool,
            master_key,
            email_hmac_key,
            mailer,
            rate_limiter: Arc::new(Mutex::new(HashMap::new())),
            base_url,
            front_url,
            secure_cookie,
            cors_layer,
            catalog,
            payplug,
            seller,
        }
    }
}
