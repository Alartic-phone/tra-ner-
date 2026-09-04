//! Journal applicatif. Helpers pour logger les actions sensibles depuis les
//! handlers. Best-effort : un échec d'écriture audit ne doit pas faire échouer
//! l'action métier — on log juste l'erreur côté tracing.
//!
//! Conventions de naming (verbe.namespace.point) :
//! - `auth.magic_link.request|consume`
//! - `auth.session.delete`
//! - `user.suspend|delete`
//! - `ticket.create|message`
//! - `admin.*` (J4)

use serde_json::Value;
use sqlx::PgPool;
use tracing::warn;
use uuid::Uuid;

pub async fn log(
    pool: &PgPool,
    actor_user_id: Option<Uuid>,
    action: &str,
    target_type: Option<&str>,
    target_id: Option<Uuid>,
    metadata: Option<Value>,
) {
    let res = sqlx::query(
        "INSERT INTO audit_log (actor_user_id, action, target_type, target_id, metadata)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(actor_user_id)
    .bind(action)
    .bind(target_type)
    .bind(target_id)
    .bind(metadata)
    .execute(pool)
    .await;

    if let Err(err) = res {
        warn!(error = %err, action, "failed to write audit_log entry");
    }
}
