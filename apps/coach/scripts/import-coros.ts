/**
 * Importe un export brut COROS (activités + données de santé quotidiennes)
 * depuis `data/coros-raw/` vers la base.
 *
 * COROS n'expose pas d'API publique aux particuliers (voir README) : ces
 * fichiers texte sont un export manuel, à déposer dans `data/coros-raw/`
 * avant de lancer ce script. Rien n'est écrasé aveuglément — les activités
 * se dédupliquent sur `[source, sourceId]` (upsert), les métriques
 * quotidiennes sur `day` (upsert). Un champ absent du texte source reste
 * absent en base, jamais remplacé par une valeur plausible.
 *
 *   npm run import:coros
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db.ts";
import { toDay } from "../src/lib/time.ts";

const RAW_DIR = join(import.meta.dirname, "..", "data", "coros-raw");

// ---------------------------------------------------------------------------
// Utilitaires de parsing
// ---------------------------------------------------------------------------

/** "2:46:05" -> secondes (H:MM:SS) ; "29:50" -> secondes (MM:SS). */
function parseClockToSeconds(clock: string): number {
  const parts = clock.trim().split(":").map(Number);
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  throw new Error(`Durée non reconnue : "${clock}"`);
}

/** "5.01 km" -> 5010 ; "740 m" -> 740. */
function parseDistanceToMeters(distance: string): number {
  const match = /^([\d.]+)\s*(km|m)$/.exec(distance.trim());
  if (!match) throw new Error(`Distance non reconnue : "${distance}"`);
  const value = Number(match[1]);
  return match[2] === "km" ? Math.round(value * 1000) : Math.round(value);
}

/** "7h 42min" -> 462 ; "38 min" -> 38 ; absent de la chaîne -> 0. */
function parseDurationToMinutes(text: string): number {
  const hours = /(\d+)h/.exec(text);
  const minutes = /(\d+)\s*min/.exec(text);
  return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
}

function readRaw(filename: string): string | null {
  const path = join(RAW_DIR, filename);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

// ---------------------------------------------------------------------------
// Activités — sport-records.txt
// ---------------------------------------------------------------------------

type ParsedActivity = {
  labelId: string;
  sportType: number;
  location: string | null;
  startTimestamp: number;
  durationS: number;
  distanceM: number;
  avgHr: number | null;
  calories: number | null;
};

/** Types COROS considérés comme course à pied (100-103, cf. querySportRecords). */
const RUN_SPORT_TYPES = new Set([100, 101, 102, 103]);
/** 101 = tapis/salle -> équivalent du "VirtualRun" de Strava, déjà reconnu par isRun(). */
const INDOOR_SPORT_TYPES = new Set([101]);

function parseSportRecords(raw: string): ParsedActivity[] {
  const blocks = raw.split(/\n(?=\d+\.\s)/).filter((b) => /^\d+\.\s/.test(b));
  const activities: ParsedActivity[] = [];

  for (const block of blocks) {
    const location = /Location:\s*(.+)/.exec(block)?.[1]?.trim() ?? null;
    const timeWindow = /startTimestamp=(\d+)/.exec(block);
    const duration = /Duration:\s*([\d:]+)/.exec(block);
    const distance = /Distance:\s*([\d.]+\s*k?m)/.exec(block);
    const avgHr = /Avg HR:\s*(\d+)\s*bpm/.exec(block);
    const calories = /Calories:\s*(\d+)\s*kcal/.exec(block);
    const labelId = /LabelId:\s*(\d+)/.exec(block);
    const sportType = /SportType:\s*(\d+)/.exec(block);

    if (!timeWindow || !duration || !distance || !labelId || !sportType) {
      throw new Error(`Enregistrement sport-records.txt incomplet :\n${block}`);
    }

    const type = Number(sportType[1]);
    if (!RUN_SPORT_TYPES.has(type)) continue; // Hors course à pied : ignoré.

    activities.push({
      labelId: labelId[1]!,
      sportType: type,
      location,
      startTimestamp: Number(timeWindow[1]),
      durationS: parseClockToSeconds(duration[1]!),
      distanceM: parseDistanceToMeters(distance[1]!),
      avgHr: avgHr ? Number(avgHr[1]) : null,
      calories: calories ? Number(calories[1]) : null,
    });
  }

  return activities;
}

// ---------------------------------------------------------------------------
// Santé quotidienne — daily-health-data.txt, resting-hr.txt, sleep-hrv.txt,
// training-load.txt
// ---------------------------------------------------------------------------

type DailyHealth = {
  sleepDurationMin: number | null;
  sleepDeepMin: number | null;
  sleepRemMin: number | null;
  sleepScore: number | null;
};

function parseDailyHealthData(raw: string): Map<string, DailyHealth> {
  const out = new Map<string, DailyHealth>();
  const blocks = raw.split(/\n(?=--- \d{8} ---)/).filter((b) => /^--- \d{8} ---/.test(b));

  for (const block of blocks) {
    const dayMatch = /--- (\d{8}) ---/.exec(block);
    if (!dayMatch) continue;
    const day = `${dayMatch[1]!.slice(0, 4)}-${dayMatch[1]!.slice(4, 6)}-${dayMatch[1]!.slice(6, 8)}`;

    if (!/Sleep Summary:/.test(block)) continue; // Rien à retenir ce jour-là.

    const scoreMatch = /\(Score:\s*(-?\d+)\)/.exec(block);
    const score = scoreMatch ? Number(scoreMatch[1]) : null;

    const totalMatch = /Total:\s*([^|]+)/.exec(block);
    const deepMatch = /Deep:\s*([^|]+)/.exec(block);
    const remMatch = /REM:\s*([^|]+)/.exec(block);

    out.set(day, {
      sleepDurationMin: totalMatch ? parseDurationToMinutes(totalMatch[1]!) : null,
      sleepDeepMin: deepMatch ? parseDurationToMinutes(deepMatch[1]!) : null,
      sleepRemMin: remMatch ? parseDurationToMinutes(remMatch[1]!) : null,
      // -1 est un code "pas de score réel" (nuit trop courte pour être évaluée) : traité comme absent.
      sleepScore: score != null && score >= 0 ? score : null,
    });
  }

  return out;
}

function parseRestingHr(raw: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of raw.split("\n")) {
    const match = /^(\d{4}-\d{2}-\d{2}):\s*(\d+)\s*bpm/.exec(line.trim());
    if (match) out.set(match[1]!, Number(match[2]));
  }
  return out;
}

function parseSleepHrv(raw: string): Map<string, number> {
  const out = new Map<string, number>();
  const entries = raw.matchAll(/(\d{4}-\d{2}-\d{2}):\s*\n\s*HRV Avg:\s*(\d+)\s*ms/g);
  for (const [, day, hrv] of entries) out.set(day!, Number(hrv));
  return out;
}

function parseTrainingLoad(raw: string): Map<string, number> {
  const out = new Map<string, number>();
  const entries = raw.matchAll(/(\d{4}-\d{2}-\d{2})\nShort-Term Load:\s*(\d+)/g);
  for (const [, day, load] of entries) out.set(day!, Number(load));
  return out;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

async function importActivities(): Promise<number> {
  const raw = readRaw("sport-records.txt");
  if (!raw) return 0;
  const activities = parseSportRecords(raw);

  let count = 0;
  for (const a of activities) {
    const startedAt = new Date(a.startTimestamp * 1000);
    const data = {
      source: "coros",
      sourceId: a.labelId,
      name: a.location ?? (INDOOR_SPORT_TYPES.has(a.sportType) ? "Course en salle" : "Course"),
      type: INDOOR_SPORT_TYPES.has(a.sportType) ? "VirtualRun" : "Run",
      sportType: null,
      startedAt,
      startDay: toDay(startedAt),
      distanceM: a.distanceM,
      movingTimeS: a.durationS,
      elapsedTimeS: a.durationS,
      avgSpeedMps: a.durationS > 0 ? a.distanceM / a.durationS : null,
      avgHr: a.avgHr,
      calories: a.calories,
      hasHeartrate: a.avgHr != null,
      rawSummaryJson: JSON.stringify(a),
    };

    await prisma.activity.upsert({
      where: { source_sourceId: { source: "coros", sourceId: a.labelId } },
      create: data,
      update: data,
    });
    count++;
  }
  return count;
}

async function importHealthMetrics(): Promise<number> {
  const dailyRaw = readRaw("daily-health-data.txt");
  const restingHrRaw = readRaw("resting-hr.txt");
  const hrvRaw = readRaw("sleep-hrv.txt");
  const loadRaw = readRaw("training-load.txt");

  const daily = dailyRaw ? parseDailyHealthData(dailyRaw) : new Map<string, DailyHealth>();
  const restingHr = restingHrRaw ? parseRestingHr(restingHrRaw) : new Map<string, number>();
  const hrv = hrvRaw ? parseSleepHrv(hrvRaw) : new Map<string, number>();
  const load = loadRaw ? parseTrainingLoad(loadRaw) : new Map<string, number>();

  const days = new Set([...daily.keys(), ...restingHr.keys(), ...hrv.keys(), ...load.keys()]);

  let count = 0;
  for (const day of days) {
    const d = daily.get(day);
    const data = {
      sleepDurationMin: d?.sleepDurationMin ?? null,
      sleepDeepMin: d?.sleepDeepMin ?? null,
      sleepRemMin: d?.sleepRemMin ?? null,
      sleepScore: d?.sleepScore ?? null,
      hrv: hrv.get(day) ?? null,
      restingHr: restingHr.get(day) ?? null,
      trainingLoadCoros: load.get(day) ?? null,
      source: "coros_export",
    };
    if (Object.values(data).every((v) => v == null || v === "coros_export")) continue;

    await prisma.healthMetric.upsert({
      where: { day },
      create: { day, ...data },
      update: data,
    });
    count++;
  }
  return count;
}

async function main(): Promise<void> {
  if (!existsSync(RAW_DIR)) {
    console.error(`Aucun export à importer : ${RAW_DIR} n'existe pas.`);
    process.exitCode = 1;
    return;
  }

  const activityCount = await importActivities();
  console.log(`${activityCount} activité(s) COROS importée(s)/mise(s) à jour.`);

  const healthCount = await importHealthMetrics();
  console.log(`${healthCount} jour(s) de données de santé importé(s)/mis à jour.`);

  console.log(
    "\nRappel : la charge d'entraînement (TRIMP) de ces activités ne se calculera qu'une fois " +
      "le profil (FC max, FC repos, sexe) renseigné dans Réglages → Profil, puis « Tout recalculer » " +
      "depuis la page Analyses.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
