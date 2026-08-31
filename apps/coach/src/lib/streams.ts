import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { prisma } from "./db.ts";

/**
 * Lecture des flux compressés.
 *
 * Les séries sont stockées gzippées : elles sont décompressées à la demande,
 * jamais requêtées champ par champ. Un `null` dans une série signifie
 * « capteur muet à cet instant » et doit le rester : combler par
 * interpolation reviendrait à inventer une mesure.
 */

const streamDataSchema = z.object({
  time: z.array(z.number()).optional(),
  heartrate: z.array(z.number().nullable()).optional(),
  velocity_smooth: z.array(z.number().nullable()).optional(),
  altitude: z.array(z.number().nullable()).optional(),
  cadence: z.array(z.number().nullable()).optional(),
  distance: z.array(z.number().nullable()).optional(),
  /** Paires [lat, lng] en degrés décimaux. */
  latlng: z.array(z.tuple([z.number(), z.number()]).nullable()).optional(),
});

export type StreamData = z.infer<typeof streamDataSchema>;

export async function loadStreams(activityId: string): Promise<StreamData | null> {
  const row = await prisma.activityStream.findUnique({ where: { activityId } });
  if (!row) return null;

  const json: unknown = JSON.parse(gunzipSync(Buffer.from(row.data)).toString("utf8"));
  const parsed = streamDataSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export type LatLng = [number, number];

const latlngOnlySchema = streamDataSchema.pick({ latlng: true });

/**
 * Ne charge que le tracé GPS, pour les vignettes du fil d'activités : décoder
 * un blob par activité reste nécessaire (les flux ne sont pas indexables
 * champ par champ), mais une seule requête pour tout le lot évite un
 * aller-retour base par activité.
 */
export async function loadRoutePreviews(
  activityIds: readonly string[],
): Promise<Map<string, ReadonlyArray<LatLng | null> | null>> {
  const out = new Map<string, ReadonlyArray<LatLng | null> | null>();
  if (activityIds.length === 0) return out;

  const rows = await prisma.activityStream.findMany({
    where: { activityId: { in: [...activityIds] } },
    select: { activityId: true, data: true },
  });

  for (const row of rows) {
    const json: unknown = JSON.parse(gunzipSync(Buffer.from(row.data)).toString("utf8"));
    const parsed = latlngOnlySchema.safeParse(json);
    out.set(row.activityId, parsed.success ? (parsed.data.latlng ?? null) : null);
  }
  return out;
}

export type ChartPoint = {
  t: number;
  distanceKm: number | null;
  hr: number | null;
  paceSPerKm: number | null;
  altitude: number | null;
  cadence: number | null;
};

/**
 * Réduit une série seconde par seconde à un nombre de points affichable.
 *
 * Sous-échantillonnage par moyenne de fenêtre, et non par prélèvement d'un
 * point sur N : sur un signal bruité comme la fréquence cardiaque, prélever
 * ferait apparaître ou disparaître des pics selon le pas choisi.
 */
export function toChartPoints(streams: StreamData, maxPoints = 600): ChartPoint[] {
  const time = streams.time ?? [];
  if (time.length === 0) return [];

  const step = Math.max(1, Math.ceil(time.length / maxPoints));
  const points: ChartPoint[] = [];

  for (let i = 0; i < time.length; i += step) {
    const end = Math.min(i + step, time.length);
    points.push({
      t: time[i] ?? 0,
      distanceKm: average(streams.distance, i, end, (v) => v / 1000),
      hr: average(streams.heartrate, i, end),
      // La vitesse de Strava est en m/s ; l'allure est son inverse, indéfinie
      // à l'arrêt.
      paceSPerKm: (() => {
        const speed = average(streams.velocity_smooth, i, end);
        return speed && speed > 0.5 ? 1000 / speed : null;
      })(),
      altitude: average(streams.altitude, i, end),
      cadence: (() => {
        const c = average(streams.cadence, i, end);
        // Strava renvoie la cadence d'une seule jambe en course à pied.
        return c === null ? null : c * 2;
      })(),
    });
  }
  return points;
}

function average(
  series: Array<number | null> | undefined,
  from: number,
  to: number,
  transform: (v: number) => number = (v) => v,
): number | null {
  if (!series) return null;
  let sum = 0;
  let count = 0;
  for (let i = from; i < to; i++) {
    const v = series[i];
    if (v == null) continue;
    sum += v;
    count += 1;
  }
  return count === 0 ? null : transform(sum / count);
}

export function availableStreams(streams: StreamData | null): string[] {
  if (!streams) return [];
  return Object.entries(streams)
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k]) => k);
}
