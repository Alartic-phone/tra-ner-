import { isValidDay } from "../shifts/day.ts";
import type { HeartRateZone } from "../metrics/zones.ts";
import { decodeCsvBuffer, tokenizeCsv } from "./csv.ts";

export const EXPECTED_HEADER = [
  "date",
  "jour",
  "poste_F6",
  "type",
  "statut",
  "distance_km",
  "duree_estimee_min",
  "fc_cible_min",
  "fc_cible_max",
  "zone",
  "objectif_seance",
  "muscu_details",
  "fractionne_details",
  "notes",
] as const;

export type ImportStatus = "FAIT" | "A_FAIRE";

export type ValidImportRow = {
  line: number;
  day: string;
  type: string;
  status: ImportStatus;
  distanceM: number | null;
  durationS: number | null;
  hrTargetMinBpm: number | null;
  hrTargetMaxBpm: number | null;
  zoneLabel: string | null;
  objective: string;
  muscuDetails: string | null;
  fractionneDetails: string | null;
  notes: string | null;
};

export type RejectedImportRow = { line: number; reason: string };

export type PlanImportParseResult =
  | { ok: false; fileError: string }
  | {
      ok: true;
      encoding: "utf-8" | "windows-1252";
      valid: ValidImportRow[];
      rejected: RejectedImportRow[];
    };

function blankToNull(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** `null` = champ vide (non fourni), `"invalid"` = présent mais pas un nombre. */
function parseOptionalNumber(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : "invalid";
}

function parseOptionalInt(raw: string): number | null | "invalid" {
  const n = parseOptionalNumber(raw);
  if (n === null || n === "invalid") return n;
  return Number.isInteger(n) ? n : "invalid";
}

/** Première zone 1-6 mentionnée dans le libellé libre, ou `null` si aucune. */
function extractZoneIndex(zoneLabel: string): number | null {
  const match = zoneLabel.match(/[1-6]/);
  return match ? Number(match[0]) : null;
}

/**
 * Fourchette bpm humaine d'une zone (mêmes bornes que `formatZoneBpmRange`) :
 * zone 1 ouverte vers le bas, zone 6 ouverte vers le haut, les autres
 * fermées. C'est cette fourchette-là qu'on compare au fc_cible du CSV, pas
 * les bornes internes exclusives utilisées pour classer un battement.
 */
function zoneDisplayRange(zone: HeartRateZone): { min: number; max: number | null } {
  if (zone.index === 1) return { min: 0, max: zone.toBpm - 1 };
  if (zone.index === 6) return { min: zone.fromBpm, max: null };
  return { min: zone.fromBpm, max: zone.toBpm - 1 };
}

/**
 * Valide une ligne déjà tokenisée. Fonction PURE : les zones FC (seule
 * autorité pour R5) sont calculées par l'appelant à partir du profil, pas
 * recalculées ici — ce module ne touche jamais la base.
 */
export function validateRow(
  cells: string[],
  line: number,
  zones: readonly HeartRateZone[],
): { ok: true; row: ValidImportRow } | { ok: false; row: RejectedImportRow } {
  const reject = (reason: string) => ({ ok: false as const, row: { line, reason } });

  if (cells.length !== EXPECTED_HEADER.length) {
    return reject(`colonnes manquantes (${EXPECTED_HEADER.length} attendues, ${cells.length} trouvées)`);
  }

  // `cells.length === EXPECTED_HEADER.length` vient d'être vérifié ci-dessus,
  // mais `noUncheckedIndexedAccess` ne le sait pas depuis une déstructuration
  // — `?? ""` documente que ces valeurs sont sûres à ce stade, pas qu'un
  // champ vide est traité comme "0" nulle part (`blankToNull`/`parseOptional*`
  // traitent déjà "" comme vide).
  // `jour` et `poste_F6` sont présentes dans l'en-tête mais jamais stockées :
  // le poste réel d'une journée est calculé par lib/shifts/ (cycle +
  // exceptions), seule autorité en la matière. Stocker la valeur du CSV
  // créerait une seconde source pouvant diverger de la vraie.
  const [
    dateRaw = "",
    ,
    ,
    typeRaw = "",
    statutRaw = "",
    distanceRaw = "",
    dureeRaw = "",
    fcMinRaw = "",
    fcMaxRaw = "",
    zoneRaw = "",
    objectifRaw = "",
    muscuRaw = "",
    fractionneRaw = "",
    notesRaw = "",
  ] = cells;

  const day = dateRaw.trim();
  if (!isValidDay(day)) {
    return reject(`date invalide : "${dateRaw}" (attendu AAAA-MM-JJ)`);
  }

  const statut = statutRaw.trim();
  if (statut !== "FAIT" && statut !== "A_FAIRE") {
    return reject(`statut inconnu : "${statutRaw}" (attendu FAIT ou A_FAIRE)`);
  }

  const distanceKm = parseOptionalNumber(distanceRaw);
  if (distanceKm === "invalid") {
    return reject(`distance_km invalide : "${distanceRaw}"`);
  }
  if (distanceKm != null && distanceKm < 0) {
    return reject(`distance négative : ${distanceKm} km`);
  }

  const dureeMin = parseOptionalInt(dureeRaw);
  if (dureeMin === "invalid") {
    return reject(`duree_estimee_min invalide : "${dureeRaw}"`);
  }
  // Non listée explicitement dans les cas de rejet du cahier des charges,
  // ajoutée par cohérence avec "distance négative" : une durée négative
  // n'est pas une donnée qu'on peut afficher telle quelle (R1).
  if (dureeMin != null && dureeMin < 0) {
    return reject(`durée négative : ${dureeMin} min`);
  }

  const fcMin = parseOptionalInt(fcMinRaw);
  if (fcMin === "invalid") return reject(`fc_cible_min invalide : "${fcMinRaw}"`);
  if (fcMin != null && (fcMin < 30 || fcMin > 220)) {
    return reject(`fc_cible_min hors 30-220 bpm : ${fcMin}`);
  }

  const fcMax = parseOptionalInt(fcMaxRaw);
  if (fcMax === "invalid") return reject(`fc_cible_max invalide : "${fcMaxRaw}"`);
  if (fcMax != null && (fcMax < 30 || fcMax > 220)) {
    return reject(`fc_cible_max hors 30-220 bpm : ${fcMax}`);
  }

  if (fcMin != null && fcMax != null && fcMin > fcMax) {
    return reject(`fc_cible_min (${fcMin}) > fc_cible_max (${fcMax})`);
  }

  const zoneLabel = blankToNull(zoneRaw);

  // R5 : `zone` est descriptif, jamais autoritaire — seules
  // lib/metrics/zones.ts font foi. On ne rejette que si le libellé cite un
  // numéro de zone identifiable ET que la fourchette fc_cible complète
  // contredit la fourchette bpm réelle de cette zone (calculée depuis le
  // profil). Sans les deux bornes, ou sans zones calculables (pas de FC
  // seuil renseignée), aucune comparaison n'est possible — on ne l'invente
  // pas, on ne vérifie simplement rien.
  if (zoneLabel != null && fcMin != null && fcMax != null && zones.length > 0) {
    const zoneIndex = extractZoneIndex(zoneLabel);
    const zone = zoneIndex != null ? zones.find((z) => z.index === zoneIndex) : undefined;
    if (zone) {
      const range = zoneDisplayRange(zone);
      const tooLow = fcMin < range.min;
      const tooHigh = range.max != null && fcMax > range.max;
      if (tooLow || tooHigh) {
        const humanRange = range.max == null ? `> ${range.min - 1}` : `${range.min}–${range.max}`;
        return reject(
          `zone "${zoneLabel}" (Z${zone.index}, ${humanRange} bpm selon lib/metrics/zones.ts) contredit fc_cible ${fcMin}-${fcMax}`,
        );
      }
    }
  }

  return {
    ok: true,
    row: {
      line,
      day,
      type: typeRaw.trim(),
      status: statut,
      distanceM: distanceKm != null ? distanceKm * 1000 : null,
      durationS: dureeMin != null ? dureeMin * 60 : null,
      hrTargetMinBpm: fcMin,
      hrTargetMaxBpm: fcMax,
      zoneLabel,
      objective: objectifRaw.trim(),
      muscuDetails: blankToNull(muscuRaw),
      fractionneDetails: blankToNull(fractionneRaw),
      notes: blankToNull(notesRaw),
    },
  };
}

/**
 * Analyse un fichier CSV complet : détection d'encodage, tokenisation,
 * validation ligne à ligne, puis détection des dates en double dans le
 * fichier (qui déclasse a posteriori une ligne par ailleurs valide). Ne lit
 * ni n'écrit jamais la base — `zones` est fourni par l'appelant.
 */
export function parsePlanImportCsv(
  buffer: Buffer,
  zones: readonly HeartRateZone[],
): PlanImportParseResult {
  const { text, encoding } = decodeCsvBuffer(buffer);
  const rows = tokenizeCsv(text, ";");

  if (rows.length === 0) {
    return { ok: false, fileError: "fichier vide" };
  }

  const header = (rows[0] ?? []).map((h) => h.trim());
  const headerMatches =
    header.length === EXPECTED_HEADER.length &&
    header.every((h, i) => h === EXPECTED_HEADER[i]);
  if (!headerMatches) {
    return {
      ok: false,
      fileError: `en-tête invalide — attendu : ${EXPECTED_HEADER.join(";")} — trouvé : ${header.join(";")}`,
    };
  }

  const dataRows = rows.slice(1);
  const valid: ValidImportRow[] = [];
  const rejected: RejectedImportRow[] = [];

  for (let idx = 0; idx < dataRows.length; idx++) {
    const line = idx + 2; // +1 pour l'en-tête, +1 pour l'index 0-based.
    const result = validateRow(dataRows[idx] ?? [], line, zones);
    if (result.ok) valid.push(result.row);
    else rejected.push(result.row);
  }

  // Dates en double dans le fichier : toutes les occurrences (parmi les
  // lignes par ailleurs valides) sont rejetées, pas seulement la seconde —
  // rien ne dit laquelle des deux est la bonne.
  const linesByDay = new Map<string, ValidImportRow[]>();
  for (const row of valid) {
    const list = linesByDay.get(row.day);
    if (list) list.push(row);
    else linesByDay.set(row.day, [row]);
  }
  const stillValid: ValidImportRow[] = [];
  for (const [day, rowsForDay] of linesByDay) {
    if (rowsForDay.length > 1) {
      const lines = rowsForDay.map((r) => r.line).sort((a, b) => a - b);
      for (const row of rowsForDay) {
        rejected.push({
          line: row.line,
          reason: `date en double dans le fichier : ${day} (lignes ${lines.join(", ")})`,
        });
      }
    } else {
      const only = rowsForDay[0];
      if (only) stillValid.push(only);
    }
  }

  rejected.sort((a, b) => a.line - b.line);
  stillValid.sort((a, b) => a.line - b.line);

  return { ok: true, encoding, valid: stillValid, rejected };
}
