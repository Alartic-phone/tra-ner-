/**
 * Diagnostic de doublons d'activités.
 *
 * Une même sortie peut arriver deux fois en base par deux chemins différents
 * (import Strava ET import FIT COROS de la même séance, par exemple) : rien
 * dans le schéma ne le déduplique entre sources, contrairement à
 * `stravaActivityId` qui ne protège que contre un doublon Strava-Strava.
 *
 * Ce script ne fait QUE lister les paires suspectes — il ne supprime jamais
 * rien. Deux activités sont suspectes quand elles sont du MÊME type, leurs
 * départs à moins de 10 minutes d'écart, ET leurs distances à moins de 5 %
 * l'une de l'autre. C'est à l'utilisateur de trancher laquelle garder : deux
 * sorties réelles et légitimes peuvent parfaitement partager ce profil (deux
 * coureurs du même groupe, par exemple), la suppression ne doit jamais être
 * automatique.
 *
 * Le type doit correspondre : Strava fait autorité pour les activités
 * (COROS course / Garmin vélo y remontent tous les deux, cf. CLAUDE.md) —
 * une course et une sortie vélo qui démarreraient proches dans le temps ne
 * sont jamais « la même sortie », quelle que soit la proximité de distance.
 *
 *   npm run check:duplicates
 */
import { prisma } from "../src/lib/db.ts";

const MAX_START_GAP_MIN = 10;
const MAX_DISTANCE_DELTA_FRACTION = 0.05;

async function main(): Promise<void> {
  const activities = await prisma.activity.findMany({
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      name: true,
      source: true,
      type: true,
      startedAt: true,
      distanceM: true,
    },
  });

  type Row = (typeof activities)[number];
  const suspects: Array<{ a: Row; b: Row; gapMin: number; distanceDeltaPct: number }> = [];

  for (let i = 0; i < activities.length; i++) {
    for (let j = i + 1; j < activities.length; j++) {
      const a = activities[i]!;
      const b = activities[j]!;

      // Triées par date de départ, `b` est toujours postérieure ou égale à
      // `a` : au-delà de la fenêtre, aucune paire suivante avec ce `a` ne
      // peut plus être assez proche.
      const gapMin = (b.startedAt.getTime() - a.startedAt.getTime()) / 60_000;
      if (gapMin > MAX_START_GAP_MIN) break;

      if (a.type !== b.type) continue;

      const maxDistance = Math.max(a.distanceM, b.distanceM);
      if (maxDistance === 0) continue; // Deux séances sans distance (musculation…) : rien à comparer.
      const distanceDeltaPct = Math.abs(a.distanceM - b.distanceM) / maxDistance;
      if (distanceDeltaPct > MAX_DISTANCE_DELTA_FRACTION) continue;

      suspects.push({ a, b, gapMin, distanceDeltaPct: distanceDeltaPct * 100 });
    }
  }

  if (suspects.length === 0) {
    console.log("Aucun doublon suspect trouvé.");
    return;
  }

  console.log(`${suspects.length} paire(s) suspecte(s) — rien n'a été supprimé :\n`);
  for (const { a, b, gapMin, distanceDeltaPct } of suspects) {
    console.log(
      `- [${a.id}] ${a.source}/${a.type} "${a.name}" — ${a.startedAt.toISOString()} — ` +
        `${(a.distanceM / 1000).toFixed(2)} km`,
    );
    console.log(
      `  [${b.id}] ${b.source}/${b.type} "${b.name}" — ${b.startedAt.toISOString()} — ` +
        `${(b.distanceM / 1000).toFixed(2)} km`,
    );
    console.log(
      `  écart : ${gapMin.toFixed(1)} min, distance : ${distanceDeltaPct.toFixed(1)} %\n`,
    );
  }
}

main().finally(() => prisma.$disconnect());
