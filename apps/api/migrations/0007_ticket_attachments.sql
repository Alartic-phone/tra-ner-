-- Table `ticket_attachments` — pièces jointes des tickets SAV.
--
-- Choix de stockage :
-- - Contenu binaire stocké directement en BYTEA dans la DB (pas sur filesystem
--   séparé). Avantages : un seul backup (Postgres dump), chiffrement LUKS du
--   volume protège tout, pas de fichier orphelin si on rate un delete.
-- - Contre : limite de taille par fichier (5 MB ci-dessous), et la DB grossit
--   plus vite. Acceptable au volume cible (« quelques dizaines de tickets/mois
--   en alpha »). Si la table dépasse 10 GB, migrer vers Infomaniak Swiss
--   Object Storage avec chiffrement applicatif côté client.
-- - `filename_encrypted` : nom de fichier chiffré AES-GCM (peut contenir le
--   modèle du téléphone, n° de série, etc.).
-- - `content_encrypted` : contenu binaire chiffré AES-GCM.
-- - `mime_type` : VARCHAR validé par CHECK, whitelist explicite.
-- - `size_bytes` borné à 5 MB côté CHECK (filet de sécu, le handler valide aussi).

CREATE TABLE ticket_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    filename_encrypted BYTEA NOT NULL,
    mime_type VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL,
    content_encrypted BYTEA NOT NULL,
    uploaded_by VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ticket_attachments_uploader_valid CHECK (uploaded_by IN ('user', 'admin')),
    CONSTRAINT ticket_attachments_mime_valid CHECK (mime_type IN (
        'image/png',
        'image/jpeg',
        'image/webp',
        'application/pdf',
        'text/plain'
    )),
    CONSTRAINT ticket_attachments_size_max CHECK (size_bytes > 0 AND size_bytes <= 5242880)
);

CREATE INDEX ticket_attachments_ticket_idx
    ON ticket_attachments (ticket_id, created_at);
