# CONSOLIDATION.md

Journal de la consolidation des 14 worktrees `apps/coach` dans
`claude/running-training-tracker-app-qtfpzh`, septembre 2026. Chaque
correctif des branches fusionnées est listé avec son sort : **réappliqué**
(le composant du tronc a été modifié pour porter l'intention du correctif),
**déjà couvert** (le tronc faisait déjà la même chose, vérifié), ou **sans
objet** (la fonctionnalité qu'il touchait a été retirée/déplacée par la
refonte et n'a plus de prise).

Règle suivie partout : le composant du tronc est **toujours gardé**, jamais
un correctif jeté au prétexte que le fichier a changé (règle C1).

## Étape 2 — tronc

`worktree-coach-ui-redesign` fusionné sans conflit (`--no-ff`). 147 fichiers,
+7187/−1420. Deux migrations Prisma en attente découvertes et appliquées à
la vraie base après sauvegarde (`add_trace_path`, `add_notes_and_manual_lap`)
— voir le rapport de session pour le détail.

## Étape 3.1 — `worktree-coach-fixes` (19 commits)

| Hash | Intitulé | Fichier(s) de destination | Sort |
|---|---|---|---|
| `53ce4ab` | Volume de la semaine à zéro sur le tableau de bord | `app/(app)/page.tsx`, `components/ui/count-up.tsx`, `lib/metrics/volume.ts` | **Réappliqué**. Le tronc bornait déjà correctement sur la semaine calendaire et séparait déjà course/vélo dans la logique, mais **`count-up.tsx` réintroduisait la régression** (`useState(0)` au lieu de `useState(value)`) — corrigé. Ajout du volume vélo affiché à part (`weekRideKm`, absent du tronc) via `computeSportVolume`, déjà auto-fusionné proprement. |
| `d6a3ba1` | La semaine en cours sans sortie casse la série | `lib/metrics/streak.ts` | **Déjà couvert** côté calcul (fusion automatique, sans conflit, testé). Aucune surface d'affichage sur l'accueil actuellement — la carte « État de forme » qui l'affichait a été retirée/déplacée par la refonte vers `/analyses`. Fonction disponible et correcte, non réintégrée visuellement (hors checklist étape 5). |
| `85efeae` | Verrouille le compte à rebours de course à 56 jours | `lib/shifts/cycle.test.ts` | **Déjà couvert**. Fusion automatique sans conflit ; `diffDays(day, nextGoal.day)` déjà utilisé correctement dans `page.tsx`. |
| `f4e9419` | Verrouille la cohérence CTL / ratio aigu-chronique | `lib/metrics/metrics.test.ts` | **Déjà couvert**. Fusion automatique sans conflit. |
| `f7cc910` | Record de distance arrondi jusqu'à masquer la progression | `lib/metrics/records.ts`, `components/dashboard/record-progress-bar.tsx` | **Réappliqué** via son remplaçant. `record-progress-bar.tsx` est supprimé (obsolète) : son successeur `record-staircase.tsx` a déjà `decimals=2` par défaut et consomme la fonction pure extraite `longestRunProgression` (auto-fusionnée). Vérifié sur les données réelles : 10,71 km / 8,96 km affichés au 1/100. |
| `9615ba9` | Fraîcheur du jour perd la dernière mesure au lieu de la montrer | `lib/metrics/repository.ts`, `components/dashboard/readiness-banner.tsx` | **Réappliqué**. `readiness-banner.tsx` supprimé (obsolète, remplacé par la carte Fraîcheur + `freshness-gauge.tsx` du tronc). `loadFreshness` réécrite pour utiliser `findLatestReadinessMeasurement` (baseline sur 7 échantillons DISPONIBLES, pas une fenêtre calendaire fixe de 30 j) tout en gardant le type `Freshness` attendu par le composant du tronc. |
| `f74b6c8` | Créneau tardif et court se faisant passer pour de la qualité | `lib/shifts/availability.ts`, `lib/settings.ts`, `components/calendar/shift-settings-form.tsx` | **Déjà couvert**. Fusion automatique sans conflit. |
| `93daa39` | Modèle aberrant tirant la prédiction jusqu'à 14h00 | `lib/metrics/prediction.ts`, `app/(app)/simulateur/page.tsx` | **Déjà couvert**. Fusion automatique sans conflit. |
| `8c61318` | Projection de vitesse critique extrapolée sans limite | `lib/metrics/prediction.ts`, `app/(app)/simulateur/page.tsx` | **Déjà couvert**. Fusion automatique sans conflit. |
| `e666179` | Ancienneté de la performance de référence toujours inconnue | `lib/metrics/best-efforts.ts`, `lib/metrics/prediction.ts`, `lib/metrics/repository.ts` | **Déjà couvert**. `repository.ts` avait un conflit mais uniquement sur la liste d'imports ; le corps (`pickReferenceEffort`, `referenceDay`) s'est fusionné sans conflit. |
| `af535b5` | Légende dupliquée sur le graphique charge/forme/fatigue | `components/analytics/fitness-chart.tsx` | **Déjà couvert**. Fusion automatique sans conflit. |
| `21bdccb` | Étiquettes de fin de série superposées | `components/analytics/fitness-chart.tsx`, `lib/metrics/load.ts` | **Déjà couvert**. Fusion automatique sans conflit. |
| `efa6732` | Musculation et rameur affichaient « 0 m » | `app/(app)/activites/[id]/page.tsx`, `components/calendar/month-grid.tsx`, `components/activities/activity-card.tsx`, `lib/utils.ts` | **Réappliqué** à trois endroits distincts : `activites/[id]/page.tsx` avait déjà `hasDistance` (couvert), `month-grid.tsx` utilise maintenant `formatDistanceOrDuration` (réappliqué), `activites/page.tsx` (page liste, nouveau fichier du tronc que ce correctif n'a jamais vu) gérait déjà correctement le cas. `activity-card.tsx` supprimé (obsolète, remplacé par la page liste). |
| `1c2bf9c` | FC moyenne pondérée par le temps écoulé | `lib/metrics/zones.ts`, `lib/metrics/repository.ts` | **Déjà couvert**. Conflit sur les imports de `repository.ts` uniquement ; le corps (`computeMovingAverageHr`) s'est fusionné sans conflit. |
| `8e9597d` | Script de diagnostic des doublons d'activités | `scripts/check-duplicates.ts`, `package.json` | **Réappliqué**. Nouveau fichier auto-fusionné ; conflit trivial sur `package.json` (deux scripts npm ajoutés côte à côte), résolu en gardant les deux. |
| `d82d0bb` | Noms d'activité mélangeant français et anglais | `app/(app)/page.tsx`, `app/(app)/activites/[id]/page.tsx`, `app/(app)/calendrier/page.tsx`, `components/activities/activity-card.tsx` | **Réappliqué** à cinq endroits : `page.tsx` (accueil, dernière activité), `activites/[id]/page.tsx` (`displayName` était déjà calculé mais pas affiché — les deux `<h1>` utilisaient encore `activity.name` brut, corrigé), `calendrier/page.tsx` + `month-grid.tsx` (pastilles/popover), et **`activites/page.tsx`** — page liste créée par le tronc *après* ce correctif, qu'il n'a donc jamais vue : appliquée proactivement (même principe que C1, étendu à un fichier que le correctif original ne pouvait pas connaître). |
| `f23932c` | Chrono visé en fourchette plutôt qu'un point unique | `app/(app)/page.tsx`, `prisma/schema.prisma`, `lib/export/{schema,gather,markdown,markdown.test}.ts` | **Réappliqué**. Migration Prisma appliquée à la vraie base après sauvegarde. Carte « Prochaine course » de `page.tsx` corrigée (référençait encore l'ancien champ `targetTimeS`, supprimé par la migration — **aurait cassé le typecheck sans intervention**). Le système d'export du tronc (`lib/export/*`), créé après ce correctif, référençait aussi l'ancien champ : mis à jour pour porter la fourchette, avec `formatTimeRange` réutilisé pour la cohérence d'affichage. |
| `2844daf` | Course et vélo indiscernables sur le calendrier | `components/calendar/month-grid.tsx`, `components/activities/activity-icon.tsx`, `components/ui/badge.tsx` | **Déjà couvert** pour l'essentiel (`sportColor` déjà partagé des deux côtés) ; conflit résolu en gardant `formatDistanceOrDuration` + l'icône « réalisée » du tronc, combinés. |
| `7311c6e` | Jours hors mois atténués au point d'effacer leurs pastilles | `components/calendar/month-grid.tsx` | **Réappliqué**, combiné avec la fonctionnalité `isPast` du tronc (les deux sont complémentaires, pas concurrentes). |

**Bonus (bug du tronc découvert pendant la résolution, sans rapport avec un
correctif fusionné)** : `month-grid.tsx` référençait `Check` de
`lucide-react` sans l'importer — erreur de compilation latente dans le
commit du tronc lui-même, corrigée au passage.

## Étape 3.2 — `worktree-fix-hr-zones` (commit `c68c8c3` uniquement)

Cherry-pick isolé (`git cherry-pick -x c68c8c3`), sans le second commit
(`ab69bf2`, traité à part en étape 4). C'est le correctif le plus sensible
de toute la consolidation : `computeHeartRateZones` change de signature
(`(thresholdHr, hrMaxCap?)` au lieu de `(hrMax, hrRest)`, Karvonen retiré
du calcul des zones). **Un seul système de zones existe désormais dans tout
le code**, calé sur le seuil 175 bpm — vérifié Z1 <140 / Z2 140-158 / Z3
158-166 / Z4 166-179 / Z5 179+, verrouillé par test dans `metrics.test.ts`
(hérité du commit lui-même, inchangé).

| Fichier | Sort |
|---|---|
| `lib/metrics/zones.ts`, `lib/metrics/repository.ts`, `lib/coach/context.ts`, `components/profile/profile-form.tsx`, `components/analytics/zone-chart.tsx`, `lib/metrics/load.ts` | **Réappliqué**, fusion propre (conflits limités aux imports ou triviaux). |
| `app/(app)/activites/[id]/page.tsx`, `app/(app)/page.tsx` | **Réappliqué**, conflit résolu en combinant la nouvelle signature de zones avec les ajouts du tronc (`hasDistance`, `displayName`, `weekRideKm`) déjà en place. |
| `app/(app)/analyses/page.tsx` | **Déjà couvert**, fusion automatique sans conflit. |

**Audit complémentaire, indispensable pour cette règle précise** : la
recherche de tous les appels à `computeHeartRateZones(` dans `src/` a
révélé **trois sites que ce commit n'a jamais connus** (créés par le tronc
après son écriture) et qui appelaient encore la fonction avec l'ancienne
signature `(hrMax, hrRest)` — un bug silencieux (les types restent
compatibles, TypeScript ne le détecte pas) qui aurait réintroduit Karvonen
par la bande :
- `app/(app)/activites/page.tsx` (page liste) — **corrigé**.
- `lib/export/gather.ts` (système d'export du tronc) — **corrigé**.
- `app/debug/components/page.tsx` (page de démonstration du design system, données d'exemple) — **corrigé** (valeurs d'exemple alignées sur le seuil canonique 175/190).

Pas de nouveau test ajouté pour ces trois sites : ce sont du câblage
d'interface, hors du périmètre couvert par Vitest dans ce projet (cf.
CLAUDE.md, seules les fonctions de calcul pures sont testées) — cohérent
avec la convention déjà suivie par `af535b5`/`21bdccb` plus haut.

## Étape 3.3 — `worktree-coach-finitions`

6 commits, fusion `--no-ff`.

| Fichier(s) | Sort |
|---|---|
| `app/(app)/{activites/[id],activites,calendrier,}/loading.tsx`, `components/analytics/fitness-chart-lazy.tsx` | **Sans objet**. Squelettes de chargement écrits contre l'ANCIENNE mise en page (leurs propres commentaires disent « calque exactement page.tsx », qui a depuis été entièrement refondue). Le tronc a ses propres squelettes déjà alignés sur le rendu actuel — gardés tels quels. `fitness-chart-lazy.tsx` : les deux versions faisaient la même chose (Recharts en chunk séparé), le tronc gardé pour son `ChartSkeleton` dédié. |
| `app/(app)/{analyses,plan,reglages,reglages/postes,reglages/profil,simulateur}/loading.tsx`, `components/ui/skeleton.tsx` | **Réappliqué**. Ces squelettes couvraient des routes que le tronc n'avait pas encore équipées — fusion automatique sans conflit, gain net de couverture. |
| `app/globals.css`, `app/globals-contrast.test.ts` | **Réappliqué — bug réel confirmé par calcul**. `--color-faint` du tronc (`#6b7789`) mesure 3,98:1 sur `--color-surface` et 3,60:1 sur `--color-surface-2` — sous le seuil AA texte normal (4,5:1). Le test de contraste du tronc ne le détectait pas : il ne vérifiait ce ton que contre `AA_LARGE` (3:1, texte large), alors qu'il porte aussi du texte courant (hints, labels) ailleurs dans l'app. Valeur corrigée (`#7d889b`, 5,05:1 / 4,56:1) et **le test renforcé** avec deux nouveaux cas à `AA_NORMAL` pour couvrir cet usage réel. |
| `components/nav.tsx` | **Réappliqué — bug de rendu latent découvert en résolvant**. Le rendu mobile du tronc lisait déjà `mobileLabel` sur chaque lien (`{mobileLabel}` dans la barre du bas), mais le tableau `LINKS` du tronc ne définissait pas ce champ : chaque onglet principal aurait affiché « undefined » sous son icône sur mobile. Champ ajouté à toutes les entrées, valeurs alignées sur les libellés déjà courts du tronc (qui n'a pas le problème de départ de coach-finitions — « Tableau de bord » renommé « Accueil » avait déjà réglé la longueur). Le choix produit du tronc de mettre Progression en onglet principal (plutôt qu'Analyses) est conservé — c'est une décision de refonte documentée, pas un bug. |

**Bonus (bug du tronc découvert pendant la résolution, sans rapport avec un
correctif fusionné)** : `nav.tsx` importait `TRANSITION` depuis
`lib/motion.ts`, qui n'exporte que `DUR`/`EASE`/`SPRING_RECORD` — erreur de
compilation latente, corrigée (remplacé par `{ duration: DUR.base, ease:
EASE.out }`).

## Étape 3.4 — `worktree-nifty-weaving-hanrahan` (5 commits)

Branche la plus ancienne (30/08) : plusieurs de ses correctifs ciblaient
des bugs que des fusions ultérieures (coach-fixes, c68c8c3) ont depuis
refixés en mieux, sur le même terrain.

| Hash | Intitulé | Sort |
|---|---|---|
| `7e84b39` | CountUp affiche la vraie valeur au rendu | **Déjà couvert**. Même bug, même correction (SSR jamais à 0), déjà en place depuis la fusion de coach-fixes. |
| `e2881e5` | Volume "semaine" limité aux activités de course | **Déjà couvert**. `page.tsx` sépare déjà course/vélo (`runKmByDay` filtré par `isRun`, `weekRideKm` via `computeSportVolume`) depuis la fusion du tronc + 53ce4ab. |
| `eb66fa8` | Ne pas arrondir le précédent record | **Déjà couvert**. `record-progress-bar.tsx` (que ce correctif touchait) est supprimé, remplacé par `record-staircase.tsx` qui a déjà `decimals=2`. |
| `a906abe` | Fraîcheur retombe sur la dernière mesure disponible | **Déjà couvert, par une version supérieure**. `selectMostRecentAvailableDay` (recherche naïve sur `maxStalenessDays`, pas de recalcul de baseline) est une ébauche du même problème que `findLatestReadinessMeasurement` (9615ba9, déjà en place) résout plus complètement : baseline sur échantillons réellement disponibles plutôt qu'une fenêtre calendaire fixe. Fonction + 5 tests dédiés retirés (redondants, testent une fonction qui n'existe plus). |
| `34c2f5f` | Exclut les "meilleurs efforts" à une allure non plausible | **Réappliqué, fusion automatique sans conflit**. Correctif net et non redondant : `best-efforts.ts` rejette désormais toute référence plus lente que 12 min/km (`MAX_PLAUSIBLE_PACE_S_PER_KM`) avant qu'elle ne pollue Riegel/VDOT — complète 93daa39 (qui filtre les modèles en sortie) en filtrant la donnée source en amont. |

À ce stade, les cinq correctifs des étapes 3.1–3.4 se sont tous retrouvés,
directement ou par une version plus aboutie d'eux-mêmes, dans le code final.

## Étape 5 — checklist finale

| # | Vérification | Statut |
|---|---|---|
| 1 | typecheck, test et lint au vert | ✅ 354 tests, `tsc --noEmit` et `next lint` propres. |
| 2 | l'app démarre depuis la racine, pas seulement depuis un worktree | ⏳ **Non vérifiable par moi** : `consolidation/coach-merge` est un descendant direct (fast-forward) de `claude/running-training-tracker-app-qtfpzh`, mais je ne peux pas mettre à jour la branche dans le checkout principal (garde d'isolation du worktree, refusé explicitement en testant). Commande à lancer depuis la racine : `git checkout claude/running-training-tracker-app-qtfpzh && git merge --ff-only consolidation/coach-merge`. Le code et la base (chemin absolu) sont identiques quel que soit le worktree — aucune raison technique que ça diffère, mais je ne l'ai pas vu tourner depuis la racine moi-même. |
| 3 | aucun zéro affiché à la place d'une absence | ✅ pour les pages inspectées (accueil, activité, progression, analyses) — vérifié par capture et par le pattern `<Unavailable />`/`value: null` systématique. Pas d'audit pixel par pixel de réglages/plan/journal/simulateur. |
| 4 | toute valeur de modèle porte « est. », toute mesure ne l'a pas | ✅ pour les pages inspectées (badges « est. » visibles sur 5 km/10 km, vitesse critique, D'). Pas d'audit exhaustif. |
| 5 | UN SEUL système de zones FC, seuil 175 : Z1<140·Z2 140-158·Z3 158-166·Z4 166-179·Z5 179+, aucune trace de Karvonen | ✅ verrouillé par test (c68c8c3) + audit de code : 3 sites avec l'ancienne signature Karvonen trouvés et corrigés (`activites/page.tsx`, `lib/export/gather.ts`, page de debug) en plus des fichiers déjà couverts par la fusion. |
| 6 | semaine du 24 au 30 août = 24,68 km de course | ✅ vérifié en base : `SUM(distanceM) WHERE type='Run' AND startDay BETWEEN '2026-08-24' AND '2026-08-30'` = 24,6875 km. |
| 7 | plus longue sortie = 10,71 km le 29/08, précédent record 8,96 km | ✅ confirmé par capture d'écran (page Progression, mur des records et jalons). |
| 8 | le 25/10 affiche le bon nombre de jours restants | ✅ mais **le chiffre affiché est 50, pas 56** : la date système réelle a avancé de 6 jours depuis le rapport de bug original (30/08 → 05/09, aujourd'hui). 05/09 → 25/10 = 50 jours, arithmétique correcte pour la vraie date du jour — le calcul lui-même n'a pas de bug, verrouillé par test (85efeae, référence 30/08 → 56 j, toujours vert). |
| 9 | le lap manuel du 29/08 apparaît (19:47 · 4,03 km · 4'55/km · FC 177) | ❌ **non vérifié — vraie lacune de données**. `runActivityDetail` (sync Strava) ne renseignait jamais `isManual` en persistant les tours — corrigé pour tout futur import (`isManual = lap.split == null`), mais rétroactivement, sur les 137 activités actuelles, **aucun tour n'a `splitIndex` NULL** : le lap manuel attendu n'a jamais été importé comme tel. Correction possible sans re-synchroniser : le bouton bascule manuelle existe déjà sur chaque tour de la page activité (`toggleLapManualForm`) — mais je ne sais pas lequel des 12 tours de "Test de seuil" (29/08) correspond à l'effort décrit, donc je ne l'ai pas basculé moi-même. Alternative : resynchroniser cette activité via Strava. |
| 10 | aucune recommandation d'entraînement sur historique insuffisant (ACWR indéterminé plutôt qu'un chiffre + alerte rouge) | ✅ garde-fou vérifié (tests c68c8c3) et observé en conditions réelles : Foster (Monotonie/Contrainte) affiche « non disponible » sur `/analyses` faute d'activité les 7 derniers jours. Le ratio ACWR lui-même affiche 0,00 (« sous-charge »), un chiffre réel et non un guard bypass : l'historique TOTAL (~88 j, largement >28 j/8 j actifs requis) est suffisant, ce n'est que l'activité RÉCENTE (7 derniers jours) qui est nulle — faute de synchronisation depuis le 30/08. Comportement correct, pas un bug. |
| 11 | nombres au format français : virgule décimale partout | ✅ **bug réel et systémique corrigé** : ~25 sites (`CountUp`, `RecordStaircase`, `FreshnessGauge`, export Markdown, pages analyses/progression/simulateur/activités…) utilisaient `.toFixed()` natif (point). Helper `fixed()` ajouté à `lib/utils.ts`, appliqué partout où un nombre est affiché à l'utilisateur (pas dans le CSV — format machine, ni dans le prompt IA — jamais lu par un humain, ni dans les coordonnées SVG des tracés). Testé, vérifié visuellement (« 10,71 km », « 8,96 km »). |
| 12 | l'ambre n'est utilisé que pour aujourd'hui/un record/meilleure valeur/séance du jour, jamais un code de poste | ✅ vérifié par code : `--color-signal` (l'ambre) n'apparaît que sur le contour "aujourd'hui" du ruban de cycle et le libellé associé ; les segments colorés par poste utilisent une palette dédiée par type de poste (`shiftColorVar`), jamais l'ambre. |
| 13 | l'export Markdown se télécharge, section « qualité des données » non vide | ✅ vérifié en conditions réelles (requête HTTP directe sur `/api/export?scope=tout&format=md`) : 200, 130 Ko, section 9 renseignée (587 jours sans mesure de santé, 0 activité sans FC/GPS, aucun doublon, liste des champs estimés). |
| 14 | captures accueil/activité/progression/analyses en 1440 px et 390 px | ✅ toutes prises et envoyées en cours de session (le fichier le plus récent de chaque fait foi ; captures initiales remplacées après les correctifs de rendu). |

**Deux cases restent non cochées, avec leur raison précise** : #2 (fast-forward
à faire depuis la racine, hors de ma portée dans ce worktree isolé) et #9
(lap manuel jamais importé comme tel — lacune de données réelle, pas un bug
de fusion, corrigée pour l'avenir mais pas rétroactivement sans re-sync ou
bascule manuelle de votre part).

## Étape 5 — lint et régression trouvée grâce à lui

`next lint` échouait depuis le tout début de la consolidation
("Failed to patch ESLint..."). En creusant au lieu d'accepter ça comme une
incompatibilité de version figée : `eslint.config.mjs` consommait
`eslint-config-next` comme un tableau flat-config alors que cette version
(déjà la plus récente disponible) exporte encore sa configuration au
format legacy — corrigé avec `FlatCompat`.

Une fois le lint fonctionnel, il a immédiatement trouvé une **vraie
régression** qu'aucune fusion précédente n'avait signalée : le bandeau de
chiffres de la page activité affichait de nouveau « 0.00 km » et une
allure calculée depuis zéro pour les séances sans distance (musculation,
rameur) — exactement le bug qu'`efa6732` avait corrigé, perdu sur ce bloc
précis lors de la fusion du cherry-pick `c68c8c3`. Corrigé (voir commit
dédié). C'est le meilleur argument pour ne jamais laisser un outil de
vérification "de côté" dans une consolidation de cette taille.

## Étape 4 — les trois décisions mélangées de `ab69bf2`

Le commit original mélangeait trois décisions sans rapport ; traitées
séparément, aucune fusionnée telle quelle (`ab69bf2` datait d'avant toute la
refonte, ses 301 fichiers ne s'appliquaient plus tels quels).

- **4.1 Séparation Alartic** — appliquée. `apps/api`, `apps/web`, `tools/`,
  `CLAUDE.md`, `README.md`, `package.json`, `package-lock.json`,
  `.env.example`, `.npmrc`, `.githooks/`, `docker-compose.yml` déménagés
  sous `alartic/`. `apps/coach/` ne bouge pas (déjà hors des workspaces
  npm racine). `.forgejo/workflows/ci.yml` et `alartic/package.json`
  (chemin du hook Git) mis à jour en conséquence. `apps/coach/{CLAUDE.md,
  README.md}` pointent désormais vers `alartic/CLAUDE.md`.
- **4.2 Retrait de l'authentification** — appliqué, avec le garde-fou
  demandé. Exposition réseau vérifiée avant d'agir : `next dev` sans `-H`
  écoute sur toutes les interfaces (confirmé sur la machine, IP
  192.168.1.59 — celle vue dans les logs). `dev`/`start` passent
  maintenant `-H 127.0.0.1` : l'app n'est plus joignable que depuis cette
  machine. `lib/auth.ts`, `/login` et tous les gardes `isAuthenticated()`
  supprimés. Le port Docker était déjà borné à 127.0.0.1 ; son healthcheck
  (qui visait `/login`) corrigé. La section Vercel du README porte un
  avertissement explicite : sans réintroduire un contrôle d'accès, la
  déployer expose les données de santé à tout Internet, pas seulement au
  réseau local.
- **4.3 Nom de l'app** — décision utilisateur : garder **"Coach"**, pas de
  renommage "Trainer HUB". Le nom est désormais porté par une constante
  unique (`lib/app-config.ts`), utilisée par `layout.tsx`, `nav.tsx` et le
  manifeste PWA (`public/manifest.webmanifest` statique remplacé par
  `app/manifest.ts`, généré depuis la même constante).

## Étape 1 — arbitrages actés

- **`worktree-humming-coalescing-valley`** : non fusionnée.
  - `lib/export/security.ts` — **réappliqué** (filet anti-fuite de secrets
    sur l'export, adapté au tronc actuel : APP_PASSWORD/sessionToken
    retirés, plus aucun rapport avec le schéma courant). Câblé dans
    `build.ts`, testé.
  - `lib/export/size.ts` — confirmé déjà couvert par `previewExport`
    (`actions.ts`), rien pris.
  - Formulaire d'export interactif — **reporté**, non perdu : remplacer
    toute la plomberie d'export du tronc pour deux fonctionnalités
    (sections à cocher, flux bruts en option) a été jugé trop risqué en
    pleine consolidation. La branche reste intacte.
  - `splits.ts` — confirmé non nécessaire : le tronc a déjà un rendu de
    splits kilométriques peuplé pour 46/49 activités de course réelles.
- **`lib/metrics/milestones.ts`** (`worktree-progression-page`) —
  **réappliqué**. Coexiste avec le système « distance cumulée » du tronc,
  affiché en premier sur `/progression` (vérifié par capture d'écran :
  « Première sortie enregistrée », « Premier 20 km sur une semaine »,
  « Première sortie de plus de 10 km » précèdent bien les records de
  distance cumulée). `computeWeeklyVolume` ajoutée à `lib/metrics/volume.ts`
  (dépendance manquante, portée depuis la même branche). Testé (absent de
  la branche d'origine).
- **`ZONE_RAMP`** (`worktree-binary-plotting-waffle`) — **réappliqué**, et
  ce n'était pas qu'une consolidation cosmétique : la constante vivait dans
  un module `"use client"` (`zone-chart.tsx`), reçue comme référence opaque
  par `<ZoneBar />` quand il est rendu depuis un Server Component (la page
  d'activité) — bug réel et actif, confirmé avant/après par capture
  (`backgroundColor: rgba(0,0,0,0)` avant, couleurs réelles après).
  Déplacée dans `lib/metrics/zones.ts` (module pur). Testé (absent avant).
- **`activity-page-v2`, `calendar-v2`, `curious-wishing-stearns`** : rien à
  sauver, confirmé par diff.
