-- Table `dispatch_requests` — CDC §7.3 (devis pro > 5 unités).
--
-- Stocke les demandes de devis quand un visiteur passe le seuil 5 unités.
-- Différent d'un ticket SAV : pas de conversation continue côté API, c'est
-- géré dans la boîte mail pro@. La row sert seulement à alimenter le
-- back-office (J4 « Module Demandes de devis pro »).
--
-- L'email de contact est chiffré ; les autres champs (modèle, qty) ne sont
-- pas sensibles.

CREATE TABLE dispatch_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- L'utilisateur peut être anonyme (pas de session) — d'où nullable.
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email_encrypted BYTEA NOT NULL,
    company_name_encrypted BYTEA,
    siret_encrypted BYTEA,
    product_slug VARCHAR(64) NOT NULL,
    variant VARCHAR(64),
    quantity INTEGER NOT NULL,
    message_encrypted BYTEA,
    status VARCHAR(32) NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT dispatch_quantity_min CHECK (quantity >= 5),
    CONSTRAINT dispatch_status_valid CHECK (
        status IN ('new', 'in_progress', 'quoted', 'confirmed', 'cancelled')
    )
);

CREATE INDEX dispatch_requests_status_idx
    ON dispatch_requests (status, created_at DESC)
    WHERE status NOT IN ('confirmed', 'cancelled');

CREATE TRIGGER dispatch_requests_set_updated_at
    BEFORE UPDATE ON dispatch_requests
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
