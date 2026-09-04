# Alartic

Site e-commerce privacy-first **ALARTIC** — vente de smartphones Pixel durcis sous GrapheneOS, ciblant journalistes, avocats, activistes et technophiles.

Source de vérité commerciale et technique : `Cahier_des_charges_ALARTIC_Version_Finale.pdf` (signé QW 08/05/2026, en attente signature TB).

## Principes non négociables (CDC §1)
1. Zéro tracker. Aucun outil pub / retargeting / pixel social.
2. Aucune ressource tierce — polices/JS/CDN auto-hébergés.
3. Collecte minimale (RGPD).
4. Transparence (Manifeste, Privacy, Sécurité accessibles et techniques).
5. Performance mesurée (TTFB, A11y).
6. Chiffrement systématique (au repos + en transit).

> Avant tout ajout de dépendance ou intégration : vérifier que ces 6 principes ne sont pas cassés.

## Stack cible (CDC §3.3)
- **Front public** : Astro 5 (SSG) + CSS vanilla + custom properties + GSAP 3 (auto-hébergé via npm, animations scroll-driven et hero entry) — `apps/web/`.
- **Back-end** : Axum (Rust) + Tokio + sqlx — `apps/api/` (à créer en J3).
- **DB** : PostgreSQL 16+ (LUKS au repos + AES-256-GCM applicatif sur champs sensibles).
- **Web server** : Caddy 2 (auto-TLS Let's Encrypt).
- **CMS éditorial** : Decap CMS (Markdown via Git, pas de BDD). **Tout l'éditorial passe par Decap** : fiches produits + images, Manifeste, À propos, FAQ, Compatibilité, pages légales (Mentions / CGV / Conditions de garantie / **Politique de confidentialité (RGPD)** / Politique de sécurité / Politique de cookies), Rapport de transparence. Dev livre des placeholders (lorem + photos neutres), client remplit via Decap après livraison — aucun contenu en attente côté Thomas pour la MEP technique.
- **Email transactionnel** : SMTP Infomaniak Mail (SPF/DKIM/DMARC obligatoires).
- **Analytics** : Plausible auto-hébergé (sans cookies, IP anonymisée, rétention ≤ 30 j).
- **Hébergement** : **VPS Cloud Infomaniak** (Suisse) — 2 vCPU / 4 Go RAM / 40 Go SSD NVMe minimum. **Pas de mutualisé** (incompatible Docker + daemon Postgres + binaire Rust + LUKS + Caddy custom). **Pas de Jelastic** (PaaS Docker plus cher à trafic égal et moins de contrôle sur TLS/headers/logs zero-log — or la souveraineté technique *est* notre positionnement). Compilation Rust en CI Codeberg, le VPS reçoit le binaire dans une image distroless. CDC §3.3 à actualiser côté client.
- **Forge** : Codeberg.
- **CI** : Forgejo Actions (`.forgejo/workflows/ci.yml`) — hosted runners Codeberg (codeberg-small pour J2, codeberg-medium pour J3+). Runner self-hosted optionnel en J5 si jobs lourds saturent les hosted. Migration depuis Codeberg CI / Woodpecker (incompatible repo privé). CDC §3.6 à actualiser côté client.
- **Conteneurisation** : Docker + Docker Compose (images distroless/alpine, digest hash, jamais `:latest` en prod).

## Scripts

### Front
- `npm run dev:web` — dev local Astro (port 4321)
- `npm run build:web` — build prod Astro
- `npm run preview:web` — preview build
- `npm run typecheck:web` — vérif TypeScript strict

### Infrastructure de dev (Docker Compose)
- `npm run db:up` — démarre Postgres 16 + Mailpit en arrière-plan
- `npm run db:down` — arrête tout
- `npm run db:reset` — détruit + recrée (volumes inclus)
- `npm run db:logs` — suit les logs
- Mailpit web UI : http://localhost:8025 (capture tous les emails sortants en dev)
- Postgres : `localhost:5432` (bind 127.0.0.1, jamais 0.0.0.0)

### Back-end (à ajouter quand `apps/api/` sera initialisé en J3)
- `cargo run` / `cargo watch -x run` depuis `apps/api/`
- `sqlx migrate run` pour les migrations
- `cargo audit` en CI

### Variables d'environnement
Copier `.env.example` → `.env` (gitignored). Générer les clés crypto avec
`openssl rand -hex 32`. En prod (J5) : secrets fournis par le gestionnaire
Infomaniak, **jamais en fichier**.

## Jalons (CDC §17.2)
1. **Maquettes** ✅ (validé implicitement par le travail Astro déjà commité).
2. **Intégration statique** — en cours (pages publiques, fiche produit, Decap, headers sécurité).
3. **Comptes & SAV** — back-end Axum, magic link custom, espace client, tickets.
4. **Payplug + Back-office** — tunnel B2C/B2B, PayPal, devis pro, 2FA TOTP, certificats préparation.
5. **Mise en ligne** — Infomaniak, SPF/DKIM/DMARC, sauvegardes, tests E2E, MEP.

Marche à suivre détaillée : `<vault>/Projets/Alartic/walkthrough.md`.

## Sécurité — exigences obligatoires (CDC §5, §10, §12)
- CSP stricte (mode `report-only` testé en pré-prod, puis `enforce`).
- TLS 1.3 only, HSTS preload si possible. Cible **SSL Labs A+**.
- Headers : nosniff, Referrer-Policy strict, Permissions-Policy restrictive.
- Cookies : Session/Panier/CSRF uniquement, SameSite=strict + Secure + HttpOnly.
- Aucun cookie tiers, **pas de Google reCAPTCHA** (utiliser hCaptcha ou honeypot).
- **Photos produits sous GrapheneOS uniquement** — pas de visuels Google.
- Pas de chatbot tiers (Intercom/Crisp/Drift).
- Magic link custom : jeton ≤ 15 min, usage unique (suppression hash), `subtle::ConstantTimeEq`, rate limiting 3/15 min/email. **Audit code croisé avant MEP**.
- Crypto : uniquement `aes-gcm`, `argon2`, `ring`, `sqlx`, `subtle`, `totp-rs`. **Pas d'implémentation crypto ad-hoc**.
- Clé maîtresse via gestionnaire secrets Infomaniak. Jamais en repo.
- Sauvegardes chiffrées **indépendamment** de la clé applicative.
- Politique zero-log (CDC §6) : pas de user-agent/referer/IP complète dans logs Caddy.

## Notes long-terme (vault Obsidian)
Dossier : `Projets/Alartic/` dans le vault `claude`
(`C:\Users\quent\Documents\Obsidian\Claude\Claude\Projets\Alartic\`).

- `index.md` — vue d'ensemble + stack + état + liens
- `walkthrough.md` — marche à suivre dev complète (J0 → post-MEP)
- `checklist.md` — TODO actionnable par jalon
- `decisions.md` — ADR (architecture, magic link, Payplug, Infomaniak, Decap, Codeberg)
- `sessions/YYYY-MM-DD.md` — journal des sessions
- `notes/` — notes atomiques (concepts, gotchas)

**Début de session** : lire `index.md`, `checklist.md`, dernière `sessions/*.md`.
**Pendant** : décisions non triviales → append à `decisions.md`. Concepts → `notes/` ou `Ressources/` selon réutilisabilité.
**Fin de session** ("résume" / "on s'arrête") : créer `sessions/<date>.md`.

## Conventions projet
- Commits : `type(scope): description` en français (`feat(web):`, `feat(api):`, `fix(web):`, `chore:`, `docs:`).
- Branches : `feat/<nom>`, `fix/<nom>`.
- Front : TypeScript strict, ESLint, Prettier. Lockfile `package-lock.json` commit. `npm audit` + Dependabot.
- Back : `clippy` warnings, `rustfmt` enforced. `Cargo.lock` commit. `cargo audit` en CI.
- Scripts de debug ad-hoc : dans `debug/` (gitignored), supprimer dès résolution.

## Codeberg
- Remote `origin` : `https://codeberg.org/Le_Dozo/Alartic` (déjà branché).
- Push à chaque version fonctionnelle (build OK, lint OK, parcours principal testé).
- Avant push : vérifier qu'aucun secret/.env n'est tracké.
- Pas de force-push sur `main`, pas de `reset --hard` partagé.
- MCP `forgejo` connecté côté Claude Code (gestion issues / PR / contenus via API).

### Workflow
1. Branche : `feat/<nom>` ou `fix/<nom>`.
2. Commits petits et lisibles.
3. Version fonctionnelle → push.
4. Session Obsidian fin de journée : `Projets/Alartic/sessions/<date>.md` (objectif, fait, blocages, prochaine étape, hash commits).

## À ne jamais faire
- Ajouter une ressource externe (CDN, font Google, JS tiers) → casse principe §2.
- Stocker un secret en clair (repo, Dockerfile, log) → casse principe §6.
- Installer un chatbot tiers ou Google reCAPTCHA → casse positionnement.
- Utiliser des photos officielles Google des Pixel → casse cohérence avec mention de non-affiliation.
- Faire une crypto custom hors crates whitelistées.
- Push direct sur prod : déploiement passe par CI Codeberg avec validation humaine.
