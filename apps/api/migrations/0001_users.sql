-- Table `users` — première migration ALARTIC.
--
-- Choix CDC §10.4 :
-- - Pas de mot de passe : auth par magic link custom (§10.2) uniquement.
-- - Email stocké en double forme :
--     * `email_hash`        — HMAC-SHA256 déterministe pour recherche/unicité,
--                             clé HMAC en gestionnaire de secrets Infomaniak.
--     * `email_encrypted`   — AES-256-GCM(email) avec clé maîtresse applicative
--                             distincte de la clé HMAC. Sortie = nonce || ciphertext || tag.
-- - Cycle de vie (CDC §10.6) : `suspended_at` (suspension par l'utilisateur),
--   `deleted_at` (suppression auto après 3 ans d'inactivité — anonymisation
--   des commandes liées gérée côté job).
-- - `is_admin` réservé au back-office (§12), créé manuellement par le DBA,
--   jamais via inscription publique.
-- - UUID v4 natif (PG13+, pas besoin d'extension pgcrypto).

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash BYTEA NOT NULL UNIQUE,
    email_encrypted BYTEA NOT NULL,
    is_pro BOOLEAN NOT NULL DEFAULT FALSE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT email_hash_length CHECK (octet_length(email_hash) = 32)
);

-- Index partiel pour les jobs d'expiration (inactifs > 3 ans).
CREATE INDEX users_last_login_idx
    ON users (last_login_at)
    WHERE deleted_at IS NULL;

-- Trigger pour maintenir `updated_at` automatiquement.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
