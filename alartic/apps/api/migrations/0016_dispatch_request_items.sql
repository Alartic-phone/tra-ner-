-- Devis pro multi-modèles — CDC §7.3 (extension).
--
-- Avant : dispatch_requests portait product_slug + variant + quantity directement
-- sur la row (un modèle par demande). Réalité métier : une entreprise mixe
-- 3 Pro XL + 8 standards + 2 tablettes → demande commune, pas 3 emails.
--
-- Après :
-- - dispatch_requests garde les colonnes parent (société/SIRET/contact/message)
-- - dispatch_request_items : 1 row par modèle/variante demandé(e)
-- - product_slug et quantity sur la parent deviennent NULL-able (rétrocompat
--   pour les rows pré-migration, mais nouveaux INSERT laisseront ces deux à NULL
--   et utiliseront la table fille).
--
-- La règle minimum 5 unités est désormais sur la SOMME (toutes lignes confondues),
-- vérifiée côté application — pas faisable proprement en CHECK déclaratif.

ALTER TABLE dispatch_requests
    ALTER COLUMN product_slug DROP NOT NULL,
    ALTER COLUMN quantity DROP NOT NULL;

ALTER TABLE dispatch_requests
    DROP CONSTRAINT IF EXISTS dispatch_quantity_min;

CREATE TABLE dispatch_request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_request_id UUID NOT NULL
        REFERENCES dispatch_requests(id) ON DELETE CASCADE,
    product_slug VARCHAR(64) NOT NULL,
    color_slug VARCHAR(32) NOT NULL,
    storage_slug VARCHAR(16) NOT NULL,
    quantity INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT dispatch_item_qty_positive CHECK (quantity >= 1 AND quantity <= 999)
);

CREATE INDEX dispatch_request_items_request_idx
    ON dispatch_request_items (dispatch_request_id);
