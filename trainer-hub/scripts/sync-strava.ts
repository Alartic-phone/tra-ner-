/**
 * Synchronisation Strava en ligne de commande, destinée au cron quotidien
 * quand l'application n'a pas d'URL publique et ne peut donc pas recevoir de
 * webhook.
 *
 *   npm run sync:strava
 *
 * Le script dépile la file jusqu'à épuisement ou jusqu'à ce que le quota
 * Strava soit atteint ; dans ce dernier cas il s'arrête proprement, la file
 * étant persistée, la prochaine exécution reprendra où celle-ci s'est arrêtée.
 */
import { enqueueIncrementalSync, runSyncWorker } from "../src/lib/strava/sync.ts";
import { prisma } from "../src/lib/db.ts";

async function main(): Promise<void> {
  const account = await prisma.stravaAccount.findFirst();
  if (!account) {
    console.log("Aucun compte Strava connecté — rien à faire.");
    return;
  }

  await enqueueIncrementalSync();

  let total = 0;
  for (;;) {
    const report = await runSyncWorker({ maxJobs: 100, budgetMs: 120_000 });
    total += report.processed;

    if (report.stoppedBy === "empty") {
      console.log(`Terminé. ${total} tâche(s) traitée(s).`);
      return;
    }
    if (report.stoppedBy === "rate_limit") {
      const minutes = Math.ceil((report.retryAfterS ?? 900) / 60);
      console.log(
        `Quota Strava atteint après ${total} tâche(s). ` +
          `Reprise possible dans ${minutes} min — relancer le script à ce moment-là.`,
      );
      return;
    }
    if (report.stoppedBy === "auth") {
      console.error("Jeton Strava refusé : reconnecter le compte depuis les réglages.");
      process.exitCode = 1;
      return;
    }
    // stoppedBy === "budget" : il reste du travail, on continue.
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
