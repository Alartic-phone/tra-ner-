# Coach — suivi d'entraînement (sous-projet autonome)

> **Ce dossier n'a aucun rapport avec le site ALARTIC.** Les règles du
> `CLAUDE.md` à la racine du dépôt (Astro, Rust/Axum, zéro ressource tierce,
> Decap, Codeberg, jalons du cahier des charges) **ne s'appliquent pas ici**.
> Ce projet a ses propres conventions, son propre `package.json` et son propre
> lockfile ; il est volontairement exclu des workspaces npm de la racine.

Application web **personnelle et mono-utilisateur** de suivi d'entraînement en
course à pied, pensée pour un travail en postes.

## Principe directeur : ne rien surdimensionner

Un seul utilisateur, pour toujours. Cela n'arrivera pas de changer. En
pratique :

- **pas d'inscription, pas de comptes multiples, pas de rôles, pas de partage** ;
- une seule ligne dans `User`, créée à l'onboarding ;
- aucune table ne porte de `userId` ;
- protection d'accès minimale : mot de passe unique en variable
  d'environnement + cookie de session signé HMAC. Pas de bibliothèque
  d'authentification.

Devant deux solutions, prendre systématiquement la plus simple et la plus
lisible. Ne jamais ajouter d'abstraction « au cas où ».

## Règle absolue : ne jamais inventer une donnée

- Une métrique absente s'affiche « non disponible » (`<Unavailable />`), jamais
  une estimation silencieuse, jamais zéro.
- Une métrique obtenue par approximation est marquée comme estimée
  (`<Stat estimated />`, champ `gapEstimated`, champ `trimpMethod`).
- Un `null` dans un flux signifie « capteur muet » et doit le rester :
  interpoler reviendrait à fabriquer une mesure.
- Les graphiques ne tronquent pas un axe sans le dire.

## Stack

- **Next.js 15** (App Router) + **TypeScript strict**
- **Tailwind CSS 4** (configuration CSS-first, `@theme` dans `globals.css`)
- **Prisma** + **SQLite** en local, schéma portable vers PostgreSQL
- **Zod** pour valider *toutes* les entrées : formulaires, réponses d'API
  externes, sorties JSON du modèle
- **Recharts** pour les graphiques
- **Vitest** pour les fonctions de calcul
- **@anthropic-ai/sdk** pour la génération de plans (phase 6)

Les primitives d'interface (`components/ui/`) sont écrites à la main dans le
style shadcn/ui plutôt qu'installées via son CLI, et il n'y a **aucune
dépendance Radix** : ces composants tiennent en quelques classes Tailwind, et
chaque dépendance en moins est une surface de rupture en moins.

## Conventions transverses

### Jours calendaires

Toute journée est une chaîne `"YYYY-MM-DD"` en Europe/Paris, **jamais un
`DateTime`**. Un `DateTime` pour représenter une journée réintroduit
systématiquement des bugs de fuseau. L'ordre lexicographique d'une date ISO
est l'ordre chronologique : tri et filtres d'intervalle fonctionnent
nativement.

Les instants réels (départ d'activité) restent des `DateTime` UTC. La
conversion instant → jour se fait **uniquement** dans `lib/time.ts`.

### Imports avec extension `.ts`

Les imports relatifs portent leur extension (`./cycle.ts`). C'est ce qui
permet d'exécuter les modules purs directement avec Node, sans build ni
runner. `allowImportingTsExtensions` est activé dans `tsconfig.json`.

### Portabilité du schéma

Pas d'`enum` Prisma, pas de type `Json`, pas de tableau scalaire — SQLite ne
les supporte pas. Les champs `*Json` sont des `String` validés par Zod.
Passer à PostgreSQL ne demande que de changer le bloc `datasource`.

## Architecture

```
src/lib/shifts/     Moteur de cycle de postes — TypeScript PUR, aucune
                    dépendance à Next ni à Prisma, testé unitairement.
                    repository.ts est la seule passerelle vers la base.
src/lib/metrics/    Moteur de calcul physiologique (phase 4). Mêmes règles :
                    pur, testé, commenté en français avec la source de
                    chaque formule.
src/lib/strava/     Client API, OAuth, file d'import persistée.
src/lib/coach/      Construction du contexte, appel du modèle, validation
                    Zod de la sortie, persistance (phase 6).
```

Les moteurs de calcul restent purs et testables. Toute lecture ou écriture en
base passe par un module `repository`.

## Le cycle de postes

- La séquence, les horaires et les contraintes sont **stockés en base** et
  modifiables dans les réglages. **Ne jamais coder une séquence en dur** dans
  le code applicatif ; `defaults.ts` ne contient que des valeurs d'amorçage.
- **Invariante de non-régression** : le cycle de référence faisant 49 jours
  (multiple de 7), les trois postes identiques consécutifs de chaque bloc
  tombent toujours vendredi/samedi/dimanche. `findTripleShiftViolations`
  vérifie cette propriété ; le test doit rester au vert.
- Les remplacements pendant les repos sont **la source d'imprévu numéro un**.
  Leur saisie doit tenir en deux appuis depuis le téléphone. Toute évolution
  de cette interface doit préserver cette contrainte.
- Une exception qui rétablit le cycle théorique est **supprimée**, pas
  stockée.

## Le modèle propose, le code arbitre (phase 6)

- Sortie JSON strictement typée, validée par Zod. En cas d'échec : relance
  automatique avec l'erreur, deux tentatives maximum, puis erreur explicite
  affichée.
- Toute allure et toute durée proposées sont **revérifiées côté code** contre
  les zones calculées et les contraintes de postes. Une séance violant une
  contrainte dure est rejetée et redemandée.
- Le raisonnement du modèle est conservé dans `PlanRevision` et affiché : le
  plan doit pouvoir être compris, pas subi.
- Garde-fous : douleur élevée ou persistante → récupération et suggestion de
  consulter, jamais « pousser quand même ». Ratio aigu/chronique > 1,5 →
  alerte et semaine suivante allégée d'office. Aucun conseil médical ou
  nutritionnel prescriptif.

## Sécurité

- Les jetons Strava sont chiffrés en AES-256-GCM (`lib/crypto.ts`) avec
  `ENCRYPTION_KEY`. **Jamais en clair en base.**
- Aucune primitive cryptographique maison : uniquement `node:crypto`.
- Le cookie de session est `httpOnly`, `sameSite=strict`, `secure` en
  production.
- L'état OAuth est vérifié en temps constant (`safeEqual`).
- Aucun secret dans le dépôt. `.env` est ignoré par git.

## Commentaires

En français. Les fonctions de calcul physiologique **citent la source de
chaque formule** (Banister, Foster, Riegel, Daniels, Karvonen…). Les
commentaires expliquent *pourquoi*, pas *quoi*.

## Commits

`type(scope): description` en français, comme le reste du dépôt :
`feat(coach):`, `fix(coach):`, `test(coach):`, `docs(coach):`.
