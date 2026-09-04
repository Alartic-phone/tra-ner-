-- Table `order_items` — lignes de commande, snapshot au moment du checkout.
--
-- On dénormalise sciemment : `product_name`, `variant_color_name`,
-- `variant_storage_label` sont copiés depuis le catalogue (Decap) au moment
-- de la création. Ainsi, si le client renomme un produit après vente, la
-- facture historique reste fidèle au texte que le client avait vu.
--
-- - `mod_mic` / `mod_front_cam` / `mod_rear_cam` : modifications matérielles
--   ALARTIC (suppression physique des composants). Booléens distincts pour
--   pouvoir indexer si besoin. Pas de surcoût appliqué pour J4 (inclus dans
--   le pack), mais structure prête si on facture plus tard.
-- - Prix unitaire + qty + total_ligne : tous en centimes. `line_total_cents`
--   est dénormalisé pour les rapports, mais doit toujours = unit_price * qty.

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

    product_slug VARCHAR(64) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    variant_color_slug VARCHAR(32) NOT NULL,
    variant_color_name VARCHAR(64) NOT NULL,
    variant_storage_slug VARCHAR(16) NOT NULL,
    variant_storage_label VARCHAR(32) NOT NULL,

    mod_mic BOOLEAN NOT NULL DEFAULT FALSE,
    mod_front_cam BOOLEAN NOT NULL DEFAULT FALSE,
    mod_rear_cam BOOLEAN NOT NULL DEFAULT FALSE,

    unit_price_cents BIGINT NOT NULL,
    qty INTEGER NOT NULL,
    line_total_cents BIGINT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT order_items_qty_valid CHECK (qty > 0 AND qty <= 99),
    CONSTRAINT order_items_unit_price_positive CHECK (unit_price_cents > 0),
    CONSTRAINT order_items_line_total_positive CHECK (line_total_cents > 0),
    CONSTRAINT order_items_line_total_matches CHECK (line_total_cents = unit_price_cents * qty)
);

CREATE INDEX order_items_order_idx ON order_items (order_id);
