# Audit et correctifs — déploiement Fly.io — 2026-09-08/09

Audit du site déployé `https://coach-entrainement.fly.dev/`, en autonomie,
avec accès flyctl (jeton fourni par l'utilisateur) et mot de passe du site.
Sauvegarde prise avant toute écriture en production
(`apps/coach/backups/coach-fly-prod-2026-09-08T23-46-38-avant-deploiement.db`,
intégrité vérifiée par `PRAGMA integrity_check`).

## Constat de départ, avant tout correctif

Le déploiement Fly est **postérieur à toute documentation** : `fly.toml`
n'existait nulle part dans le dépôt, et la base de production s'est révélée
**vide** (0 activité) — c'est un environnement Fly neuf, jamais lié aux 145
activités de la base locale ni à un compte Strava. Le passage à Fly.io n'a
donc pas eu le temps de développer ses propres bugs d'usage ; les problèmes
trouvés sont presque tous des problèmes de **déploiement**, pas de logique
métier.

## BLOQUANT

| Symptôme observé | Prod / local | Cause | Correctif | Commit |
|---|---|---|---|---|
| La machine Fly s'arrêtait de force toutes les ~5 min, avec une fenêtre de quelques secondes de requêtes en échec au redémarrage suivant (`"Trial machine stopping. To run for longer than 5m0s, add a credit card…"`) | Prod | Compte Fly en **essai gratuit**, sans carte bancaire enregistrée — limite plateforme, pas un bug applicatif | Carte ajoutée par l'utilisateur en cours de session ; confirmé résolu (6 min de fonctionnement continu observées, arrêt final propre via l'autostop normal pour inactivité, pas la limite d'essai) | — (action compte, pas de commit) |
| Après un redéploiement, le conteneur ne démarrait plus du tout : `Error: Cannot find module 'effect'` pendant `prisma migrate deploy`, boucle de crash jusqu'au plafond de 10 redémarrages Fly | Prod | La copie manuelle de `node_modules/.prisma`, `@prisma` et `prisma` dans l'image ne suit pas la fermeture transitive de `@prisma/config` (`effect` → `fast-check` → `pure-rand`…), qui vit hors de `@prisma/`. Reproduit en local avec exactement le même sous-ensemble de `node_modules` que l'image, avant tout correctif. | Installation isolée du seul paquet `prisma` (version exacte lue dans `package-lock.json`) dans un étage Docker dédié, dont le `node_modules` complet est copié tel quel — robuste aux futures mises à jour, sans énumération manuelle. Vérifié par redéploiement réel : migrations appliquées, démarrage propre. | `657b3ec` |

## MAJEUR

| Symptôme observé | Prod / local | Cause | Correctif | Commit |
|---|---|---|---|---|
| Import CSV : une ligne avec une distance ou une durée à virgule (« 7,5 », format Excel français) était rejetée comme invalide | Les deux (code partagé) | `Number("7,5")` renvoie `NaN` — seul le point était accepté | Remplacement de la virgule par un point avant `Number()`. Test verrou (rouge avant / vert après). | `b239c8c` |
| La photo d'ambiance de fond (`/progression` et ailleurs) renvoyait une erreur 400 (« The requested resource isn't a valid image ») via `/_next/image`, alors que le fichier source était valide et lisible | Prod (confirmé, mécanisme identique en local) | `/_next/image` ne lit **jamais** un fichier local directement pour l'optimiser : Next refait une **requête interne** à travers le serveur, donc à travers le middleware (`fetchInternalImage`, `next/dist/server/image-optimizer.js`) — sans cookie de session. `.webp` (seul format du dossier `photos/`) manquait de la liste `PUBLIC_FILE` du middleware : cette requête interne était redirigée vers `/login`, et Next recevait du HTML au lieu de l'image. Diagnostiqué en éliminant méthodiquement les autres pistes (fichier absent, `sharp` cassé, proxy Fly) — toutes confirmées saines par des tests directs sur la machine (SSH), avant de retrouver la vraie cause dans le code source de Next.js. | Ajout de `.webp` à `PUBLIC_FILE`. Test verrou sur le middleware (rouge avant / vert après). Vérifié en direct : 400 → 200 après redéploiement. | `e8e90d0` |
| `fly.toml` absent de tout le dépôt | — | Jamais committé depuis le passage à Fly.io | Reconstruit depuis `flyctl config show`, validé (`flyctl config validate`) | `829f0e4` |

## MINEUR

| Symptôme observé | Prod / local | Cause | Correctif | Commit |
|---|---|---|---|---|
| `/simulateur`, `/reglages/postes`, `/analyses/export` avaient une largeur et un alignement incohérents avec le reste de l'app (aucun conteneur, 1100 px, 640 px au lieu des 1200 px partagés) — point 23 du cahier des charges, confirmé par balayage Playwright complet | Les deux | Trois pages n'utilisaient pas le composant `PageContainer` partagé | Uniformisé sur `PageContainer` | `e76add1` |
| Chaque déploiement Fly envoyait inutilement `node_modules` (874 Mo), `.next`, la base locale et les fichiers `.env` au constructeur distant | Prod (déploiement) | Aucun `.dockerignore` | Ajouté, aligné sur `.gitignore` | `b029b39` |
| Après un redéploiement, un onglet resté ouvert affichait l'overlay d'erreur générique (« Server Action introuvable » / `ChunkLoadError`) au lieu d'un message actionnable | Les deux (pertinent surtout en prod, redéploiements fréquents) | Aucune détection du cas « bundle client périmé » | Message dédié « Nouvelle version disponible » + bouton recharger, sur détection `ChunkLoadError`/message Next.js dédié. Testé (4 cas). | `9a71537` |

## Fonctionnalité ajoutée (hors correctif, demandée en cours de session)

| # | Description | Commit |
|---|---|---|
| 1 | Formulaire de saisie du Client ID / Client Secret Strava dans Réglages (stocké chiffré en base, même primitive que les jetons Strava), avec explications pas-à-pas pour un débutant. Évite d'avoir à éditer `.env` et redémarrer le conteneur — impraticable sur Fly. `STRAVA_CLIENT_ID`/`SECRET` dans `.env` restent une alternative pour docker compose (la base l'emporte si les deux sont renseignés). | `83bf044` |

## Confirmé déjà correct — vérifié, pas de correctif nécessaire

- **R5** (rejet CSV si `zone` contredit `fc_cible_min/max`) : implémenté et testé (`parse.ts`, 4 tests dédiés).
- **Encodage CSV** (UTF-8 strict puis repli CP1252) : implémenté et testé.
- **`assertNoSecrets`** : couvre bien les trois formats d'export (md, json, zip).
- **`CRON_SECRET`** sur `/api/strava/sync` : comparaison en temps constant (`safeEqual`), 401 sans secret ou secret erroné.
- **En-tête cliquable** (point 17) : le logo/titre renvoie déjà à l'accueil.
- **Hydratation `/reglages/profil`** (point 14) : non reproduite — balayage Playwright complet (12 pages × 2 thèmes × 2 largeurs, session authentifiée en prod) sans un seul avertissement d'hydratation.
- **Contrôle d'accès en production** : vérifié route par route avec et sans cookie — toutes les pages protégées (dont `/debug/tokens`, `/debug/components`) redirigent vers `/login` ; `/login`, le manifeste et `/api/strava/webhook` (403 sans jeton) restent publics comme prévu ; `/api/strava/sync` répond 401 sans le bon secret.
- **Persistance SQLite** : volume `coach_data` bien monté sur `/app/data`, `DATABASE_URL` pointe dedans, une seule machine (SQLite ne supporte pas plusieurs writers).
- **Écoute réseau** : le conteneur exécute `node server.js` (sortie standalone) avec `HOSTNAME=0.0.0.0`, pas `npm start`/`next start -H 127.0.0.1` — la crainte initiale sur ce point ne s'appliquait pas au chemin Docker.
- **`TZ=Europe/Paris`** correctement propagée (date affichée dans l'en-tête et poste du jour justes).
- **Migrations au démarrage** : `prisma migrate deploy` s'exécute bien avant le serveur (une fois le bug BLOQUANT ci-dessus corrigé).

## Faux bugs — rien corrigé, cause réelle documentée

- **Statut « suspended » dans `flyctl apps list`** : reflète l'`autostop` normal pour inactivité (`auto_stop_machines: true`, `min_machines_running: 0`), pas une panne. Le site répond correctement dès la première requête (redémarrage en < 1 s, healthcheck repassant en quelques secondes).
- **Timeout Playwright au tout premier chargement de `/activites/[id]` en local** : compilation à froid de la route par le serveur de dev (le même trajet a répondu en 1,7 s dès le deuxième essai). Motif déjà identifié le 07/09, reproduit à l'identique ici.
- **Erreurs « error reporting health » pendant les builds Fly distants** : télémétrie interne de Next.js/npm, sans rapport avec le build ou le déploiement lui-même (les deux occurrences observées n'ont eu aucun effet sur le résultat).

## Décisions qui reviennent à l'utilisateur

- **Peupler la base de production** : la base Fly est vide (0 activité, Strava jamais connecté). Deux options exposées, discutées avec l'utilisateur en cours de session :
  1. Reconnexion Strava à neuf (nouveau profil) — l'utilisateur a indiqué vouloir partir sur cette option. Le formulaire de saisie des identifiants est en place (`83bf044`) ; **reste à faire côté utilisateur** : créer/adapter l'application sur le portail développeur Strava (callback domain `coach-entrainement.fly.dev`), saisir Client ID/Secret dans Réglages, puis cliquer « Connecter Strava » (étape qui exige son consentement OAuth personnel, non automatisable).
  2. Migrer la base locale (145 activités, 224 tours, données santé COROS) vers le volume Fly — non retenue pour l'instant, restait disponible si l'utilisateur change d'avis. Non exécutée : opération sensible sur la base de prod, à ne faire qu'avec une décision explicite et les mêmes précautions que la sauvegarde (backup avant, vérification après).

## Reste ouvert

- **Compte Strava non connecté en production** — voir ci-dessus, dépend de l'utilisateur.
- **Commentaire obsolète dans `prisma/schema.prisma`** (`hrZonesJson`/`paceZonesJson`, lignes ~57-59) : décrit encore un calcul « dérivées de hrMax/hrRest (Karvonen) » alors que Karvonen a été retiré du système de zones (CONSOLIDATION.md, étape 3.2 — seul `lib/metrics/zones.ts` fait autorité, sur la FC seuil). Repéré en lisant le schéma, hors périmètre de cet audit (commentaire trompeur, pas un bug de comportement) ; à corriger à l'occasion.
- **`/activites/[id]` non testée en conditions réelles en production** faute de toute activité en base — la page fonctionne (testée localement avec les vraies données en copie isolée), mais pas revérifiée en direct sur Fly.

## Vérification finale

- `npm run typecheck` / `npm run lint` / `npm test` (455/455) / `npm run build` : verts après chaque commit.
- Un seul déploiement final (après les correctifs Prisma CLI et `.webp`, qui ont chacun nécessité un redéploiement pour être vérifiés en conditions réelles).
- Post-déploiement : les 11 pages authentifiées répondent 200, l'accès sans cookie redirige vers `/login`, l'image d'ambiance répond 200, le formulaire Strava est en ligne.
- **Retour en arrière possible** : `flyctl releases -a coach-entrainement` liste l'historique ; la release `v5` est le dernier état antérieur à toute intervention de cette session (`flyctl releases rollback v5 -a coach-entrainement` — jamais exécuté, juste documenté ici en cas de besoin).

## Documentation mise à jour

`apps/coach/README.md` — nouvelle section Déploiement Fly.io (commandes, variables attendues, volume, migrations, retour en arrière), absente jusqu'ici alors que c'est l'environnement réellement utilisé.
