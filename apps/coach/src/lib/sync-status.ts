import { prisma } from "./db.ts";

/**
 * Fraîcheur des données importées, toutes sources confondues.
 *
 * Strava se synchronise via webhook, cron ou bouton — `StravaAccount.lastSyncAt`
 * est posé explicitement à la fin d'une synchro réussie. La COROS n'expose
 * aucune API publique aux particuliers : l'import est un geste manuel
 * (`npm run import:coros` / `import:coros:fit`), il n'y a donc pas de champ
 * dédié. `updatedAt` (qui se rafraîchit à chaque upsert, contrairement à
 * `importedAt`/`createdAt` qui ne datent que la première écriture) sert de
 * signal fiable du dernier import réel, qu'il touche les activités ou les
 * métriques de santé.
 */
export type SyncFreshness = {
  stravaLastSyncAt: Date | null;
  corosLastImportAt: Date | null;
};

export async function getSyncFreshness(): Promise<SyncFreshness> {
  const [account, corosActivity, corosHealth] = await Promise.all([
    prisma.stravaAccount.findFirst({ select: { lastSyncAt: true } }),
    prisma.activity.aggregate({ where: { source: "coros" }, _max: { updatedAt: true } }),
    prisma.healthMetric.aggregate({
      where: { source: "coros_export" },
      _max: { updatedAt: true },
    }),
  ]);

  const corosDates = [corosActivity._max.updatedAt, corosHealth._max.updatedAt].filter(
    (d): d is Date => d != null,
  );

  return {
    stravaLastSyncAt: account?.lastSyncAt ?? null,
    corosLastImportAt: corosDates.length > 0 ? new Date(Math.max(...corosDates.map((d) => d.getTime()))) : null,
  };
}

/** La plus récente des deux sources — `null` si aucune n'a jamais synchronisé. */
export function overallLastSyncAt({ stravaLastSyncAt, corosLastImportAt }: SyncFreshness): Date | null {
  const dates = [stravaLastSyncAt, corosLastImportAt].filter((d): d is Date => d != null);
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

/** `null` (jamais synchronisé) compte comme périmé, jamais comme « à jour ». */
export function isSyncStale(lastSyncAt: Date | null, thresholdHours = 24): boolean {
  if (!lastSyncAt) return true;
  return Date.now() - lastSyncAt.getTime() > thresholdHours * 60 * 60 * 1000;
}
