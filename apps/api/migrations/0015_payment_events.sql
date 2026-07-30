-- Table `payment_events` — log brut des notifications reçues des providers.
--
-- CDC §6 (zero-log) : on stocke uniquement les payloads webhook reçus, pas
-- d'IP / user-agent / referer. C'est nécessaire pour :
-- - audit a posteriori en cas de litige (qui a notifié quoi à quel moment),
-- - idempotence (rejeu webhook : on a déjà traité ce event_type+payment_id).
--
-- - `raw_body` JSONB : payload tel que reçu (après vérif provider). NE PAS
--   stocker les secrets côté provider — Payplug ne les met pas dans le body
--   en clair de toute façon.
-- - `provider_payment_id` : id côté provider, utile pour retrouver toutes les
--   notifications relatives à un paiement.

CREATE TABLE payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    provider VARCHAR(32) NOT NULL,
    provider_payment_id VARCHAR(64),
    event_type VARCHAR(64) NOT NULL,
    raw_body JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_events_provider_valid CHECK (provider IN ('payplug', 'paypal'))
);

CREATE INDEX payment_events_order_idx ON payment_events (order_id, received_at DESC);
CREATE INDEX payment_events_payment_idx ON payment_events (provider, provider_payment_id, received_at DESC);
