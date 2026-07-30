-- Ajout des champs contact chiffrés sur `users` (CDC §10.4).
--
-- - `address_encrypted` : JSON sérialisé puis AES-256-GCM. Permet d'ajouter
--   des champs (compl, étage, etc.) sans nouvelle migration. Le clair n'est
--   jamais en DB.
-- - `phone_encrypted` : string chiffrée AES-256-GCM.
-- - Tous deux NULL par défaut = pas encore renseignés. Le tunnel d'achat J4
--   exigera l'adresse au moment du checkout.

ALTER TABLE users
    ADD COLUMN address_encrypted BYTEA,
    ADD COLUMN phone_encrypted BYTEA;
