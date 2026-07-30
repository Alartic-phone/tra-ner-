# ALARTIC

> Site e-commerce privacy-first vendant des Pixel durcis sous **GrapheneOS**. Hébergé en Suisse. Zéro tracker. Souveraineté technique.

Source de vérité commerciale : `Cahier_des_charges_ALARTIC_Version_Finale.pdf` (signé QW 2026-05-08, TB 2026-05-11).

---

## Démarrage rapide

### Front public (Astro)

```bash
npm install
npm run dev:web        # http://localhost:4321
```

### Back-end API (Rust + Axum, à partir de J3)

```bash
npm run db:up          # Postgres 16 + Mailpit en Docker
cd apps/api && cargo run
# → API sur http://127.0.0.1:3000
```

- **Mailpit** (capture des emails en dev) : http://localhost:8025
- **Postgres** : `localhost:5432` (bind 127.0.0.1, jamais 0.0.0.0)

Avant le premier `cargo run` : copier `.env.example` → `.env` et générer les clés crypto :

```bash
openssl rand -hex 32   # à coller dans ALARTIC_MASTER_KEY et ALARTIC_EMAIL_HMAC_KEY
```

### Decap CMS (édition contenu)

En dev local, démarrer le proxy git :

```bash
npx decap-server       # proxy sur :8081
```

Puis ouvrir http://localhost:4321/admin/ — édition directe des `.md` du repo.

---

## Stack

| Couche | Tech | Note |
|---|---|---|
| Front public | **Astro 5** SSG + CSS vanilla + custom properties | scoped CSS Astro, pas de framework UI |
| Polices | **Geist Variable** + **Fraunces Variable** | auto-hébergées via Fontsource npm |
| Back-end | **Rust + Axum + sqlx** | sécurité mémoire native, surface minimale |
| Base de données | **PostgreSQL 16** | LUKS au repos + AES-256-GCM applicatif sur champs sensibles |
| Web server | **Caddy 2** | auto-TLS Let's Encrypt, TLS 1.3 only |
| CMS éditorial | **Decap CMS** (auto-hébergé) | Markdown via Git, zéro BDD CMS |
| Email transactionnel | SMTP Infomaniak Mail | SPF + DKIM + DMARC obligatoires |
| Analytics | **Plausible** auto-hébergé | sans cookies, IP anonymisée, rétention ≤ 30 j |
| Hébergement | **VPS Cloud Infomaniak** (Suisse) | 2 vCPU / 4 Go / 40 Go SSD NVMe |
| Forge & CI | **Codeberg** + Forgejo Actions | hosted runners Codeberg |
| Conteneurisation | Docker + Docker Compose | images distroless en prod, digest hash, jamais `:latest` |

Détail des choix : voir vault Obsidian `Projets/Alartic/decisions.md` (ADR append-only).

---

## Principes non négociables

1. **Zéro tracker.** Pas de pub, pas de retargeting, pas de pixel social.
2. **Aucune ressource tierce.** Polices, JS, images, fonts — tout auto-hébergé.
3. **Collecte minimale.** RGPD strict, on ne demande que le nécessaire.
4. **Transparence.** Manifeste, sécurité, confidentialité accessibles et techniques.
5. **Performance mesurée.** Lighthouse ≥ 90 sur toutes les métriques publiques.
6. **Chiffrement systématique.** Au repos (LUKS + AES-256-GCM) et en transit (TLS 1.3).

> Avant tout ajout de dépendance ou d'intégration : **vérifier que ces 6 principes ne sont pas cassés.** Une PR qui contredit l'un d'eux ne sera pas mergée, même si elle fonctionne techniquement.

---

## Structure du dépôt

```
ALARTIC/
├── apps/
│   ├── web/                       ← Front Astro
│   │   ├── content/
│   │   │   ├── products/          ← 10 fiches Pixel (.md éditables Decap)
│   │   │   └── faq/               ← 6 questions/réponses
│   │   ├── public/
│   │   │   ├── admin/             ← Decap CMS (config.yml)
│   │   │   ├── products/          ← SVG produits
│   │   │   └── payments/          ← SVG moyens de paiement
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── atoms/         ← Button, Badge, Card, Container
│   │   │   │   └── molecules/     ← Header, Footer, ProductBuyBox, …
│   │   │   ├── layouts/           ← Base, Legal (avec bouton PDF)
│   │   │   ├── pages/             ← 17 routes statiques + /offres/[slug]
│   │   │   ├── styles/            ← tokens.css + global.css
│   │   │   └── content.config.ts  ← Schemas Zod (validation frontmatter)
│   │   ├── astro.config.mjs
│   │   └── Caddyfile              ← Config serveur prod
│   └── api/                       ← Back-end Rust/Axum (J3+)
│       ├── Cargo.toml
│       └── src/
├── .forgejo/workflows/            ← CI Forgejo Actions
├── docker-compose.yml             ← Postgres + Mailpit pour dev local
├── .env.example                   ← Template variables d'environnement
├── package.json                   ← Monorepo npm workspaces
├── CLAUDE.md                      ← Instructions développement (interne)
└── README.md                      ← Ce document
```

---

## Scripts

| Commande | Effet |
|---|---|
| `npm install` | Installe toutes les dépendances du monorepo |
| `npm run dev:web` | Lance Astro en dev (port 4321) |
| `npm run build:web` | Build statique de production |
| `npm run preview:web` | Prévisualise le build |
| `npm run typecheck:web` | Vérif TypeScript strict |
| `npm run db:up` | Démarre Postgres + Mailpit en arrière-plan |
| `npm run db:down` | Arrête les services Docker |
| `npm run db:reset` | Détruit et recrée (volumes inclus) |
| `npm run db:logs` | Suit les logs des conteneurs |
| `npm run audit` | `npm audit` critique uniquement |
| `cargo run` (depuis `apps/api/`) | Lance le binaire Axum |
| `cargo build --release` | Build optimisé pour image distroless |
| `cargo clippy` | Lint Rust strict |
| `cargo audit` | Vérif vulnérabilités dépendances |

---

## Conventions

### Commits

Format : `type(scope): description en français`

```
feat(api): magic link custom + rate limiting 3/15 min

Implémentation du module d'authentification sans mot de passe (CDC §10.2).
Jeton hashé en base, comparaison constant-time via subtle::ConstantTimeEq,
durée de vie 15 min, usage unique avec suppression à la consommation.

Audit code croisé planifié avant MEP (CDC §5.7).
```

Types : `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `perf`, `test`, `ci`.

Scopes : `web`, `api`, `content`, `infra`, `deps`, `ci`.

### Branches

- `main` — stable, déployable.
- `feat/<nom>` — nouvelle fonctionnalité.
- `fix/<nom>` — correction.
- **Pas de force-push sur `main`**, pas de `reset --hard` partagé.

### Code

- **CSP stricte** : aucun `<script>` ou `<style>` inline non bundlé. Astro extrait automatiquement les `<script>` des composants vers `/_astro/*.js`.
- **Aucune ressource externe** au runtime. CDN bannis. Toute lib bundlée et servie depuis notre domaine.
- **Variables CSS** depuis `apps/web/src/styles/tokens.css` — aucune couleur hardcodée dans les composants.
- **A11y** : `alt` sur toutes les images, ARIA correct, `focus-visible` sur tous les éléments interactifs, `prefers-reduced-motion` honoré.
- **TypeScript strict** côté front, `clippy` en `-W warnings` côté back.
- **Crypto** : uniquement crates whitelistées (`aes-gcm`, `argon2`, `subtle`, `ring`, `totp-rs`). **Pas de crypto ad-hoc** (CDC §5.7).
- **Lockfiles commités** : `package-lock.json` + `Cargo.lock`.

### Scripts de debug

Tout script jetable (logs ad-hoc, repro, snippets) va dans `debug/` (gitignored). Le supprimer dès que le bug est résolu. Si un script devient durablement utile, le promouvoir hors de `debug/` avec un nom propre.

---

## Workflow

1. Créer une branche depuis `main` à jour : `git checkout -b feat/<nom>`.
2. Commits petits et atomiques, messages clairs.
3. Build local OK :
   - `npm run build:web` + `npm run typecheck:web` côté front.
   - `cargo build` + `cargo clippy` côté back.
4. Push → la CI Forgejo doit passer (gitleaks + audit + typecheck + build).
5. Si en équipe : ouvrir une PR vers `main`, attendre review.
6. Merge classique (pas de squash sauf branche WIP).

### Avant chaque push

- [ ] Build front et back passent sans warning.
- [ ] Aucun `.env`, clé privée ou secret dans le diff (gitleaks vérifie en pre-commit).
- [ ] Aucune ressource externe ajoutée.
- [ ] Si UI : testé Chrome + Firefox + Safari (mobile inclus).
- [ ] Si nouvelle dépendance : `npm audit` / `cargo audit` clean.
- [ ] Contenu sensible (légal, sécurité) : signalé explicitement, relecture Thomas requise.

---

## Sécurité

> Vulnérabilité ? **Ne pas ouvrir d'issue publique.**

- Politique de divulgation responsable (VDP) + safe harbor : https://alartic.fr/securite
- Contact : `security@alartic.fr` (PGP recommandé, clé publiée sur le site)
- Engagement de réponse : **72 h ouvrées**.

Aucune poursuite ne sera engagée pour de la recherche de sécurité **de bonne foi**, sous réserve de respecter les règles publiées (pas d'exfiltration de données utilisateur, pas de DoS, pas de pivot vers les sous-traitants, embargo jusqu'à correction).

---

## Documentation

- **Cahier des charges** (commercial) : `Cahier_des_charges_ALARTIC_Version_Finale.pdf`.
- **Notes de développement** (architecture, ADR, planning, sessions) : vault Obsidian `Projets/Alartic/`.
- **Instructions développement & conventions internes** : [`CLAUDE.md`](CLAUDE.md).

---

## Contact

- **Direction produit / périmètre fonctionnel** : Thomas BEHAGUE — `contact@alartic.fr`
- **Développement & architecture** : Quentin WESSANG
- **Repo** : https://codeberg.org/Le_Dozo/Alartic

---

## Licence

Code propriétaire, tous droits réservés.

Les marques **Pixel** et **Google** appartiennent à Google LLC. ALARTIC **n'est pas affiliée à Google** et ne bénéficie d'aucune relation commerciale ou partenariale avec cette société. **GrapheneOS** est un projet open source indépendant (https://grapheneos.org).
