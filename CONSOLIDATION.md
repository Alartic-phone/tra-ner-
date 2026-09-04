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

## Étape 3.4 — `worktree-nifty-weaving-hanrahan`

*(à venir)*

## Étape 1 — arbitrages actés

- **`worktree-humming-coalescing-valley`** : non fusionnée. Prélèvement
  ciblé décidé : `lib/export/security.ts` (réappliqué — voir ci-dessous),
  `lib/export/size.ts` (confirmé déjà couvert par le tronc, rien pris),
  formulaire d'export interactif (**reporté**, non perdu — nécessiterait de
  remplacer toute la plomberie d'export du tronc pour deux fonctionnalités,
  jugé trop risqué en pleine consolidation), `splits.ts` (confirmé non
  nécessaire — le tronc a déjà un rendu de splits kilométriques peuplé pour
  46/49 activités de course réelles).
- **`lib/metrics/milestones.ts`** (`worktree-progression-page`) : à
  prélever en plus du système « distance cumulée » du tronc (décidé, pas
  encore fait).
- **`ZONE_RAMP`** (`worktree-binary-plotting-waffle`) : à consolider dans
  `lib/metrics/zones.ts` (décidé, pas encore fait).
- **`activity-page-v2`, `calendar-v2`, `curious-wishing-stearns`** : rien à
  sauver, confirmé par diff.
