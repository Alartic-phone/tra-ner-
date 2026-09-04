-- Table `sessions` — CDC §10.2.
--
-- Choix de sécurité :
-- - `id_hash` BYTEA PRIMARY KEY : SHA-256 du session_id clair envoyé au client
--   dans le cookie. Le secret reste côté client, la DB ne stocke que le hash.
-- - `user_id` UUID REFERENCES users(id) ON DELETE CASCADE : si l'utilisateur
--   est supprimé (RGPD), ses sessions disparaissent en cascade.
-- - `last_activity_at` mis à jour à chaque request authentifiée. Servira plus
--   tard à la politique d'inactivité (30 min pour le back-office admin §12).
-- - `expires_at` : durée absolue (par défaut 7 jours). Au-delà, lookup KO
--   même si activité récente.

CREATE TABLE sessions (
    id_hash BYTEA PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT session_id_hash_length CHECK (octet_length(id_hash) = 32)
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Pour le job de purge des sessions expirées.
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
