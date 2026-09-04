-- Table `ticket_messages` — CDC §11.
--
-- - `body_encrypted` BYTEA : corps du message chiffré AES-256-GCM.
-- - `sender` : 'user' ou 'admin'. Le côté admin sera mis à jour quand le
--   back-office (J4) postera des réponses.
-- - Ordre par `created_at` ASC pour afficher la conversation chronologique.

CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender VARCHAR(16) NOT NULL,
    body_encrypted BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ticket_messages_sender_valid CHECK (sender IN ('user', 'admin'))
);

CREATE INDEX ticket_messages_ticket_idx ON ticket_messages (ticket_id, created_at);
