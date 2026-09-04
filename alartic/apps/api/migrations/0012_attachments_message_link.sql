-- Lien attachment ↔ message.
--
-- À ce stade J3, on n'a pas encore d'attachments en prod : on accepte donc
-- de laisser les éventuelles rows existantes en NULL (cas d'attachment
-- attaché au ticket sans message précis — legacy). Les nouveaux uploads
-- seront systématiquement rattachés au message correspondant côté handler.

ALTER TABLE ticket_attachments
    ADD COLUMN message_id UUID REFERENCES ticket_messages(id) ON DELETE CASCADE;

CREATE INDEX ticket_attachments_message_idx
    ON ticket_attachments (message_id)
    WHERE message_id IS NOT NULL;
