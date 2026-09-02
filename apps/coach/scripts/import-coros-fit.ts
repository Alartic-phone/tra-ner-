/**
 * Importe les flux seconde-par-seconde depuis les fichiers FIT déposés dans
 * `data/coros-raw/fit/<labelId>.fit` (labelId = identifiant d'activité COROS,
 * cf. `scripts/import-coros.ts`).
 *
 * COROS n'expose pas d'API publique aux particuliers (voir README) : ces
 * fichiers sont un export manuel. Complète `import-coros.ts`, qui remplit
 * `Activity`/`HealthMetric` mais pas `ActivityStream` — sans flux, ni la
 * vitesse critique ni les meilleurs efforts ne sont calculables.
 *
 *   npm run import:coros:fit
 */
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import FitParser from "fit-file-parser";
import { prisma } from "../src/lib/db.ts";
import { recomputeMetrics } from "../src/lib/metrics/repository.ts";
import { buildCachedTrace } from "../src/lib/trace.ts";

const FIT_DIR = join(import.meta.dirname, "..", "data", "coros-raw", "fit");

/**
 * Même forme que `StreamData` (`src/lib/streams.ts`) : un `null` dans une
 * série signifie « capteur muet à cet instant », jamais comblé.
 */
type StreamArrays = {
  time: number[];
  heartrate: Array<number | null>;
  velocity_smooth: Array<number | null>;
  altitude: Array<number | null>;
  cadence: Array<number | null>;
  distance: Array<number | null>;
  latlng: Array<[number, number] | null>;
};

async function parseFitStreams(buffer: Buffer): Promise<StreamArrays | null> {
  const parser = new FitParser({ mode: "list", speedUnit: "m/s", lengthUnit: "m" });
  // `readFileSync` renvoie un `Buffer<ArrayBufferLike>`, incompatible avec la
  // signature de `parseAsync` (`ArrayBuffer | Buffer<ArrayBuffer>`) sous TS
  // strict — on repasse par un `ArrayBuffer` brut, accepté sans ambiguïté.
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  const data = await parser.parseAsync(arrayBuffer);
  const records = data.records ?? [];
  if (records.length === 0) return null;

  const firstTimestamp = records[0]!.timestamp?.getTime();
  if (firstTimestamp == null) return null;

  const streams: StreamArrays = {
    time: [],
    heartrate: [],
    velocity_smooth: [],
    altitude: [],
    cadence: [],
    distance: [],
    latlng: [],
  };

  for (const r of records) {
    const t = r.timestamp?.getTime();
    if (t == null) continue;
    streams.time.push(Math.round((t - firstTimestamp) / 1000));
    streams.heartrate.push(r.heart_rate ?? null);
    streams.velocity_smooth.push(r.speed ?? null);
    streams.altitude.push(r.altitude ?? null);
    streams.cadence.push(r.cadence ?? null);
    streams.distance.push(r.distance ?? null);
    streams.latlng.push(
      r.position_lat != null && r.position_long != null
        ? [r.position_lat, r.position_long]
        : null,
    );
  }

  return streams;
}

function availableKeys(streams: StreamArrays): string[] {
  return (Object.keys(streams) as Array<keyof StreamArrays>).filter(
    (k) => k !== "time" && streams[k].some((v) => v != null),
  );
}

async function importOne(filePath: string): Promise<"ok" | "sans_activite" | "vide"> {
  const labelId = basename(filePath, ".fit");
  const activity = await prisma.activity.findUnique({
    where: { source_sourceId: { source: "coros", sourceId: labelId } },
  });
  if (!activity) return "sans_activite";

  const streams = await parseFitStreams(readFileSync(filePath));
  if (!streams) return "vide";

  const payload = gzipSync(Buffer.from(JSON.stringify(streams)));
  const available = availableKeys(streams);
  const { tracePath, traceViewBox } = buildCachedTrace(streams.latlng);

  await prisma.activityStream.upsert({
    where: { activityId: activity.id },
    create: {
      activityId: activity.id,
      data: payload,
      availableStreamsJson: JSON.stringify(available),
      pointCount: streams.time.length,
      tracePath,
      traceViewBox,
    },
    update: {
      data: payload,
      availableStreamsJson: JSON.stringify(available),
      pointCount: streams.time.length,
      tracePath,
      traceViewBox,
      fetchedAt: new Date(),
    },
  });

  await prisma.activity.update({
    where: { id: activity.id },
    data: {
      hasStreams: true,
      hasHeartrate: available.includes("heartrate"),
      // Les flux ont changé : les métriques dérivées (GAP, découplage,
      // meilleurs efforts) doivent être recalculées, pas laissées périmées.
      metricsComputedAt: null,
    },
  });

  return "ok";
}

async function main(): Promise<void> {
  if (!existsSync(FIT_DIR)) {
    console.error(`Aucun fichier à importer : ${FIT_DIR} n'existe pas.`);
    process.exitCode = 1;
    return;
  }

  const files = readdirSync(FIT_DIR).filter((f) => f.endsWith(".fit"));
  const counts = { ok: 0, sans_activite: 0, vide: 0 };

  for (const file of files) {
    const result = await importOne(join(FIT_DIR, file));
    counts[result]++;
    if (result !== "ok") console.warn(`${file} : ${result}`);
  }

  console.log(
    `${counts.ok} flux importé(s), ${counts.sans_activite} sans activité correspondante, ` +
      `${counts.vide} fichier(s) sans enregistrement exploitable.`,
  );

  const report = await recomputeMetrics({ force: true, budgetMs: 60_000 });
  console.log(
    `Métriques recalculées : ${report.processed} activité(s) traitée(s) sur ${report.total}` +
      (report.skipped > 0 ? ` (${report.skipped} restante(s), relancer via "Tout recalculer").` : "."),
  );
  console.log(
    "\nRappel : le TRIMP reste non disponible tant que le profil (FC max, FC repos, sexe) " +
      "n'est pas renseigné dans Réglages → Profil.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
