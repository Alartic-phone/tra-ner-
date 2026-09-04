-- Numérotation facture — CGI art. 242 nonies A.
--
-- Obligation : numéro **séquentiel, chronologique, sans rupture**. On utilise
-- une SEQUENCE Postgres, attribuée au moment du paiement confirmé (et non au
-- checkout) : une commande qui échoue ne consomme pas de numéro.
--
-- Format présenté à l'utilisateur : `ALARTIC-YYYY-NNNNNN` (année dérivée de
-- `invoiced_at`, NNNNNN = invoice_number zero-padded côté Rust).
--
-- `invoice_number` UNIQUE + NULL autorisé (pré-paiement). L'attribution se
-- fait via :
--   UPDATE orders
--   SET    invoice_number = nextval('invoice_seq'),
--          invoiced_at    = NOW()
--   WHERE  id = $1 AND invoice_number IS NULL
--   RETURNING invoice_number, invoiced_at;

ALTER TABLE orders
    ADD COLUMN invoice_number BIGINT UNIQUE,
    ADD COLUMN invoiced_at TIMESTAMPTZ;

CREATE SEQUENCE invoice_seq START 1;

CREATE INDEX orders_invoice_number_idx ON orders (invoice_number)
    WHERE invoice_number IS NOT NULL;
