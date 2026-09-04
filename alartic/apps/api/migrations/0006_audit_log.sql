-- Table `audit_log` — CDC §6 (zero-log côté Caddy mais journal applicatif) et
-- §12 (toutes actions admin loggées). Alimentée par le code en dur sur les
-- actions sensibles, sans IP ni user-agent (CDC §6 — ces données restent
-- exclues même côté DB).
--
-- - `actor_user_id` : NULL si action système (jobs cron, signup silencieux,
--   magic link consommé avant connexion).
-- - `action` : verbe court, namespace par '.'. Conventions :
--     auth.magic_link.request, auth.magic_link.consume,
--     auth.session.create, auth.session.delete,
--     user.suspend, user.delete,
--     ticket.create, ticket.message,
--     admin.login, admin.action.*
-- - `target_*` : type + id de la ressource modifiée. NULL si pas pertinent.
-- - `metadata` JSONB : libre, mais **jamais de données sensibles** (pas
--   d'email clair, pas d'IP, pas de body de message).

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(32),
    target_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index par actor pour les requêtes "qu'a fait X ?" (espace client +
-- back-office).
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, created_at DESC)
    WHERE actor_user_id IS NOT NULL;

-- Index par action pour le rapport de transparence (CDC §6 alimente les
-- compteurs à partir de 2027).
CREATE INDEX audit_log_action_idx ON audit_log (action, created_at DESC);
