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
| 9 | le lap manuel du 29/08 apparaît (19:47 · 4,03 km · 4'55/km · FC 177) | ⏹️ **close sans correction : donnée absente à la source.** Après reconnexion du compte, re-synchronisation ciblée de cette activité réussie sans erreur (garde-fou + transaction en place, cf. section incident) : Strava a bien répondu, les 12 tours ont été remplacés, et **aucun des 12 n'a `splitIndex` NULL**. Strava étant la source de vérité pour les activités (cf. CLAUDE.md), créer une exception `isManual` à la main pour cette seule activité contredirait cette règle même écrite pendant la consolidation — décision de ne rien faire de plus ici, actée par l'utilisateur. Le résultat de l'effort reste dans son journal d'entraînement personnel, hors périmètre de l'app. **Repère retrouvable** : le bloc d'effort du 29/08 correspond aux splits automatiques #5 à #8 de l'activité "Test de seuil" (`cmte6rflc00021wcr0b9262ac`) — 3,95 km en 19:36 à 4'58/km, FC 174-183. |
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

## Après l'étape 5 — abandon de l'import COROS manuel (05/09/2026)

Décision de l'utilisateur, suite au point 2 relevé sur l'accueil (fraîcheur
indisponible) : plus jamais d'import de fichiers FIT COROS à la main.
Retrait de tout ce qui en dépend côté interface, sans supprimer de donnée
ni de schéma — c'est la même prudence que le reste de la consolidation,
appliquée à une décision produit plutôt qu'à une fusion.

- Carte « Fraîcheur » de l'accueil retirée (VFC, FC repos, verdict, règle
  d'arrêt shouldCancelSession) — Strava ne porte pas ces mesures, plus
  aucune source ne les alimentera. « Cette semaine » et « Dernière
  activité » remontent d'autant.
- Nouvelle page discrète (Réglages > Historique santé,
  `/reglages/sante`) : consultation brute des 88 jours archivés
  (01/06-29/08/2026), aucun verdict recalculé.
- Export Markdown : section 6 omise si aucune valeur exploitable sur la
  période demandée (le cas normal désormais hors périodes qui recoupent le
  bloc archivé), gardée sinon — numérotation des autres sections inchangée.
- Code mort retiré : `lib/metrics/readiness.ts` en entier, `FreshnessGauge`,
  `resolveFreshnessBadge`, `loadFreshness`/`Freshness`
  (repository.ts) → remplacée par `loadHealthHistory()`, une lecture brute.
  `getSyncStatus()` perd `corosWithStreams`.
- Gardé, comme demandé : les scripts `import:coros`/`import:coros:fit`
  (documentés manuels et optionnels dans le README), toutes les données
  `HealthMetric` et le schéma Prisma.

**Ce que ça inverse d'un non-négociable de l'étape 3** : « fraîcheur qui
retombe sur la dernière mesure » (correctif `9615ba9`/`a906abe`) faisait
partie des points que la consolidation devait absolument préserver.
Formulation exacte de l'utilisateur, à garder telle quelle : **la fraîcheur
n'est pas revenue à un bug, elle a été retirée sur sa décision, la source
de données n'existant plus** — rien à voir avec un doute sur la justesse
de `findLatestReadinessMeasurement` (jamais fautive), tout à voir avec
l'abandon d'un import manuel jugé trop fastidieux pour sa valeur.

**Remplacement sur l'accueil, choisi par l'utilisateur parmi trois
options montrées** (charge d'entraînement / dénivelé de la semaine /
prochain jalon) : la charge d'entraînement (ratio aigu/chronique),
« la seule des trois qui répond à *est-ce que je peux y aller
aujourd'hui* ». Deux conditions posées et tenues à la lettre :
- le garde-fou d'historique de `c68c8c3` s'applique intégralement (zone
  `indeterminee` → `<Unavailable />`, jamais un chiffre ni un verdict) ;
- libellé français explicite (« Charge · en progression maîtrisée »),
  valeur numérique en second avec son marqueur « est. » visible — jamais
  « ACWR 1,12 » nu.

Un seul chiffre, un seul verdict sur l'accueil : la monotonie/contrainte
de Foster reste sur `/analyses` uniquement, pas de retour au tableau de
bord surchargé qu'on vient de démonter.

## Après l'étape 5 — six points relevés en parcourant l'accueil (05/09/2026)

L'utilisateur a ouvert l'app lui-même. Six points, traités dans l'ordre
demandé — trois vrais bugs corrigés, deux causes de données identifiées
(rien à corriger en base), un réglage jamais mis à jour depuis l'amorçage.

1. **Badge « Feu vert » affiché sans mesure de fraîcheur** — corrigé.
   `resolveFreshnessBadge()` (lib/home.ts), testé. Voir commit dédié.
2. **Fraîcheur indisponible malgré des données COROS** — pas un bug
   d'import. `HealthMetric` s'arrête au 29/08 (rien réimporté depuis, même
   trou que Strava) ET `sleep-hrv.txt` est un export "Last 7 days" de
   l'appli COROS — structurellement limité à une semaine glissante à
   l'instant de l'export, jamais un historique complet comme
   `resting-hr.txt`. Une seule capture faite (29/08 00:14) : 6 jours de
   VFC en base (23 au 28/08), jamais assez pour la fenêtre de 7 jours que
   `findLatestReadinessMeasurement` exige. Il faudra ré-exporter
   régulièrement `sleep-hrv.txt` pour accumuler une vraie couverture.
3. **Bandeau « Repos » alors qu'un poste d'après-midi était attendu** —
   pas un bug de calcul (33 tests sur `shifts/cycle.ts`, toujours au vert,
   vérifié par calcul manuel indépendant). Le cycle enregistré en base est
   encore la valeur d'amorçage de `scripts/seed.ts` (ancre 26/08/2026,
   jamais corrigée pour le vrai cycle F/6) : avec cette ancre, le 05/09
   tombe bien en repos. Correction = mettre à jour Réglages > Cycle de
   postes avec les vrais paramètres, pas une correction de code.
4. **Barres de « Cette semaine » toujours des traits plats** — corrigé
   (bug CSS, `h-24` mal placé dans la chaîne flex). Voir commit dédié.
5. **Dernière activité affichant l'icône au lieu du tracé** — pas un bug.
   Vérifié : `ActivityStream.availableStreamsJson` de "Course à pied en
   soirée" (02/09) ne contient pas `latlng` — GPS réellement absent côté
   Strava pour cette sortie. `getTracePath` se rabat sur `null`
   correctement plutôt que d'inventer un tracé.
6. **Ambre utilisé sur un code de poste (ruban)** — corrigé. Voir commit
   dédié.

## Après l'étape 5 — compteurs Réglages sur des périmètres différents

Page Réglages : « Activités importées » (134) et « Avec flux détaillés »
(137) affichés côte à côte, comme si le second incluait forcément le
premier — impossible arithmétiquement, mais aucun des deux calculs n'était
faux en soi : `getSyncStatus()` (`lib/strava/sync.ts`) filtrait le premier
sur `source: "strava"` et le second sur `hasStreams: true` **sans filtre
de source**, comptant donc aussi les 3 séances tapis `source: "coros"`
(pas de contrepartie Strava — le tapis n'est jamais uploadé). Un troisième
site avait le même défaut : la ligne « Import de fichiers FIT » (COROS)
réutilisait ce même total toutes-sources sous une étiquette qui laissait
croire que ces flux venaient tous de COROS.

**Corrigé par libellé explicite** (pas par unification de périmètre — les
deux chiffres restent utiles séparément) : « Importées depuis Strava » /
« Avec flux, toutes sources » sur la carte Strava ; nouveau champ
`corosWithStreams` (source COROS uniquement) pour la ligne FIT. Test
verrou `sync.status-scope.test.ts` (base SQLite jetable, 4 cas) : vérifie
que les trois compteurs restent sur des périmètres distincts et que la
ligne FIT ne recompte jamais les activités Strava.

## Après l'étape 5 — incident : perte puis restauration des tours du 29/08

En tentant de re-synchroniser l'activité du 29/08 pour la case #9, mon
script pointait par erreur vers le **dépôt principal** au lieu de ce
worktree — chemin absolu mal copié. Le dépôt principal a son propre
`node_modules`, jamais régénéré depuis le 31 août : son client Prisma
ignorait totalement le champ `isManual` (ajouté par la migration de
l'étape 2). Séquence réelle : `runActivityDetail` a fait `deleteMany` (12
tours supprimés, validé) puis `createMany` a échoué à la validation
(« Unknown argument isManual ») **avant d'écrire quoi que ce soit** — les
12 tours de "Test de seuil" étaient vides en base, la vraie base de
production.

**Restauration**, avec le feu vert explicite de l'utilisateur et trois
conditions posées par lui : (1) nouvelle sauvegarde de l'état cassé avant
toute écriture, (2) requête de restauration montrée avant exécution,
strictement ciblée sur les lignes `Lap` de cette activité, (3) vérification
après coup. Restauré depuis `dev.db.avant-resync-lap-2908-*.bak` (prise
avant l'incident) : 12/12 tours revenus, splits #5-8 vérifiés valeur par
valeur (5:02/174 · 5:02/173 · 4:48/180 · 4:44/183), 143 activités et 204
tours hors 29/08 identiques avant/après — rien d'autre n'a bougé.

**Cause corrigée, pas seulement le symptôme** (demande explicite de
l'utilisateur) :
- `lib/schema-guard.ts` (nouveau) : compare schema.prisma au client Prisma
  généré réellement chargé, refuse de continuer si un champ déclaré est
  inconnu du client. Câblé au tout début de `runSyncWorker()` — le
  problème doit être détecté avant la première écriture, pas au milieu
  d'une transaction.
- `deleteMany` + `createMany` réunis dans `prisma.$transaction([...])`
  partout où ce motif touchait des données réelles : `replaceLaps()`
  (nouveau, `lib/strava/sync.ts`, site exact de l'incident) et
  `persistActivityMetrics()` (`lib/metrics/repository.ts`, même motif sur
  `bestEffort`, jamais déclenché par hasard jusqu'ici mais tout aussi
  fragile).
- Tests verrous : `schema-guard.test.ts` (reproduit exactement le
  scénario — `isManual` déclaré, absent d'un client fabriqué pour le
  test) et `sync.replace-laps.test.ts` (base SQLite jetable réelle, force
  une violation de contrainte unique pendant la recréation, vérifie que
  les 12 tours d'origine survivent intacts).

**Suite (même session)** : `node_modules` du dépôt principal réinstallé et
régénéré (`npm install` + `prisma generate`, périmé depuis le 31 août —
c'est la cause racine de tout l'incident). Nouvelle sauvegarde prise,
re-synchronisation relancée via le **bon** chemin (ce worktree) : succès
sans erreur, garde-fou et transaction opérationnels. Conclusion sur la
case #9 : négative mais définitive (voir tableau ci-dessus) — Strava ne
porte pas ce lap manuel, incident ou pas.

## Après l'étape 5 — bug OAuth Strava trouvé en tentant la reconnexion

En tentant de reconnecter Strava (pour retenter la case #9), échec avec
« État OAuth invalide ». Hypothèse initiale de l'utilisateur : régression
de `ab69bf2` (le cookie de state dépendrait de la session supprimée avec
`lib/auth.ts`) — **infirmée par diff** : le seul changement de ce commit
sur `reglages/actions.ts`/`callback/route.ts` retire des gardes
`isAuthenticated()`, sans toucher au cookie `strava_oauth_state`, qui n'a
jamais dépendu de la session.

**Vraie cause, préexistante depuis le tout premier commit Strava
(`b4caae1`)** : `redirect_uri` retombe sur la constante codée en dur
`"http://localhost:3000"` quand `PUBLIC_URL` est vide (cas local) —
indépendamment de l'hôte réellement visité par le navigateur. Le cookie de
state, sans attribut `Domain`, est *host-only* : posé sur `127.0.0.1` il
n'est jamais renvoyé si Strava redirige vers `localhost`. Révélé
maintenant parce que l'URL suggérée pour ouvrir l'app était `127.0.0.1`,
pas par le retrait d'authentification.

**Réappliqué avec un renforcement demandé** : `reglages/actions.ts` dérive
l'hôte de la requête entrante au lieu d'une constante figée ;
`generateOAuthState()`/`verifyOAuthState()` (nouveau, `lib/strava/oauth.ts`)
stockent le state **chiffré** (AES-256-GCM authentifié, pas en clair) dans
le cookie httpOnly/sameSite=lax/10 min, comparé en temps constant — ferme
la voie du « cookie tossing » en plus du décalage d'hôte. Test verrou
ajouté (`oauth.test.ts`, 6 cas : state absent, cookie absent, state
différent, cookie altéré/rejoué depuis une autre origine).

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
