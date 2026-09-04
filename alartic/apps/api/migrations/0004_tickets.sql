-- Table `tickets` — CDC §11 (espace SAV).
--
-- Choix de modélisation :
-- - `category` et `status` sont des enums applicatifs gardés en VARCHAR + CHECK
--   plutôt qu'en types Postgres ENUM (plus simple à faire évoluer).
-- - `subject_encrypted` BYTEA : sujet du ticket chiffré AES-256-GCM (même clé
--   maîtresse que les autres champs sensibles). Le sujet peut révéler une
--   information sur un appareil ou un incident — chiffré comme tout le reste.
-- - Pas de FK directe ticket → user au moment des messages : `tickets.user_id`
--   référence `users.id` une seule fois, on en hérite côté messages via JOIN.
-- - `closed_at` séparé de `status = 'closed'` pour conserver l'horodatage
--   précis quand un ticket fermé est rouvert.

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(32) NOT NULL,
    subject_encrypted BYTEA NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    CONSTRAINT tickets_category_valid CHECK (
        category IN ('question', 'probleme_technique', 'garantie', 'autre')
    ),
    CONSTRAINT tickets_status_valid CHECK (
        status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')
    )
);

CREATE INDEX tickets_user_idx ON tickets (user_id, updated_at DESC);

-- Tickets ouverts/en cours uniquement — sert au dashboard admin et aux jobs
-- de relance automatique (à venir).
CREATE INDEX tickets_active_idx
    ON tickets (updated_at DESC)
    WHERE status NOT IN ('resolved', 'closed');

CREATE TRIGGER tickets_set_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
