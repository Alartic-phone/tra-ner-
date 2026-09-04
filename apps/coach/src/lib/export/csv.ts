import type { ExportData } from "./schema.ts";

/**
 * CSV : virgule, en-têtes sans accent, point décimal, dates ISO — la
 * convention la plus largement compatible (tableurs anglophones compris).
 */

function csvCell(value: string | number | null): string {
  if (value == null) return "";
  const s = typeof value === "number" ? String(value) : value;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: (string | number | null)[]): string {
  return cells.map(csvCell).join(",");
}
function csvFile(headers: string[], rows: (string | number | null)[][]): string {
  return [csvRow(headers), ...rows.map(csvRow)].join("\r\n") + "\r\n";
}

export function buildActivitiesCsv(d: ExportData): string {
  return csvFile(
    ["day", "name", "type", "distance_m", "moving_time_s", "elevation_gain_m", "avg_hr", "max_hr", "trimp", "gap_pace_s_per_km", "decoupling_pct"],
    d.activities.map((a) => [a.day, a.name, a.type, a.distanceM, a.movingTimeS, a.elevationGainM, a.avgHr, a.maxHr, a.trimp, a.gapPaceSPerKm, a.decouplingPct]),
  );
}

export function buildHealthCsv(d: ExportData): string {
  return csvFile(
    ["day", "hrv_ms", "resting_hr", "sleep_duration_min", "sleep_deep_min", "sleep_score", "recovery_pct"],
    d.health.map((h) => [h.day, h.hrv, h.restingHr, h.sleepDurationMin, h.sleepDeepMin, h.sleepScore, h.recoveryStatusPct]),
  );
}

export function buildWeeksCsv(d: ExportData): string {
  return csvFile(
    ["week_start", "week_end", "run_km", "ride_km", "sessions", "elevation_m", "duration_s", "trimp", "ctl_end", "atl_end", "tsb_end"],
    d.weeks.map((w) => [w.weekStart, w.weekEnd, w.runKm, w.rideKm, w.sessions, w.elevationM, w.durationS, w.trimp, w.ctlEnd, w.atlEnd, w.tsbEnd]),
  );
}

export function buildSplitsCsv(d: ExportData): string {
  const rows: (string | number | null)[][] = [];
  for (const det of d.activityDetails) {
    for (const s of det.splits) {
      rows.push([det.activityId, s.index, s.distanceM, s.movingTimeS, s.avgHr]);
    }
  }
  return csvFile(["activity_id", "split_index", "distance_m", "moving_time_s", "avg_hr"], rows);
}
