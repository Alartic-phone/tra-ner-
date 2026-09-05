import { gzipSync } from "node:zlib";
import { z } from "zod";
import { prisma } from "../db.ts";
import {
  StravaAuthError,
  StravaRateLimitError,
  getStreams,
  getActivity,
  listActivities,
  quotaExhausted,
} from "./client.ts";
import { isRun, toActivityData } from "./mapping.ts";
import { getProfileStatus, persistActivityMetrics } from "../metrics/repository.ts";
import {
  STREAM_KEYS,
  activityDetailSchema,
  activityListSchema,
} from "./schemas.ts";

/**
 * File d'attente d'import Strava.
 *
 * L'import initial de plusieurs années d'historique demande une requête de
 * liste par page, puis une requête de flux par activité. Avec un quota de
 * l'ordre de 100 à 200 requêtes par quart d'heure, l'opération s'étale sur
 * plusieurs heures : elle doit donc survivre à un redémarrage, d'où une file
 * persistée en base plutôt qu'en mémoire, avec reprise et back-off
 * exponentiel.
 */

const PER_PAGE = 100;
const MAX_ATTEMPTS = 5;

const backfillPayload = z.object({ page: z.number().int().positive() });
const activityPayload = z.object({ stravaId: z.string() });
const incrementalPayload = z.object({ after: z.number().int().nonnegative() });

type JobKind = "backfill_page" | "activity_detail" | "activity_streams" | "incremental";

async function enqueue(
  kind: JobKind,
  payload: unknown,
  options: { priority?: number; runAfter?: Date } = {},
): Promise<void> {
  await prisma.syncJob.create({
    data: {
      kind,
      payloadJson: JSON.stringify(payload),
      priority: options.priority ?? 0,
      runAfter: options.runAfter ?? new Date(),
    },
  });
}

/** Démarre (ou reprend) l'import de tout l'historique disponible. */
export async function startBackfill(): Promise<void> {
  const existing = await prisma.syncJob.count({
    where: { kind: "backfill_page", status: { in: ["pending", "running"] } },
  });
  if (existing > 0) return;

  const account = await prisma.stravaAccount.findFirst();
  const nextPage = account?.backfillCursor ? Number(account.backfillCursor) + 1 : 1;
  await enqueue("backfill_page", { page: nextPage }, { priority: 10 });
}

/**
 * Synchronisation incrémentale : ne demande que les activités postérieures à
 * la dernière connue. Utilisée par le bouton « Synchroniser » et par le cron.
 */
export async function enqueueIncrementalSync(): Promise<void> {
  const latest = await prisma.activity.findFirst({
    where: { source: "strava" },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });

  // Recouvrement d'une heure : une activité peut être téléversée en retard.
  const after = latest
    ? Math.floor(latest.startedAt.getTime() / 1000) - 3600
    : 0;

  const pending = await prisma.syncJob.count({
    where: { kind: "incremental", status: "pending" },
  });
  if (pending > 0) return;

  await enqueue("incremental", { after }, { priority: 20 });
}

/** Demande l'import d'une activité précise (webhook Strava). */
export async function enqueueActivity(stravaId: bigint | number): Promise<void> {
  await enqueue("activity_detail", { stravaId: String(stravaId) }, { priority: 30 });
  await enqueue("activity_streams", { stravaId: String(stravaId) }, { priority: 25 });
}

export async function deleteActivity(stravaId: bigint | number): Promise<void> {
  await prisma.activity.deleteMany({ where: { stravaActivityId: BigInt(stravaId) } });
}

/**
 * Enregistre une activité. La déduplication est stricte, par identifiant
 * Strava : ré-importer la même activité met à jour la ligne existante au lieu
 * d'en créer une seconde.
 */
async function upsertActivity(data: ReturnType<typeof toActivityData>): Promise<string> {
  const existing = await prisma.activity.findUnique({
    where: { stravaActivityId: data.stravaActivityId as bigint },
    select: { id: true },
  });

  if (existing) {
    await prisma.activity.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await prisma.activity.create({ data });
  return created.id;
}


/**
 * Programme les requêtes complémentaires d'une activité : flux seconde par
 * seconde, et détail (qui porte les tours).
 *
 * Le détail n'est demandé que pour les activités de course : les tours ne
 * servent qu'à lire une séance de fractionné, et chaque requête évitée est
 * une requête de plus disponible dans le quota pour avancer l'import.
 */
async function enqueueEnrichment(
  activityId: string,
  stravaId: number,
  type: string,
): Promise<void> {
  const [hasStream, lapCount] = await Promise.all([
    prisma.activityStream.findUnique({ where: { activityId }, select: { id: true } }),
    prisma.lap.count({ where: { activityId } }),
  ]);

  if (!hasStream) {
    await enqueue("activity_streams", { stravaId: String(stravaId) });
  }
  if (isRun(type) && lapCount === 0) {
    await enqueue("activity_detail", { stravaId: String(stravaId) }, { priority: -5 });
  }
}

async function runBackfillPage(payload: unknown): Promise<void> {
  const { page } = backfillPayload.parse(payload);
  const activities = await listActivities(activityListSchema, {
    page,
    perPage: PER_PAGE,
  });

  for (const summary of activities) {
    const id = await upsertActivity(toActivityData(summary));
    await enqueueEnrichment(id, summary.id, summary.type);
  }

  await prisma.stravaAccount.updateMany({ data: { backfillCursor: String(page) } });

  if (activities.length === PER_PAGE) {
    await enqueue("backfill_page", { page: page + 1 }, { priority: 10 });
  } else {
    await prisma.stravaAccount.updateMany({
      data: { backfillDone: true, lastSyncAt: new Date() },
    });
  }
}

async function runIncremental(payload: unknown): Promise<void> {
  const { after } = incrementalPayload.parse(payload);
  let page = 1;

  for (;;) {
    const activities = await listActivities(activityListSchema, {
      page,
      perPage: PER_PAGE,
      after,
    });
    for (const summary of activities) {
      const id = await upsertActivity(toActivityData(summary));
      await enqueueEnrichment(id, summary.id, summary.type);
    }
    if (activities.length < PER_PAGE) break;
    page += 1;
    // Une synchronisation incrémentale qui dépasse quelques pages signale un
    // long décrochage : on repasse par la file plutôt que de boucler ici.
    if (page > 3) {
      await enqueue("incremental", { after }, { priority: 20 });
      break;
    }
  }

  await prisma.stravaAccount.updateMany({ data: { lastSyncAt: new Date() } });
}

async function runActivityDetail(payload: unknown): Promise<void> {
  const { stravaId } = activityPayload.parse(payload);
  const detail = await getActivity(BigInt(stravaId), activityDetailSchema);
  const activityId = await upsertActivity(toActivityData(detail));

  const laps = detail.laps ?? [];
  if (laps.length === 0) return;

  await prisma.lap.deleteMany({ where: { activityId } });
  await prisma.lap.createMany({
    data: laps.map((lap) => ({
      activityId,
      lapIndex: lap.lap_index,
      name: lap.name ?? null,
      distanceM: lap.distance,
      elapsedTimeS: lap.elapsed_time,
      movingTimeS: lap.moving_time,
      elevationGainM: lap.total_elevation_gain ?? null,
      avgSpeedMps: lap.average_speed ?? null,
      maxSpeedMps: lap.max_speed ?? null,
      avgHr: lap.average_heartrate != null ? Math.round(lap.average_heartrate) : null,
      maxHr: lap.max_heartrate != null ? Math.round(lap.max_heartrate) : null,
      avgCadence: lap.average_cadence ?? null,
      startedAt: lap.start_date ? new Date(lap.start_date) : null,
      splitIndex: lap.split ?? null,
      // Strava numérote `split` pour les tours auto-générés (1 km, 1 mile) ;
      // un vrai tour posé au bouton par l'athlète n'a pas de numéro de split.
      isManual: lap.split == null,
    })),
  });
}

async function runActivityStreams(payload: unknown): Promise<void> {
  const { stravaId } = activityPayload.parse(payload);
  const activity = await prisma.activity.findUnique({
    where: { stravaActivityId: BigInt(stravaId) },
    select: { id: true },
  });
  if (!activity) return; // L'activité a été supprimée entre-temps.

  const streams = await getStreams(BigInt(stravaId));
  const available = STREAM_KEYS.filter((key) => streams[key]?.data?.length);
  if (available.length === 0) return;

  const payloadJson = JSON.stringify(
    Object.fromEntries(available.map((key) => [key, streams[key]!.data])),
  );
  const compressed = gzipSync(Buffer.from(payloadJson, "utf8"));
  const pointCount = streams.time?.data.length ?? 0;

  await prisma.activityStream.upsert({
    where: { activityId: activity.id },
    create: {
      activityId: activity.id,
      data: compressed,
      availableStreamsJson: JSON.stringify(available),
      pointCount,
    },
    update: {
      data: compressed,
      availableStreamsJson: JSON.stringify(available),
      pointCount,
      fetchedAt: new Date(),
    },
  });

  await prisma.activity.update({
    where: { id: activity.id },
    data: { hasStreams: true },
  });

  // Les métriques dérivées sont calculées dans la foulée : les flux viennent
  // d'être décompressés, les recalculer plus tard coûterait une seconde
  // décompression pour rien.
  const { profile } = await getProfileStatus();
  await persistActivityMetrics(activity.id, profile);
}

export type WorkerReport = {
  processed: number;
  failed: number;
  stoppedBy: "empty" | "budget" | "rate_limit" | "auth";
  retryAfterS?: number;
};

/**
 * Traite la file jusqu'à épuisement, du budget de temps ou du quota.
 *
 * Appelée par le bouton « Synchroniser », par le webhook et par le cron. Le
 * budget de temps évite qu'une requête HTTP reste bloquée sur un import de
 * plusieurs heures.
 */
export async function runSyncWorker(
  options: { maxJobs?: number; budgetMs?: number } = {},
): Promise<WorkerReport> {
  const maxJobs = options.maxJobs ?? 50;
  const budgetMs = options.budgetMs ?? 20_000;
  const startedAt = Date.now();

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < maxJobs; i++) {
    if (Date.now() - startedAt > budgetMs) {
      return { processed, failed, stoppedBy: "budget" };
    }

    const quota = quotaExhausted();
    if (quota.exhausted) {
      return {
        processed,
        failed,
        stoppedBy: "rate_limit",
        retryAfterS: quota.retryAfterS,
      };
    }

    const job = await prisma.syncJob.findFirst({
      where: { status: "pending", runAfter: { lte: new Date() } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
    if (!job) return { processed, failed, stoppedBy: "empty" };

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "running", attempts: { increment: 1 } },
    });

    try {
      const payload: unknown = JSON.parse(job.payloadJson);
      switch (job.kind as JobKind) {
        case "backfill_page":
          await runBackfillPage(payload);
          break;
        case "incremental":
          await runIncremental(payload);
          break;
        case "activity_detail":
          await runActivityDetail(payload);
          break;
        case "activity_streams":
          await runActivityStreams(payload);
          break;
        default:
          throw new Error(`Type de tâche inconnu : ${job.kind}`);
      }
      await prisma.syncJob.update({
        where: { id: job.id },
        data: { status: "done", lastError: null },
      });
      processed += 1;
    } catch (error) {
      if (error instanceof StravaRateLimitError) {
        // Le quota n'est pas un échec : la tâche est simplement replanifiée.
        await prisma.syncJob.update({
          where: { id: job.id },
          data: {
            status: "pending",
            attempts: { decrement: 1 },
            runAfter: new Date(Date.now() + error.retryAfterS * 1000),
            lastError: error.message,
          },
        });
        return {
          processed,
          failed,
          stoppedBy: "rate_limit",
          retryAfterS: error.retryAfterS,
        };
      }

      if (error instanceof StravaAuthError) {
        await prisma.syncJob.update({
          where: { id: job.id },
          data: { status: "pending", lastError: error.message },
        });
        return { processed, failed, stoppedBy: "auth" };
      }

      const attempts = job.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      if (attempts >= MAX_ATTEMPTS) {
        await prisma.syncJob.update({
          where: { id: job.id },
          data: { status: "failed", lastError: message },
        });
        failed += 1;
      } else {
        // Back-off exponentiel : 1, 2, 4, 8 minutes.
        const delayMs = 60_000 * 2 ** (attempts - 1);
        await prisma.syncJob.update({
          where: { id: job.id },
          data: {
            status: "pending",
            runAfter: new Date(Date.now() + delayMs),
            lastError: message,
          },
        });
      }
    }
  }

  return { processed, failed, stoppedBy: "budget" };
}

export async function getSyncStatus() {
  const [account, pending, running, failed, activities, withStreams] = await Promise.all([
    prisma.stravaAccount.findFirst(),
    prisma.syncJob.count({ where: { status: "pending" } }),
    prisma.syncJob.count({ where: { status: "running" } }),
    prisma.syncJob.count({ where: { status: "failed" } }),
    prisma.activity.count({ where: { source: "strava" } }),
    prisma.activity.count({ where: { hasStreams: true } }),
  ]);

  return { account, pending, running, failed, activities, withStreams };
}
