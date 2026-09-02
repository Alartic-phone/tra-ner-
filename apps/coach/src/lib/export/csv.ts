import JSZip from "jszip";
import type { ExportData } from "./schema.ts";

/**
 * Rendu CSV : quatre fichiers distincts, un par forme de tableau, zippés
 * ensemble. Séparateur virgule, en-têtes en français SANS accent (certains
 * tableurs mal configurés interprètent mal l'UTF-8 des en-têtes), nombres au
 * point décimal, dates ISO — jamais de format localisé qui romprait le tri.
 *
 * `buildCsvFiles` est pure et testée seule ; `renderCsvZip` n'ajoute que la
 * compression (JSZip), qui n'a pas besoin d'être re-testée pour son propre
 * compte.
 */

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

function csvFile(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [csvLine(headers), ...rows.map(csvLine)];
  return lines.join("\r\n") + "\r\n";
}

export function buildCsvFiles(data: ExportData): Record<string, string> {
  const files: Record<string, string> = {};

  if (data.activities) {
    files["activites.csv"] = csvFile(
      [
        "jour",
        "heure",
        "sport",
        "nom",
        "distance_m",
        "temps_mouvement_s",
        "temps_ecoule_s",
        "vitesse_moy_mps",
        "fc_moy",
        "fc_max",
        "denivele_m",
        "cadence",
        "calories",
        "trimp",
        "trimp_estime",
        "poste",
        "source",
      ],
      data.activities.map((a) => [
        a.day,
        a.time,
        a.sport,
        a.name,
        a.distanceM,
        a.movingTimeS,
        a.elapsedTimeS,
        a.avgSpeedMps,
        a.avgHr,
        a.maxHr,
        a.elevationGainM,
        a.avgCadence,
        a.calories,
        a.trimp,
        a.trimpEstimated ? "oui" : "non",
        a.shiftCode ?? "repos",
        a.source,
      ]),
    );
  }

  if (data.health) {
    files["sante.csv"] = csvFile(
      ["jour", "vfc_ms", "poste_code", "poste_debut", "poste_fin", "fc_repos", "sommeil_min", "score_sommeil", "sommeil_profond_pct"],
      data.health.map((h) => [
        h.day,
        h.hrv,
        h.shiftWindow?.code ?? null,
        h.shiftWindow?.start ?? null,
        h.shiftWindow?.end ?? null,
        h.restingHr,
        h.sleepDurationMin,
        h.sleepScore,
        h.sleepDeepPct != null ? Math.round(h.sleepDeepPct * 10) / 10 : null,
      ]),
    );
  }

  if (data.weeks) {
    files["semaines.csv"] = csvFile(
      [
        "semaine_debut",
        "semaine_fin",
        "km_course",
        "km_velo",
        "seances",
        "denivele_m",
        "temps_total_s",
        "trimp_total",
        "ctl",
        "atl",
        "tsb",
      ],
      data.weeks.map((w) => [
        w.weekStart,
        w.weekEnd,
        Math.round(w.runKm * 100) / 100,
        Math.round(w.rideKm * 100) / 100,
        w.sessions,
        Math.round(w.elevationGainM),
        w.totalTimeS,
        w.trimpTotal != null ? Math.round(w.trimpTotal) : null,
        w.ctl != null ? Math.round(w.ctl * 10) / 10 : null,
        w.atl != null ? Math.round(w.atl * 10) / 10 : null,
        w.tsb != null ? Math.round(w.tsb * 10) / 10 : null,
      ]),
    );
  }

  if (data.activityDetails.length > 0) {
    const rows: Array<Array<string | number | null>> = [];
    for (const detail of data.activityDetails) {
      for (const s of detail.splits) {
        rows.push([
          detail.activityId,
          s.index,
          Math.round(s.distanceM),
          s.timeS,
          s.paceSPerKm != null ? Math.round(s.paceSPerKm) : null,
          s.avgHr != null ? Math.round(s.avgHr) : null,
          s.elevGainM != null ? Math.round(s.elevGainM) : null,
          s.elevLossM != null ? Math.round(s.elevLossM) : null,
          s.partial ? "oui" : "non",
        ]);
      }
    }
    files["splits.csv"] = csvFile(
      ["activite_id", "split", "distance_m", "temps_s", "allure_s_par_km", "fc_moy", "denivele_pos_m", "denivele_neg_m", "partiel"],
      rows,
    );
  }

  return files;
}

export async function renderCsvZip(data: ExportData): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(buildCsvFiles(data))) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
