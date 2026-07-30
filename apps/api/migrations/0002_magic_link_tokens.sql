-- Table `magic_link_tokens` — CDC §10.2.
--
-- Choix de sécurité :
-- - On stocke uniquement le SHA-256 du jeton (`token_hash`), JAMAIS le jeton
--   clair. Une fuite de la table ne révèle aucun secret exploitable.
-- - `token_hash` est PRIMARY KEY (32 bytes, fixé par CHECK).
-- - Pas de FK vers `users` : à la consommation on retrouve l'utilisateur via
--   `email_hash` (qui correspond à `users.email_hash`). Permet aussi de
--   préparer un magic link AVANT que le compte n'existe (signup silencieux).
-- - `expires_at` ≤ created_at + 15 min (CDC §10.2). Contrainte applicative,
--   pas SQL (pour rester flexible sur la durée selon le contexte).
-- - Usage unique = on DELETE le row à la première consommation (pas un flag).
-- - Index `(email_hash, created_at DESC)` pour le rate-limit 3/15min/email.

CREATE TABLE magic_link_tokens (
    token_hash BYTEA PRIMARY KEY,
    email_hash BYTEA NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT token_hash_length CHECK (octet_length(token_hash) = 32),
    CONSTRAINT magic_email_hash_length CHECK (octet_length(email_hash) = 32)
);

CREATE INDEX magic_link_tokens_email_created_idx
    ON magic_link_tokens (email_hash, created_at DESC);

-- Index pour le job de purge périodique des tokens expirés.
CREATE INDEX magic_link_tokens_expires_idx
    ON magic_link_tokens (expires_at);
