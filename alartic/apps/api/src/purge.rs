//! Jobs de purge périodiques. Tournent dans une tâche tokio détachée.
//!
//! - Magic link tokens expirés > 1h → DELETE. Le délai d'1h permet à un
//!   utilisateur de débugger un lien "trop tard" en relisant les logs.
//! - Sessions expirées → DELETE direct (pas de période de grâce).
//! - Cycle de vie comptes RGPD (CDC §10.6) — appliqué une fois toutes les
//!   24h pour limiter la charge :
//!     * users inactifs > 3 ans et pas déjà supprimés → soft delete.
//!     * (alerte 2 ans inactivité : à brancher quand le mailer admin sera
//!       prêt — pour l'instant, juste un log.)
//!
//! Démarré depuis `main()` au boot. La tâche s'arrête naturellement quand
//! le runtime tokio s'éteint.

use crate::audit;
use sqlx::PgPool;
use std::time::Duration;
use tokio::time::interval;
use tracing::{error, info};

const PURGE_INTERVAL: Duration = Duration::from_secs(5 * 60);
/// 24h en cycles de 5 min → on lance le job RGPD une fois sur 288.
const RGPD_EVERY_N_TICKS: u64 = 288;

pub fn spawn(pool: PgPool) {
    tokio::spawn(async move {
        let mut ticker = interval(PURGE_INTERVAL);
        let mut tick_count: u64 = 0;
        loop {
            ticker.tick().await;
            tick_count = tick_count.wrapping_add(1);

            if let Err(err) = run_short_lived(&pool).await {
                error!(error = %err, "short-lived purge failed");
            }

            if tick_count.is_multiple_of(RGPD_EVERY_N_TICKS)
                && let Err(err) = run_rgpd(&pool).await
            {
                error!(error = %err, "RGPD lifecycle job failed");
            }
        }
    });
}

async fn run_short_lived(pool: &PgPool) -> Result<(), sqlx::Error> {
    let tokens = sqlx::query(
        "DELETE FROM magic_link_tokens WHERE expires_at < NOW() - INTERVAL '1 hour'",
    )
    .execute(pool)
    .await?;

    let sessions = sqlx::query("DELETE FROM sessions WHERE expires_at < NOW()")
        .execute(pool)
        .await?;

    let ect = sqlx::query(
        "DELETE FROM email_change_tokens WHERE expires_at < NOW() - INTERVAL '1 hour'",
    )
    .execute(pool)
    .await?;

    if tokens.rows_affected() > 0
        || sessions.rows_affected() > 0
        || ect.rows_affected() > 0
    {
        info!(
            tokens_purged = tokens.rows_affected(),
            sessions_purged = sessions.rows_affected(),
            email_change_tokens_purged = ect.rows_affected(),
            "short-lived purge ran"
        );
    }
    Ok(())
}

/// Soft delete des users inactifs > 3 ans. Pas de DELETE physique : on
/// conservera la row (anonymisée plus tard par un autre job) pour
/// l'archivage facture 10 ans (CCom L123-22).
pub async fn run_rgpd(pool: &PgPool) -> Result<(), sqlx::Error> {
    let rows: Vec<(uuid::Uuid,)> = sqlx::query_as(
        "UPDATE users
         SET deleted_at = NOW()
         WHERE deleted_at IS NULL
           AND last_login_at IS NOT NULL
           AND last_login_at < NOW() - INTERVAL '3 years'
         RETURNING id",
    )
    .fetch_all(pool)
    .await?;

    if !rows.is_empty() {
        info!(
            users_marked_deleted = rows.len(),
            "RGPD lifecycle: soft-deleted inactive accounts"
        );
        // Audit log par user (un row chacun pour traçabilité fine).
        for (user_id,) in rows {
            audit::log(
                pool,
                None, // action système
                "user.delete.rgpd_inactivity",
                Some("user"),
                Some(user_id),
                None,
            )
            .await;
        }
        // Purge des sessions des users fraîchement supprimés (defense-in-depth :
        // session::verify les rejette déjà, mais on libère les rows).
        sqlx::query(
            "DELETE FROM sessions
             WHERE user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL)",
        )
        .execute(pool)
        .await?;
    }

    Ok(())
}
