import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "./db.ts";
import { loadStreams } from "./streams.ts";
import { isRun } from "./strava/mapping.ts";
import { buildAtlasSvg, type TraceAtlasSvg } from "./trace-atlas.ts";
import type { LatLng } from "./trace.ts";
import type { Day } from "./shifts/day.ts";

/**
 * Pont base + cache disque pour <TraceAtlas />. La génération (buildAtlasSvg)
 * reste pure ; ici on décide QUAND la recalculer. Coûteux — décompresser les
 * flux de centaines d'activités — donc mis en cache disque, jamais recalculé
 * au rendu. La clé de cache inclut le nombre de tracés et le plus récent
 * `updatedAt` parmi eux : importer une activité change forcément l'un des
 * deux, ce qui invalide le cache sans mécanisme de purge explicite à
 * maintenir.
 */

const CACHE_DIR = resolve(process.cwd(), ".cache", "trace-atlas");
const MIN_TRACES = 5;

export type TraceAtlasResult = TraceAtlasSvg | null;

export async function loadTraceAtlas(from: Day, to: Day): Promise<TraceAtlasResult> {
  const candidates = await prisma.activity.findMany({
    where: { startDay: { gte: from, lte: to }, hasStreams: true },
    select: { id: true, type: true, updatedAt: true },
  });
  const running = candidates.filter((a) => isRun(a.type));
  if (running.length < MIN_TRACES) return null;

  const maxUpdatedAt = running.reduce((max, a) => Math.max(max, a.updatedAt.getTime()), 0);
  const cacheKey = `${from}_${to}_${running.length}_${maxUpdatedAt}`;
  const cachePath = resolve(CACHE_DIR, `${cacheKey}.json`);

  if (existsSync(cachePath)) {
    try {
      return JSON.parse(readFileSync(cachePath, "utf-8")) as TraceAtlasSvg;
    } catch {
      // Cache corrompu : on retombe sur un recalcul complet ci-dessous.
    }
  }

  const traces: LatLng[][] = [];
  for (const a of running) {
    const streams = await loadStreams(a.id);
    if (streams?.latlng) {
      traces.push(streams.latlng.filter((p): p is [number, number] => p != null));
    }
  }

  const result = buildAtlasSvg(traces);
  if (result.traceCount < MIN_TRACES) return null;

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(result));
  return result;
}
