-- Table `email_change_tokens` — double opt-in pour PATCH /me/email.
--
-- Quand l'utilisateur demande à changer son email, on ne touche pas tout de
-- suite à `users.email_hash`. Au lieu de ça :
--   1. On crée une entrée ici avec le hash + chiffrement du NOUVEL email.
--   2. On envoie un magic link au NOUVEL email.
--   3. Tant que l'utilisateur n'a pas cliqué, le compte garde son email actuel
--      et ses données sont intactes. Aucun risque que quelqu'un vole le
--      compte en demandant un change vers son propre email.
--
-- - `token_hash` SHA-256 (32 bytes), pareil que magic_link_tokens.
-- - Pas de FK vers magic_link_tokens car la sémantique est différente
--   (porteur d'un user_id authentifié + payload chiffré).
-- - `new_email_hash` aussi en BYTEA 32 bytes (HMAC-SHA256). Permet de
--   re-checker l'unicité au moment de la confirmation (un autre user peut
--   avoir pris l'email entre temps).

CREATE TABLE email_change_tokens (
    token_hash BYTEA PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email_hash BYTEA NOT NULL,
    new_email_encrypted BYTEA NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ect_token_hash_length CHECK (octet_length(token_hash) = 32),
    CONSTRAINT ect_new_email_hash_length CHECK (octet_length(new_email_hash) = 32)
);

CREATE INDEX email_change_tokens_user_idx ON email_change_tokens (user_id, created_at DESC);
CREATE INDEX email_change_tokens_expires_idx ON email_change_tokens (expires_at);
