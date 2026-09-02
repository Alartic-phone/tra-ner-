import { prisma } from "./db.ts";
import { loadStreams } from "./streams.ts";
import { computeOverlayPaths, type OverlayMap } from "./trace.ts";
import { addDays } from "./shifts/day.ts";
import { today } from "./time.ts";
import { isRun } from "./strava/mapping.ts";

/**
 * Carte de tous les tracés de l'année, superposés dans un espace de
 * coordonnées partagé — la seule image « décorative » que l'app a le droit
 * d'afficher, parce qu'elle est faite des données réelles de l'utilisateur.
 *
 * Générée côté serveur et mise en cache dans `Setting` (pas de nouvelle
 * table pour un seul objet JSON) : recalculer exigerait de décompresser le
 * flux de chaque activité de course de l'année, ce qui n'a pas sa place
 * dans le temps de réponse d'une requête HTTP. Le cache est invalidé dès
 * que le nombre d'activités ou la plus récente diffère de la dernière
 * génération — pas besoin de plus fin qu'une simple signature.
 */

const CACHE_KEY = "progression_overlay_cache";
const WINDOW_DAYS = 365;

type Cache = { signature: string; overlay: OverlayMap };

export async function loadYearlyTraceOverlay(): Promise<OverlayMap | null> {
  const from = addDays(today(), -WINDOW_DAYS);

  const candidates = await prisma.activity.findMany({
    where: { startDay: { gte: from }, hasStreams: true },
    select: { id: true, type: true, startDay: true },
    orderBy: { startDay: "asc" },
  });
  const running = candidates.filter((a) => isRun(a.type));
  if (running.length === 0) return null;

  const signature = `${from}:${running.length}:${running[running.length - 1]!.startDay}`;

  const cached = await prisma.setting.findUnique({ where: { key: CACHE_KEY } });
  if (cached) {
    try {
      const parsed = JSON.parse(cached.valueJson) as Cache;
      if (parsed.signature === signature) return parsed.overlay;
    } catch {
      // Cache corrompu : on retombe silencieusement sur un recalcul.
    }
  }

  const traces = await Promise.all(
    running.map(async (a) => (await loadStreams(a.id))?.latlng ?? []),
  );
  const overlay = computeOverlayPaths(traces, { width: 900, height: 900, padding: 24 });

  if (overlay) {
    const value: Cache = { signature, overlay };
    await prisma.setting.upsert({
      where: { key: CACHE_KEY },
      create: { key: CACHE_KEY, valueJson: JSON.stringify(value) },
      update: { valueJson: JSON.stringify(value) },
    });
  }

  return overlay;
}
