import { describe, expect, it } from "vitest";
import { computeHeartRateZones } from "../metrics/zones.ts";
import { parsePlanImportCsv, validateRow } from "./parse.ts";

// Seuil 175 bpm — mêmes bornes que celles documentées dans zones.ts et
// apps/coach/CLAUDE.md (Z1 <140, Z2 140-158, Z3 159-166, Z4 167-179,
// Z5 180-186, Z6 >186).
const ZONES = computeHeartRateZones(175);

const HEADER =
  "date;jour;poste_F6;type;statut;distance_km;duree_estimee_min;fc_cible_min;fc_cible_max;zone;objectif_seance;muscu_details;fractionne_details;notes";

function csv(...lines: string[]): Buffer {
  return Buffer.from([HEADER, ...lines].join("\n"), "utf-8");
}

describe("parsePlanImportCsv — fichier valide", () => {
  it("accepte toutes les lignes de l'exemple fourni (plan_S5_07-13-09.csv)", () => {
    const buf = csv(
      '2026-09-06;Dimanche;Repos;Renforcement;FAIT;;35;;;;Dernière séance salle;"Développé machine pecs 39kg 3x12 | Tirage vertical 32kg 3x12";;Gainage fait',
      "2026-09-07;Lundi;Repos;Repos;A_FAIRE;0;0;;;;Repos complet.;;;",
      "2026-09-08;Mardi;Matin;Course - reprise;A_FAIRE;7.5;45;143;152;Zone 2;Reprise en douceur.;;;Prescrit 7-8km",
      "2026-09-12;Samedi;Nuit;Course facile;A_FAIRE;6;42;140;148;Zone 2 basse;Resynchronisation.;;;Chaleur Miami",
    );
    const result = parsePlanImportCsv(buf, ZONES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.encoding).toBe("utf-8");
    expect(result.rejected).toEqual([]);
    expect(result.valid).toHaveLength(4);

    const renfo = result.valid[0]!;
    expect(renfo.day).toBe("2026-09-06");
    expect(renfo.status).toBe("FAIT");
    expect(renfo.distanceM).toBeNull();
    expect(renfo.durationS).toBe(35 * 60);
    expect(renfo.muscuDetails).toBe(
      "Développé machine pecs 39kg 3x12 | Tirage vertical 32kg 3x12",
    );

    const repos = result.valid[1]!;
    // "0" explicite doit rester 0, pas null (R1 : un champ vide reste vide,
    // mais "0" n'est pas vide).
    expect(repos.distanceM).toBe(0);
    expect(repos.durationS).toBe(0);

    const course = result.valid[2]!;
    expect(course.distanceM).toBe(7500);
    expect(course.hrTargetMinBpm).toBe(143);
    expect(course.hrTargetMaxBpm).toBe(152);
  });

  it("accepte l'en-tête à 14 colonnes (poste_F6) et ignore sa valeur — le poste réel vient de lib/shifts/", () => {
    const buf = csv(
      "2026-09-08;Mardi;Nuit;Course - reprise;A_FAIRE;7.5;45;143;152;Zone 2;Reprise en douceur.;;;",
    );
    const result = parsePlanImportCsv(buf, ZONES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected).toEqual([]);
    expect(result.valid).toHaveLength(1);
    // `poste_F6` ("Nuit") n'apparaît dans aucun champ de la ligne validée.
    expect(Object.values(result.valid[0]!)).not.toContain("Nuit");
  });
});

describe("parsePlanImportCsv — encodage CP1252", () => {
  it("décode correctement les accents d'un fichier exporté par Excel français", () => {
    const cp1252Bytes = Buffer.from(
      [HEADER, '2026-09-08;Mardi;Matin;S\xe9ance;A_FAIRE;;;;;;Reprise apr\xe8s la nuit isol\xe9e;;;'].join(
        "\n",
      ),
      "latin1", // les octets 0xE9/0xE8 ci-dessus SONT du CP1252 (identique à latin1 pour les lettres accentuées communes)
    );
    const result = parsePlanImportCsv(cp1252Bytes, ZONES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.encoding).toBe("windows-1252");
    expect(result.rejected).toEqual([]);
    expect(result.valid[0]!.type).toBe("Séance");
    expect(result.valid[0]!.objective).toBe("Reprise après la nuit isolée");
  });
});

describe("parsePlanImportCsv — ligne invalide", () => {
  it("rejette une date invalide en nommant la ligne et le motif", () => {
    const buf = csv("2026-13-40;Mardi;Matin;Course;A_FAIRE;5;30;;;;Objectif;;;");
    const result = parsePlanImportCsv(buf, ZONES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.valid).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.line).toBe(2);
    expect(result.rejected[0]!.reason).toMatch(/date invalide/);
  });

  it("rejette un statut inconnu", () => {
    const buf = csv("2026-09-08;Mardi;Matin;Course;PEUT_ETRE;5;30;;;;Objectif;;;");
    const result = parsePlanImportCsv(buf, ZONES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected[0]!.reason).toMatch(/statut inconnu/);
  });

  it("rejette une distance négative", () => {
    const buf = csv("2026-09-08;Mardi;Matin;Course;A_FAIRE;-5;30;;;;Objectif;;;");
    const result = parsePlanImportCsv(buf, ZONES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected[0]!.reason).toMatch(/distance négative/);
  });

  it("rejette une FC hors 30-220", () => {
    const buf = csv("2026-09-08;Mardi;Matin;Course;A_FAIRE;5;30;250;260;;Objectif;;;");
    const result = parsePlanImportCsv(buf, ZONES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected[0]!.reason).toMatch(/hors 30-220/);
  });

  it("rejette fc_cible_min > fc_cible_max", () => {
    const buf = csv("2026-09-08;Mardi;Matin;Course;A_FAIRE;5;30;160;150;;Objectif;;;");
    const result = parsePlanImportCsv(buf, ZONES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected[0]!.reason).toMatch(/fc_cible_min \(160\) > fc_cible_max \(150\)/);
  });

  it("rejette des colonnes manquantes", () => {
    const buf = csv("2026-09-08;Mardi;Course;A_FAIRE;5;30");
    const result = parsePlanImportCsv(buf, ZONES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected[0]!.reason).toMatch(/colonnes manquantes/);
  });

  it("rejette un en-tête invalide pour tout le fichier", () => {
    const buf = Buffer.from("a;b;c\n1;2;3", "utf-8");
    const result = parsePlanImportCsv(buf, ZONES);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fileError).toMatch(/en-tête invalide/);
  });

  it("rejette les dates en double dans le fichier (les deux occurrences)", () => {
    const buf = csv(
      "2026-09-08;Mardi;Matin;Course;A_FAIRE;5;30;;;;Objectif A;;;",
      "2026-09-08;Mardi;Nuit;Course;A_FAIRE;6;35;;;;Objectif B;;;",
    );
    const result = parsePlanImportCsv(buf, ZONES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.valid).toEqual([]);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0]!.reason).toMatch(/date en double/);
    expect(result.rejected[1]!.reason).toMatch(/date en double/);
  });
});

describe("validateRow — R5 : contradiction zone / fc_cible", () => {
  it("rejette quand fc_cible tombe dans une autre zone que celle nommée", () => {
    // "Zone 2" (140-158 à seuil 175) mais fc_cible 159-166 = Z3.
    const result = validateRow(
      ["2026-09-08", "Mardi", "Matin", "Course", "A_FAIRE", "5", "30", "159", "166", "Zone 2", "Objectif", "", "", ""],
      2,
      ZONES,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.row.reason).toMatch(/zone "Zone 2" \(Z2, 140–158 bpm.*contredit fc_cible 159-166/);
  });

  it("accepte quand fc_cible est cohérent avec la zone nommée (y compris un sous-libellé comme 'Zone 2 basse')", () => {
    const result = validateRow(
      ["2026-09-12", "Samedi", "Matin", "Course facile", "A_FAIRE", "6", "42", "140", "148", "Zone 2 basse", "Objectif", "", "", ""],
      2,
      ZONES,
    );
    expect(result.ok).toBe(true);
  });

  it("n'essaie pas de valider la zone si les deux bornes fc_cible ne sont pas fournies", () => {
    const result = validateRow(
      ["2026-09-08", "Mardi", "Matin", "Course", "A_FAIRE", "5", "30", "159", "", "Zone 2", "Objectif", "", "", ""],
      2,
      ZONES,
    );
    expect(result.ok).toBe(true);
  });

  it("n'invente pas de zone sans FC seuil connue (zones = [])", () => {
    const result = validateRow(
      ["2026-09-08", "Mardi", "Matin", "Course", "A_FAIRE", "5", "30", "159", "166", "Zone 2", "Objectif", "", "", ""],
      2,
      [],
    );
    expect(result.ok).toBe(true);
  });
});
