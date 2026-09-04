# Coach — suivi d'entraînement course à pied

Application web **personnelle et mono-utilisateur** de suivi d'entraînement en
course à pied, conçue pour quelqu'un qui travaille en postes et dont le
planning rend inutilisables les plans calés sur une semaine de bureau.

> Ce dossier est un projet autonome à l'intérieur du dépôt. Il n'a **aucun
> rapport** avec le site ALARTIC (`apps/web`, `apps/api`) : les règles du
> `CLAUDE.md` racine ne s'y appliquent pas. Voir `apps/coach/CLAUDE.md`.

## Sommaire

- [Ce qui est développé](#ce-qui-est-développé)
- [Installation](#installation)
- [Créer l'application Strava](#créer-lapplication-strava)
- [Récupérer la clé API Anthropic](#récupérer-la-clé-api-anthropic)
- [Le cycle de postes](#le-cycle-de-postes)
- [Le moteur de calcul](#le-moteur-de-calcul)
- [Modèle de données](#modèle-de-données)
- [Sauvegarde et restauration](#sauvegarde-et-restauration)
- [Déploiement](#déploiement)
- [Import de l'historique COROS](#import-de-lhistorique-coros)
- [Tests](#tests)

## Ce qui est développé

| Phase | Contenu | État |
|---|---|---|
| 1 | Socle : Next.js, Prisma, schéma complet, protection par mot de passe, layout | **fait** |
| 2 | Cycle de postes, calendrier, exceptions, contraintes d'entraînement | **fait** |
| 3 | Strava : OAuth, import historique, synchronisation, activités | **fait** |
| 4 | Moteur de calcul (TRIMP, CTL/ATL/TSB, zones, découplage, prédiction) + page Analyses | **fait** |
| 5 | Journal et onboarding | à venir |
| 6 | Génération de plan par l'API Claude + adaptation hebdomadaire | à venir |
| 7 | Simulateur et prédictions | à venir |
| 8 | Import FIT, PWA hors-ligne, finitions | à venir |

Les pages des phases 4 à 8 existent déjà dans la navigation et annoncent
explicitement ce qu'elles contiendront. Elles n'affichent **aucune valeur
provisoire** : une métrique non calculée est affichée « non disponible ».

## Installation

Prérequis : **Node.js 22+**, `sqlite3` (pour les sauvegardes), et Docker si
vous voulez le déploiement conteneurisé.

> **Base de données partagée entre le dossier principal et les worktrees.**
> `DATABASE_URL` doit être un **chemin absolu**
> (`file:/chemin/complet/vers/apps/coach/prisma/dev.db`), jamais le
> `file:./dev.db` relatif de `.env.example`. Un chemin relatif fait qu'un
> `git worktree` (dossier différent) crée silencieusement sa **propre base
> vide** au lieu de lire les vraies données — c'est ce qui a fait
> disparaître les activités importées pendant la consolidation de
> septembre 2026. Un seul fichier physique `apps/coach/prisma/dev.db`
> (celui du dossier principal) fait autorité ; tout `.env` d'un worktree
> doit pointer dessus avec le même chemin absolu.

```bash
cd apps/coach

# 1. Dépendances
npm install

# 2. Configuration
cp .env.example .env
# Puis éditer DATABASE_URL pour y mettre le chemin ABSOLU vers
# apps/coach/prisma/dev.db du dossier principal (voir encadré ci-dessus).

# 3. Générer les secrets et les reporter dans .env
openssl rand -hex 32   # -> ENCRYPTION_KEY
openssl rand -hex 16   # -> STRAVA_WEBHOOK_VERIFY_TOKEN (si URL publique)
openssl rand -hex 16   # -> CRON_SECRET (si docker compose)

# 4. Choisir un mot de passe d'accès -> APP_PASSWORD (8 caractères minimum)

# 5. Créer la base et le client Prisma
npx prisma migrate dev --name init

# 6. Amorcer le cycle de postes et le profil
npm run db:seed

# 7. Lancer
npm run dev
```

L'application écoute sur <http://localhost:3000>. Le mot de passe demandé est
celui d'`APP_PASSWORD`.

### Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build et exécution en production |
| `npm run typecheck` | Vérification TypeScript stricte |
| `npm test` | Tests unitaires (Vitest) |
| `npm run db:migrate` | Créer et appliquer une migration |
| `npm run db:studio` | Explorateur de base Prisma |
| `npm run db:seed` | Amorçage (cycle de postes, profil) |
| `npm run backup` | Sauvegarde de la base |
| `npm run restore -- <fichier>` | Restauration |
| `npm run sync:strava` | Synchronisation Strava en ligne de commande |

## Créer l'application Strava

La montre COROS n'expose pas d'API publique aux particuliers — leur Open API
demande une validation partenaire. En revanche elle synchronise automatiquement
vers Strava, dont l'API s'obtient en quelques minutes. C'est donc le chemin
retenu.

1. Se connecter sur <https://www.strava.com/settings/api>.
2. Remplir le formulaire de création :
   - **Application Name** : `Coach` (ou ce que vous voulez).
   - **Category** : `Training`.
   - **Club** : laisser vide.
   - **Website** : `http://localhost:3000` en local.
   - **Authorization Callback Domain** : `localhost` en local, sinon **le
     domaine seul** de votre `PUBLIC_URL`, sans `https://` ni chemin
     (par exemple `coach.mondomaine.fr`). C'est l'erreur la plus fréquente.
3. Valider. Strava affiche un **Client ID** et un **Client Secret**.
4. Les reporter dans `.env` :

```env
STRAVA_CLIENT_ID="123456"
STRAVA_CLIENT_SECRET="……"
```

5. Redémarrer l'application, aller dans **Réglages → Strava → Connecter
   Strava**, et **accepter toutes les cases** sur l'écran de consentement.
   Sans `activity:read_all`, les activités marquées privées seraient absentes
   et la charge d'entraînement serait sous-estimée sans que rien ne le
   signale — l'application refuse d'ailleurs la connexion dans ce cas.

### Import de l'historique et quota

Après la connexion, l'import de tout l'historique démarre automatiquement. Il
passe par une file d'attente persistée en base :

- une requête par page de 100 activités, puis une requête de flux par activité ;
- le quota Strava est **lu dans les en-têtes de réponse**, pas supposé — il
  vaut 100 requêtes/15 min et 1 000/jour pour les applications récentes,
  200/2 000 pour les plus anciennes ;
- quand le quota est atteint, les tâches sont replanifiées et reprises plus
  tard ; en cas d'erreur, back-off exponentiel (1, 2, 4, 8 minutes) et
  abandon après cinq tentatives.

Concrètement, plusieurs années d'historique s'importent sur **plusieurs
heures voire quelques jours**. L'application reste utilisable pendant ce
temps. Le bouton « Reprendre l'import de l'historique » relance le dépilage.

### Synchronisation continue : deux modes, détectés automatiquement

- **`PUBLIC_URL` renseignée** → le webhook Strava est disponible. Créer
  l'abonnement une seule fois :

  ```bash
  curl -X POST https://www.strava.com/api/v3/push_subscriptions \
    -F client_id=$STRAVA_CLIENT_ID \
    -F client_secret=$STRAVA_CLIENT_SECRET \
    -F callback_url=$PUBLIC_URL/api/strava/webhook \
    -F verify_token=$STRAVA_WEBHOOK_VERIFY_TOKEN
  ```

  Strava appelle immédiatement le point d'entrée en `GET` pour le valider :
  l'application doit déjà tourner et être joignable.

- **`PUBLIC_URL` vide** → bouton « Synchroniser » dans les réglages, et cron
  quotidien (`npm run sync:strava`, ou le service `sync` de `docker compose`).

### Note sur les conditions d'utilisation de Strava

L'API Strava est publique et gratuite, mais son contrat d'utilisation encadre
ce que l'on a le droit de faire des données extraites — notamment leur usage
pour entraîner des modèles, et leur redistribution. Cette application est à
usage strictement personnel et ne redistribue rien, ce qui est le cas d'usage
prévu. À garder en tête si le projet devait un jour être partagé.

## Récupérer la clé API Anthropic

Nécessaire seulement à partir de la phase 6 (génération des plans).

1. Créer un compte sur <https://console.anthropic.com/>.
2. **Settings → API keys → Create key**. La clé n'est affichée qu'une fois.
3. Alimenter le compte (**Billing**) : les clés d'essai ont un crédit limité.
4. Reporter dans `.env` :

```env
ANTHROPIC_API_KEY="sk-ant-……"
ANTHROPIC_MODEL="claude-opus-5"
```

`ANTHROPIC_MODEL` est libre. La valeur par défaut est `claude-opus-5`.

## Le cycle de postes

C'est la fonctionnalité qui distingue cette application d'un plan générique.

### Définition

Le cycle est une suite de blocs « N jours travaillés puis M jours de repos »,
répétée à partir d'un jour d'ancrage. Il est **entièrement stocké en base** et
modifiable dans **Réglages → Cycle de postes** : aucune séquence n'est écrite
en dur dans le code applicatif.

Le cycle amorcé par défaut fait 49 jours, soit exactement 7 semaines :

| Bloc | Séquence | Durée | Repos suivant |
|---|---|---|---|
| 1 | M M A A A N N | 7 j | 9 j |
| 2 | M M M A A N N | 7 j | 10 j |
| 3 | M M A A N N N | 7 j | 9 j |

Ancrage : bloc 1 le **mercredi 26 août 2026**. Le cycle reboucle donc le
**mercredi 14 octobre 2026**.

Comme 49 est un multiple de 7, le cycle retombe à l'identique sur les mêmes
jours de la semaine. Il en découle une propriété structurante : **dans chaque
bloc, les trois postes identiques consécutifs tombent toujours sur
vendredi / samedi / dimanche**. Cette invariante sert de test de
non-régression du calendrier (`src/lib/shifts/cycle.test.ts`), vérifié sur
cinq ans. Si elle est violée, le calcul est faux.

### Remplacements

Les périodes de repos ne sont pas garanties : un jour de repos peut devenir un
poste, annoncé tardivement et sans régularité. C'est la source d'imprévu
numéro un, et l'interface est construite autour :

- **deux appuis** depuis le téléphone : la case du calendrier, puis le type de
  poste. Pas de formulaire, pas de page dédiée ;
- exceptions **bidirectionnelles** : repos → poste, poste → repos, poste →
  autre poste, sans aucune récurrence ;
- **sélection de plage** pour saisir plusieurs jours d'un coup ;
- **annulation** par le même geste (« Rétablir le cycle ») ;
- une exception qui rétablit exactement le cycle théorique est **supprimée**
  plutôt que stockée : la base ne garde que de vrais écarts ;
- le **taux réel de remplacements acceptés** est calculé et affiché. Il sera
  fourni au modèle lors de la génération du plan, pour que celui-ci soit
  calibré sur la disponibilité réelle et non sur une théorie optimiste.

### Contraintes d'entraînement

Dérivées des postes, toutes paramétrables dans les réglages :

- aucune séance de qualité dans les **12 h** suivant une sortie de poste de
  nuit — le créneau n'est pas perdu pour autant, l'application indique
  l'heure à partir de laquelle la qualité redevient possible ;
- **jamais de sortie longue** un jour de poste de nuit, ni la veille d'une
  entrée en nuit ;
- sur les journées travaillées, la séance doit tenir dans le créneau réel,
  calculé à partir des horaires du poste, des temps tampons et du sommeil ;
- les jours de repos, qui offrent les plus longs créneaux, sont réservés en
  priorité aux séances longues et aux séances clés.

Le calcul de disponibilité tient compte des postes de la veille et du
lendemain : une nuit déborde sur la journée suivante, et le sommeil se
reconstitue de jour.

## Le moteur de calcul

Tout est dans `src/lib/metrics/`, en TypeScript pur, sans dépendance à Next ni
à Prisma, et couvert par des tests aux valeurs de référence publiées.

| Module | Contenu | Source |
|---|---|---|
| `trimp.ts` | TRIMP, coefficient différencié selon le sexe | Banister (1991) |
| `load.ts` | Condition physique (42 j), fatigue (7 j), forme, ratio aigu/chronique, monotonie et contrainte | Gabbett (2016), Foster (1998) |
| `zones.ts` | Cinq zones de FC sur la réserve cardiaque, zones d'allure en % de VMA | Karvonen (1957) |
| `gap.ts` | Allure ajustée du dénivelé | Minetti (2002) |
| `decoupling.ts` | Découplage cardiaque Pa:Hr | Friel, Allen & Coggan |
| `prediction.ts` | Riegel, VDOT de Daniels, vitesse critique, fourchette et indice de confiance | Riegel (1981), Daniels & Gilbert (1979), Monod & Scherrer (1965) |
| `best-efforts.ts` | Meilleurs efforts par durée et par distance | — |

### Trois écarts assumés par rapport au cahier des charges

1. **Monotonie de Foster.** Le cahier des charges la décrit comme
   « l'écart-type de la charge hebdomadaire ». La définition de Foster est :
   *moyenne des charges quotidiennes ÷ écart-type de ces mêmes charges*, sur
   sept jours ; la contrainte vaut *charge hebdomadaire × monotonie*. C'est
   cette définition qui est implémentée.

2. **Pw:Hr n'est pas calculable.** La variante fondée sur la puissance exige un
   capteur de puissance de course, que ni Strava ni la COROS ne fournissent sur
   cette chaîne de données. Seul **Pa:Hr** (allure sur fréquence cardiaque) est
   calculé, et il est plus sensible au vent et au dénivelé.

3. **La GAP est un modèle, pas la GAP de Strava.** Strava n'expose pas la
   sienne par l'API. Celle-ci est recalculée avec le polynôme de Minetti, plus
   pentu en montée que le modèle propriétaire de Strava : les deux valeurs ne
   coïncideront pas. Elle est systématiquement marquée comme estimée.

### Traçabilité de la charge

Chaque activité porte un champ `trimpMethod` qui dit **comment** sa charge a été
obtenue, par ordre de préférence :

1. `banister_stream` — seconde par seconde, la forme fidèle ;
2. `banister_average` — sur la FC moyenne, faute de flux. **Sous-estime les
   fractionnés**, la pondération de Banister étant convexe ;
3. `rpe_foster` — RPE du journal × durée, faute de tout cardio ;
4. `coros_native` — valeur de la montre, la seule qui ne soit pas une
   estimation de notre part.

Si aucune source n'existe, la charge reste **nulle** — jamais remplacée par une
valeur d'apparence plausible. La page Analyses indique alors combien
d'activités de la période sont dans ce cas, et donc de combien la charge
affichée est sous-estimée.

### Recalculer

Les métriques sont calculées automatiquement à l'import des flux. Le bouton
**Calculer** de la page Analyses traite ce qui reste en attente, par lots
bornés en temps.

**Après toute modification de la FC max, de la FC de repos ou du sexe**, il faut
lancer **Tout recalculer** : le TRIMP dépend directement de ces trois valeurs,
et toutes les charges déjà calculées deviennent caduques. L'application le
rappelle à l'enregistrement du profil.

### Graphiques

Les palettes sont validées, pas choisies à l'œil : bande de clarté, plancher de
chroma, séparation pour les déficiences de vision des couleurs, contraste sur la
surface sombre réelle de l'application. Conséquences visibles :

- **jamais de double axe.** La charge, la condition physique et la fatigue
  partagent l'unité TRIMP et tiennent sur un axe unique ; la forme, qui est
  signée, a son propre graphique plutôt qu'une seconde échelle ;
- les zones de fréquence cardiaque forment une **rampe à teinte unique**, pas un
  arc-en-ciel : ce sont des degrés d'intensité, pas des catégories ;
- la période d'amorçage de la courbe de condition physique (42 jours pendant
  lesquels la moyenne mobile part de zéro) est **matérialisée** au lieu d'être
  masquée ;
- le temps sans mesure cardiaque n'est **pas** réparti au prorata dans les
  zones : il est compté à part et affiché.

## Modèle de données

Schéma dans `prisma/schema.prisma`. Trois conventions transverses :

1. **Portabilité SQLite → PostgreSQL.** Aucun `enum` Prisma ni type `Json`
   (non supportés par SQLite). Les champs `*Json` sont des `String` contenant
   du JSON validé par Zod à la lecture et à l'écriture.

2. **Les jours calendaires sont des `String` `"YYYY-MM-DD"`** en Europe/Paris,
   pas des `DateTime`. Un `DateTime` pour représenter une journée réintroduit
   systématiquement des bugs de fuseau (une séance du 14/10 stockée en UTC
   bascule au 13/10). L'ordre lexicographique d'une date ISO étant l'ordre
   chronologique, le tri et les filtres d'intervalle fonctionnent nativement.
   Les instants réels restent des `DateTime` en UTC.

3. **Aucune table ne porte de `userId`** : il y a exactement un utilisateur.

### Passer à PostgreSQL

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

puis `DATABASE_URL="postgresql://…"` et `npx prisma migrate dev`. Aucun autre
changement de code n'est nécessaire — c'est l'intérêt des conventions
ci-dessus. Les `Bytes` (flux compressés) deviennent des `bytea`.

## Sauvegarde et restauration

```bash
npm run backup                              # -> backups/coach-<horodatage>.db
npm run backup -- /media/disque/coach.db    # destination choisie
npm run restore -- backups/coach-2026-08-24T10-00-00.db
```

La sauvegarde utilise `VACUUM INTO`, qui écrit une copie **cohérente** même si
l'application écrit pendant l'opération — une simple copie de fichier peut
capturer un état intermédiaire. La restauration vérifie l'intégrité de la
sauvegarde avant de toucher à quoi que ce soit, et met la base actuelle de
côté sous un nom horodaté au lieu de l'écraser.

Automatiser, par exemple chaque nuit :

```cron
30 3 * * * cd /chemin/apps/coach && /usr/bin/npm run backup >> /var/log/coach-backup.log 2>&1
```

## Déploiement

### Docker Compose (par défaut)

```bash
cp .env.example .env   # compléter APP_PASSWORD, ENCRYPTION_KEY, CRON_SECRET
docker compose up -d
```

L'application écoute sur `127.0.0.1:3000` uniquement. Pour l'exposer, passer
par un reverse proxy terminant TLS. La base vit dans le volume `coach-data`.

Le service `sync` déclenche la synchronisation Strava une fois par jour ; il
est inutile si un webhook est configuré.

### Vercel + base distante

Le code ne connaît que `DATABASE_URL` : aucun aménagement particulier n'est
nécessaire.

1. Dans `prisma/schema.prisma`, passer le `provider` à `postgresql`.
2. Créer une base : **Neon**, **Supabase** ou **Vercel Postgres**.
   Pour **Turso** (SQLite distant), utiliser le provider `sqlite` avec
   l'adaptateur `@prisma/adapter-libsql` — la variante Postgres reste plus
   simple, et c'est celle recommandée ici.
3. Sur Vercel, déclarer les variables d'environnement de `.env.example`
   (`DATABASE_URL`, `APP_PASSWORD`, `ENCRYPTION_KEY`, `PUBLIC_URL`, les clés
   Strava et Anthropic).
4. `PUBLIC_URL` = l'URL de production : le webhook Strava devient utilisable,
   ce qui rend le cron inutile.
5. Déployer. Les migrations s'appliquent avec
   `npx prisma migrate deploy` (à mettre dans la commande de build).

Deux points d'attention : sur Vercel, une fonction serverless a une durée
d'exécution limitée — le worker d'import est déjà borné par un budget de temps
et reprend là où il s'est arrêté, ce qui est exactement le comportement
attendu. Et la sauvegarde `VACUUM INTO` ne vaut que pour SQLite : avec
PostgreSQL, utiliser `pg_dump`.

## Import de l'historique COROS

Prévu en phase 8 (`scripts/import-coros.ts`). Strava ignore une partie de ce
que calcule la montre — sommeil, HRV nocturne, statut de récupération, charge
d'entraînement propriétaire. L'import COROS et l'import de fichiers `.fit`
enrichiront les activités existantes (rapprochement par horodatage de départ,
tolérance ±5 min) ou créeront des `HealthMetric`.

Ces imports sont un **complément optionnel** : l'application est pleinement
fonctionnelle sans eux, en mode dégradé, avec un indicateur clair dans
l'interface quand une métrique n'est pas disponible.

## Tests

```bash
npm test
```

Les tests couvrent les fonctions de calcul pures, sans dépendance à Next.js :
`src/lib/shifts/` (arithmétique de jours, moteur de cycle, statistiques de
remplacement, créneaux disponibles et contraintes physiologiques). Le moteur
de calcul physiologique (phase 4) sera testé de la même manière, avec des
valeurs de référence connues.

## Principes tenus dans tout le projet

- **Ne jamais inventer une donnée absente.** Une métrique manquante affiche
  « non disponible ». Une métrique obtenue par approximation est marquée
  comme estimée. On doit toujours savoir ce qui est mesuré et ce qui est
  estimé.
- **Ne rien surdimensionner.** Un seul utilisateur, donc pas de comptes, pas
  de rôles, pas de partage, pas de bibliothèque d'authentification.
- **Le code arbitre, le modèle propose.** Les sorties de l'API Claude sont
  validées par Zod et revérifiées contre les zones calculées et les
  contraintes de postes.
- **Graphiques honnêtes** : axes non tronqués sans indication, incertitudes
  visibles, pas de gamification.
