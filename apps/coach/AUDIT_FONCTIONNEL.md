# Audit fonctionnel — 2026-09-07

Audit fonctionnel (pas visuel) de l'app coach : navigation réelle depuis
l'accueil, clics, soumissions de formulaires, cas limites. Serveur de dev
propre (`rm -rf .next` puis relance), Playwright, worktree
`coach-carnet-redesign`.

**Sauvegarde prise avant tout test** :
`apps/coach/backups/coach-2026-09-07T14-36-54-pre-audit-fonctionnel.db`
(dépôt principal, chemin partagé avec le worktree).

**Vérification d'intégrité de `dev.db` après l'audit** (comparaison directe,
lecture seule, contre la sauvegarde) : `Activity` (145) et `Lap` (224) —
mêmes effectifs et mêmes jeux d'identifiants, aucune perte ni corruption.
Seules différences : +10 lignes `SyncJob` (toutes `kind=incremental,
status=done, attempts=1` — bookkeeping normal d'une synchronisation
réussie) et `StravaAccount.lastSyncAt` mis à jour, issues des tout premiers
tests réels de synchronisation avant que l'agent d'exécution ne bascule sur
une copie isolée (`.env.local` → base de test dédiée sous
`/Users/thomas/.claude/jobs/2c0e8594/tmp/coach-test.db`) pour la suite des
tests, plus exploratoire. Aucune donnée réelle perdue ou modifiée de façon
non désirée.

## P0 — Synchronisation Strava : fonctionne de bout en bout

Testé en conditions réelles (compte Strava réel, 143+ activités) :
accès à /reglages depuis l'accueil (clic sur l'icône Réglages), `syncNow`
(bouton « Synchroniser » — spinner, désactivation pendant l'exécution,
message de retour correct, compteurs à jour), double-clic rapide (une
seule requête effectivement envoyée, le bouton désactivé bloque la
seconde), `POST /api/strava/sync` (401 sans secret ou secret erroné, 200
avec le bon `CRON_SECRET`), webhook (`GET` de vérification, `POST`
d'événement — comportements corrects compte tenu de la configuration
locale sans URL publique), propagation d'une activité synchronisée dans
/activites, sa page détail, la charge hebdo de l'accueil et /progression.
**Zéro** erreur console, **zéro** overlay Next.js, **zéro** avertissement
d'hydratation sur l'ensemble du parcours (~50 interactions).

**Conclusion : l'hypothèse de départ de la mission (sync Strava bloquante)
n'est PAS confirmée aujourd'hui.** Le blocage historique documenté en
mémoire (`UnrecognizedActionError` sur /reglages) était un symptôme de
bundle `.next` périmé après reconstruction à froid — pas un bug de code —
et ne se reproduit pas sur un build propre avec un onglet neuf.

## Bugs classés

### P1 — navigation impossible sans taper l'URL (3 pages)

Vérifié par grep exhaustif (`href=`, `<Link`, `router.push`) sur tout
`src/`, puis confirmé en conditions réelles par navigation Playwright
depuis l'accueil.

1. **`/progression`** — URL : `/progression`. Repro : depuis l'accueil,
   chercher un lien menant à cette page ; aucun n'existe nulle part dans
   l'app. Page réelle et complète (207 lignes, mur des records,
   graphique de progression, nuage allure×FC, volume 12 semaines,
   jalons) — atteinte uniquement par saisie directe de l'URL. Attendu :
   un point d'entrée depuis l'interface (l'accueil ou l'en-tête).
2. **`/simulateur`** — URL : `/simulateur`. Même constat : page réelle et
   complète (257 lignes, 3 modèles de prédiction), aucun lien entrant
   nulle part. Attendu : idem.
3. **`/plan`** — URL : `/plan`. Repro : avec un objectif ET un plan déjà
   générés (cas réel testé : « 12 km de l'Eyrieux », 25/10/2026),
   chercher un lien vers `/plan` depuis l'accueil : aucun
   (`page.locator('a[href="/plan"]')` → 0 résultat). Les liens vers
   `/plan` dans `weekly-load-chart.tsx` et `next-session.tsx` sont
   conditionnés à des états vides (pas de plan / pas de séance prévue)
   qui ne s'appliquent plus une fois qu'un plan existe. Attendu : un
   accès permanent à `/plan`, indépendant de l'état.

Ces trois pages sont par ailleurs **fonctionnellement saines** une fois
atteintes (testé en direct : rendu correct, formulaires opérationnels,
gestion propre des cas limites). Le seul problème est l'absence de
chemin de navigation — exactement le motif de l'incident historique
`/reglages`, qui avait rendu la page inatteignable « pendant des jours ».

### P2 — cosmétique / qualité de code, sans effet utilisateur confirmé

4. **Règle de validation morte** — `src/app/(app)/reglages/profil/actions.ts:50-55`.
   La règle `hrMax <= hrRest → erreur` ne peut jamais se déclencher : le
   schéma Zod borne `hrMax` à `[120,230]` et `hrRest` à `[25,100]`, deux
   plages disjointes — aucune paire de valeurs ne peut satisfaire les
   deux bornes individuelles ET `hrMax <= hrRest` en même temps.
   Confirmé en direct : `hrMax=50, hrRest=180` est rejeté par la
   validation de plage (« hrMax : Number must be greater than or equal
   to 120 »), la règle personnalisée n'est jamais atteinte. Sans effet
   utilisateur (la plage protège déjà contre le cas), mais code mort à
   nettoyer ou borne à revoir.
5. **Aucun `error.tsx` / `not-found.tsx` personnalisé** nulle part dans
   `src/app` — uniquement les pages par défaut de Next.js. `notFound()`
   fonctionne correctement (`/activites/[id]` avec un id inexistant →
   404 propre), mais son rendu est générique, pas dans le design de
   l'app.
6. **Profil : effacement silencieux sans confirmation** —
   `/reglages/profil`. Vider tous les champs numériques optionnels
   (poids, FC max, FC repos, seuil, VMA, volume, séances/semaine) et
   soumettre est accepté sans dialogue de confirmation, alors que ces
   repères sont utilisés par les zones, les graphiques d'allure et le
   plan. Comportement cohérent avec le schéma (champs légitimement
   nullable) — probablement voulu, mais mérite un second regard. Testé
   en conditions réelles avec restauration immédiate des valeurs
   d'origine (vérifiée par rechargement).

## Écarté / non reproductible

- **`syncNow` sans `try/catch` au niveau de l'action** (`reglages/actions.ts:52`)
  — risque théorique identifié en lecture de code (une exception non
  gérée dans `enqueueIncrementalSync`/`runSyncWorker` remonterait comme
  overlay d'erreur plutôt que `SyncResult.ok:false`). **Non confirmé en
  exécution** : `runSyncWorker` catche déjà chaque tâche individuellement
  (`rate_limit`/`auth`/`budget`/`empty`) et le parcours réel (clics
  simples, double-clic, appels directs à la route cron) n'a produit
  aucune exception non gérée. Pas classé comme bug — sous surveillance
  si un vrai cas d'erreur Strava (jeton révoqué en cours de session)
  survient un jour.
- **Carte « Atlas des tracés » sur /progression** apparue comme un
  rectangle sombre sur une capture d'écran — `MAPTILER_API_KEY` est bien
  configurée, la capture a probablement été prise avant la fin du
  chargement des tuiles MapLibre. Non confirmé comme bug, à revérifier
  avec une attente explicite si ça se reproduit.
- **`createGoal` sans fonction de suppression/désactivation associée**
  (grep de `deleteGoal`, `goal.delete`, `isActive: false` — aucun
  résultat) — repéré en lecture de code mais **non exécuté** : un
  objectif existe déjà dans les données réelles, donc `GoalForm` ne
  s'affiche même pas dans l'état actuel de l'app ; le tester
  nécessiterait de vider `Goal`, jugé trop risqué pour une simple
  vérification exploratoire. Signalé, pas corrigé, pas classé.
- **Activité sans données FC** — cas limite demandé par la mission,
  introuvable dans les 145 activités réelles actuelles. Non testable
  faute de donnée, pas un gap de couverture.
- **`/journal`** — sans lien entrant nulle part, mais stub volontaire
  « Phase 5 » (`<Placeholder>`) déjà présent avant cet audit. Ce n'est
  **pas** un bug.

## Ce qui a été vérifié et fonctionne correctement

Accueil (5 sections, thème clair/sombre/auto, pas de débordement à
1440/1000/390px, retour/avant) ; /activites (recherche, tri, filtre type,
pagination) ; /activites/[id] (notes avec sauvegarde auto au blur,
activité tapis sans tracé GPS rendue proprement, activité musculation
sans distance affichant « non disponible » et non « 0 »,
`/activites/id-inexistant` → 404 propre) ; /calendrier (navigation par
mois y compris un mois vide, vue semaine) ; /analyses Charge et Export
(aperçu de taille, export sur période vide correctement rapporté comme
« Activités : 0 » sans erreur, plage de dates inversée rejetée avec
message explicite) ; /plan (validation client complète du formulaire
d'objectif) ; /reglages/postes (validation cycle/horaires/contraintes,
sauvegarde round-trip) ; /simulateur (3 modèles, gestion propre des
entrées invalides, jamais de `NaN`/`Infinity`) ; /progression (mur des
records, graphiques, jalons, tous alimentés par les vraies données).

## Priorisation proposée (3 bugs P1, tous de même nature)

Les trois manques de navigation (`/progression`, `/simulateur`, `/plan`
à l'état non-vide) partagent la même cause et le même correctif probable
(ajouter un point d'entrée permanent, cohérent avec la décision produit
du tronc de ne garder qu'un en-tête minimal) — proposition : les traiter
ensemble en Phase 4, un seul commit cohérent, plutôt que trois correctifs
séparés. Les 3 P2 sont mineurs et peuvent attendre ou être traités à la
marge si le temps le permet.

**Total : 3 P1, 3 P2, 0 P0.** Sous le seuil de 15 — pas besoin de
séquencer sur plusieurs passages, mais je m'arrête ici avant toute
correction, comme demandé.
