//! Connexion Postgres + migrations.
//!
//! - `DATABASE_URL` lue depuis l'environnement (voir `.env.example`).
//! - Pool sqlx avec timeouts conservateurs pour le dev local.
//! - Migrations embarquées via `sqlx::migrate!()` — appliquées au démarrage.
//!   En prod (J5), on bascule sur `sqlx-cli` exécuté en CI avec validation
//!   humaine, et on retire `migrate_on_startup()` du chemin de boot.

use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

pub async fn make_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await
}

pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

pub async fn ping(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(pool)
        .await
        .map(|_| ())
}
