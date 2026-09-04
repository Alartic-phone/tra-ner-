-- Table `cgv_versions` — CDC §9.1.
--
-- Versioning horodaté des Conditions Générales de Vente. Quand un client passe
-- commande (J4), on stocke `cgv_version_id` côté `orders` pour preuve juridique.
--
-- Modification → admin (J4 back-office) crée une nouvelle version, l'ancienne
-- reste consultable (jamais d'UPDATE in-place sur le texte).
-- - `slug` : 'cgv' pour les CGV B2C/B2B, plus tard 'garantie', 'cgu', etc.
-- - `version` : incrémental (1, 2, …). Unicité par slug.
-- - `body` : texte intégral à la version. Pas chiffré (document public).
-- - `effective_from` : début de validité (≥ created_at).

CREATE TABLE cgv_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(32) NOT NULL,
    version INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (slug, version)
);

CREATE INDEX cgv_versions_slug_effective_idx
    ON cgv_versions (slug, effective_from DESC);
