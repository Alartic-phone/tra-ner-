-- Table `orders` — CDC §9.1 (tunnel d'achat Payplug + PayPal).
--
-- Une row = une commande. Status machine d'état :
--   pending → paid → preparing → shipped → delivered → completed
--   pending → cancelled / failed
--   * → refunded
--
-- - `user_id` NULL autorisé : un compte est créé/lié au moment du checkout,
--   mais on garde la commande même si le compte est supprimé (preuve comptable
--   10 ans, art. L123-22 CCom — référencé CDC §10.6).
-- - Email chiffré + hashé (HMAC déterministe) pour pouvoir retrouver les
--   commandes d'un email donné sans déchiffrer toute la base.
-- - Adresses : JSON sérialisé puis AES-256-GCM, comme `users.address_encrypted`.
--   Permet d'ajouter des champs sans nouvelle migration.
-- - `cgv_version_id` : preuve juridique horodatée (CDC §9.1) — INSERT ne peut
--   pas être fait sans version de CGV active.
-- - `payplug_payment_id` / `paypal_order_id` : UNIQUE (idempotence webhook).
-- - Montants en BIGINT centimes (jamais de float pour de l'argent).

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Contact (chiffré applicatif, principe CDC §10.4).
    email_hash BYTEA NOT NULL,
    email_encrypted BYTEA NOT NULL,
    first_name_encrypted BYTEA NOT NULL,
    last_name_encrypted BYTEA NOT NULL,
    phone_encrypted BYTEA,

    -- Adresses (JSON chiffré). `shipping_address_encrypted` NULL = même que billing.
    billing_address_encrypted BYTEA NOT NULL,
    shipping_address_encrypted BYTEA,

    -- Mode B2B
    is_pro BOOLEAN NOT NULL DEFAULT FALSE,
    company_name_encrypted BYTEA,
    siret_encrypted BYTEA,

    -- Montants (centimes)
    subtotal_cents BIGINT NOT NULL,
    shipping_cents BIGINT NOT NULL DEFAULT 0,
    total_cents BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',

    -- Statut
    status VARCHAR(32) NOT NULL DEFAULT 'pending',

    -- Preuve juridique CGV
    cgv_version_id UUID NOT NULL REFERENCES cgv_versions(id),
    cgv_accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Lien provider de paiement
    payment_method VARCHAR(32),
    payplug_payment_id VARCHAR(64) UNIQUE,
    paypal_order_id VARCHAR(64) UNIQUE,

    -- Horodatages cycle de vie
    paid_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    tracking_number_encrypted BYTEA,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT orders_status_valid CHECK (
        status IN (
            'pending', 'paid', 'preparing', 'shipped',
            'delivered', 'completed', 'cancelled', 'failed', 'refunded'
        )
    ),
    CONSTRAINT orders_payment_method_valid CHECK (
        payment_method IS NULL OR payment_method IN ('payplug', 'paypal')
    ),
    CONSTRAINT orders_currency_valid CHECK (currency = 'EUR'),
    CONSTRAINT orders_total_positive CHECK (total_cents > 0),
    CONSTRAINT orders_subtotal_positive CHECK (subtotal_cents > 0),
    CONSTRAINT orders_shipping_nonneg CHECK (shipping_cents >= 0)
);

CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_email_hash_idx ON orders (email_hash, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC)
    WHERE status NOT IN ('completed', 'cancelled', 'failed', 'refunded');
CREATE INDEX orders_payplug_idx ON orders (payplug_payment_id)
    WHERE payplug_payment_id IS NOT NULL;

CREATE TRIGGER orders_set_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Seed CGV v1 par défaut (placeholder, à remplacer par texte définitif via
-- back-office J4). Indispensable pour que les premiers INSERT orders fonctionnent
-- en dev sans intervention manuelle.
INSERT INTO cgv_versions (slug, version, title, body)
SELECT 'cgv', 1, 'CGV ALARTIC — version initiale',
       'Conditions générales de vente — version placeholder J4. À remplacer via back-office.'
WHERE NOT EXISTS (SELECT 1 FROM cgv_versions WHERE slug = 'cgv');
