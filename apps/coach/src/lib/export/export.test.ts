import { describe, expect, it } from "vitest";
import { EXPORT_SCHEMA_VERSION, exportDataSchema, type ExportData } from "./schema.ts";
import { renderMarkdown } from "./markdown.ts";
import { renderJson } from "./json.ts";
import { buildCsvFiles } from "./csv.ts";
import { findSensitiveFieldName } from "./security.ts";

/**
 * Ces tests portent sur les renderers (markdown.ts, json.ts, csv.ts), qui
 * sont les seules fonctions PURES du module export — `collect.ts` est le
 * pont vers la base, au même titre que les autres `repository.ts` du projet,
 * et n'est délibérément pas testé avec une base réelle ici : aucun autre
 * repository du projet ne l'est, la garantie testée est celle qui compte
 * réellement — à `ExportData` identique, sortie identique.
 */

function fullFixture(): ExportData {
  return {
    metadata: {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: "2026-09-02T06:00:00.000Z",
      timezone: "Europe/Paris",
      period: { from: "2026-08-01", to: "2026-08-31" },
      counts: { activities: 2, healthDays: 2, plannedWorkouts: 1 },
      sources: ["strava", "manual"],
      notation: { estimated: "[est]", unavailable: "non disponible" },
    },
    profile: {
      ageYears: 35,
      heightCm: null,
      weight: { kg: 71.5, measuredOn: "2026-08-20" },
      hrMax: 190,
      hrRest: 48,
      lactateThresholdHr: null,
      zoneMethod: "Karvonen (réserve cardiaque)",
      hrZones: [{ index: 1, name: "Récupération", fromBpm: 119, toBpm: 133 }],
      vmaKmh: 17,
      paceZones: [
        { name: "Endurance fondamentale", fromVmaPct: 0.6, toVmaPct: 0.7, slowestSPerKm: 353, fastestSPerKm: 302 },
      ],
    },
    shifts: {
      cycleAnchorDay: "2026-01-01",
      blocks: [{ sequence: "MMAAANN", restDays: 9 }],
      days: [
        {
          day: "2026-08-01",
          code: "M",
          label: "Matin",
          startTime: "05:00",
          endTime: "13:00",
          windows: [{ start: "14:00", end: "21:00" }],
          isException: false,
          isReplacement: false,
        },
      ],
      replacements: [{ day: "2026-08-05", code: "M", note: "remplacement collègue", isReplacement: true }],
    },
    weeks: [
      {
        weekStart: "2026-07-27",
        weekEnd: "2026-08-02",
        runKm: 42.2,
        rideKm: 0,
        otherSports: [{ sport: "Swim", km: 1.5 }],
        sessions: 5,
        elevationGainM: 320,
        totalTimeS: 14400,
        trimpTotal: 480,
        ctl: 45,
        atl: 60,
        tsb: -15,
        zoneDistributionPct: [{ zone: 2, pct: 100 }],
      },
    ],
    activities: [
      {
        id: "act1",
        day: "2026-08-01",
        time: "07:30",
        sport: "Run",
        name: "Sortie matinale",
        distanceM: 10000,
        movingTimeS: 3000,
        elapsedTimeS: 3100,
        avgSpeedMps: 3.33,
        avgHr: 150,
        maxHr: 172,
        elevationGainM: 80,
        avgCadence: 84,
        calories: 650,
        trimp: 95,
        trimpEstimated: true,
        shiftCode: "M",
        source: "strava",
      },
      {
        id: "act2",
        day: "2026-08-15",
        time: null,
        sport: "Run",
        name: "Sans FC",
        distanceM: 5000,
        movingTimeS: 1500,
        elapsedTimeS: 1550,
        avgSpeedMps: null,
        avgHr: null,
        maxHr: null,
        elevationGainM: null,
        avgCadence: null,
        calories: null,
        trimp: null,
        trimpEstimated: false,
        shiftCode: null,
        source: "manual",
      },
    ],
    activityDetails: [
      {
        activityId: "act1",
        splits: [
          { index: 1, distanceM: 1000, timeS: 300, paceSPerKm: 300, avgHr: 148, elevGainM: 5, elevLossM: 2, partial: false },
        ],
        laps: [{ lapIndex: 1, name: "Tour 1", distanceM: 5000, movingTimeS: 1500, avgSpeedMps: 3.33, avgHr: 148, maxHr: 160 }],
        zoneSeconds: [{ zone: 2, seconds: 3000 }],
        decouplingPct: 4.2,
        bestEfforts: [{ durationS: 300, distanceM: 1050 }],
      },
    ],
    health: [
      {
        day: "2026-08-01",
        hrv: 52,
        shiftWindow: { code: "M", start: "05:00", end: "13:00" },
        restingHr: 49,
        sleepDurationMin: 420,
        sleepScore: 82,
        sleepDeepPct: 20,
        naps: null,
      },
      {
        day: "2026-08-02",
        hrv: null,
        shiftWindow: null,
        restingHr: null,
        sleepDurationMin: null,
        sleepScore: null,
        sleepDeepPct: null,
        naps: null,
      },
    ],
    records: {
      byDuration: [{ durationS: 300, distanceM: 1050, day: "2026-08-01", activityId: "act1" }],
      longestRunProgression: [{ day: "2026-08-01", distanceM: 10000 }],
    },
    plan: {
      activeGoal: { name: "10 km", day: "2026-11-15", distanceM: 10000, targetTimeS: 2400 },
      workouts: [
        {
          day: "2026-08-01",
          type: "endurance",
          title: "Footing",
          targetDistanceM: 10000,
          targetHrZone: 2,
          status: "done",
          realized: { activityId: "act1", distanceM: 10000, distanceDeltaPct: 0, avgHr: 150, inTargetZone: true },
        },
      ],
    },
    quality: {
      healthDaysMissing: 1,
      healthDaysTotal: 2,
      activitiesWithoutHr: 1,
      activitiesWithoutGps: 0,
      suspectedDuplicates: [],
      estimatedFields: ["allure ajustée du dénivelé (GAP) — modèle de Minetti"],
      shiftsUnconfiguredDays: 0,
    },
    streams: null,
  };
}

describe("export — schéma", () => {
  it("la fixture complète est valide", () => {
    expect(() => exportDataSchema.parse(fullFixture())).not.toThrow();
  });
});

describe("export — déterminisme", () => {
  it("renderMarkdown produit une sortie identique au caractère près pour la même donnée", () => {
    const data = fullFixture();
    expect(renderMarkdown(data)).toBe(renderMarkdown(fullFixture()));
  });

  it("renderJson produit une sortie identique au caractère près pour la même donnée", () => {
    const data = fullFixture();
    expect(renderJson(data)).toBe(renderJson(fullFixture()));
  });

  it("buildCsvFiles produit des fichiers identiques pour la même donnée", () => {
    const a = buildCsvFiles(fullFixture());
    const b = buildCsvFiles(fullFixture());
    expect(a).toEqual(b);
    for (const name of Object.keys(a)) {
      expect(a[name]).toBe(b[name]);
    }
  });
});

describe("export — marqueurs de notation", () => {
  it("le Markdown porte le marqueur [est] pour les valeurs estimées", () => {
    const md = renderMarkdown(fullFixture());
    expect(md).toContain("[est]");
  });

  it("le Markdown porte « non disponible » pour les données absentes", () => {
    const md = renderMarkdown(fullFixture());
    expect(md).toContain("non disponible");
  });

  it("les deux marqueurs sont rappelés explicitement dans les métadonnées", () => {
    const md = renderMarkdown(fullFixture());
    const metadataSection = md.slice(0, md.indexOf("## 1."));
    expect(metadataSection).toContain("`[est]`");
    expect(metadataSection).toContain("« non disponible »");
  });

  it("une activité non estimée n'est pas marquée [est]", () => {
    const md = renderMarkdown(fullFixture());
    // "Sans FC" (act2) n'a pas de TRIMP estimé : sa ligne ne doit pas porter le marqueur.
    const line = md.split("\n").find((l) => l.includes("Sans FC"));
    expect(line).toBeDefined();
    expect(line).not.toContain("[est]");
  });
});

describe("export — aucune section vide quand la base contient des données", () => {
  it.each([
    ["## 1. Profil et zones", "Zones de fréquence cardiaque"],
    ["## 2. Postes", "Journées de la période"],
    ["## 3. Semaines", "2026-07-27"],
    ["## 4. Activités", "Sortie matinale"],
    ["## 6. Santé quotidienne", "2026-08-01"],
    ["## 7. Records et meilleurs efforts", "1,05 km"],
    ["## 8. Plan", "Footing"],
    ["## 9. Qualité des données", "Jours sans mesure"],
  ])("%s contient des données réelles, pas seulement un en-tête", (heading, mustContain) => {
    const md = renderMarkdown(fullFixture());
    const start = md.indexOf(heading);
    expect(start).toBeGreaterThanOrEqual(0);
    const nextHeading = md.indexOf("\n## ", start + 1);
    const section = md.slice(start, nextHeading === -1 ? undefined : nextHeading);
    expect(section).not.toMatch(/^\s*_Aucune donnée\._\s*$/m);
    expect(section).toContain(mustContain);
  });

  it("section 9 n'est jamais vide même sans problème détecté : elle le dit explicitement", () => {
    const clean = fullFixture();
    clean.quality!.suspectedDuplicates = [];
    clean.quality!.estimatedFields = [];
    const md = renderMarkdown(clean);
    expect(md).toContain("Aucun doublon détecté sur la période");
    expect(md).toContain("_Aucun._");
  });

  it("une section sans donnée l'affiche honnêtement plutôt que de l'omettre", () => {
    const empty = fullFixture();
    empty.weeks = [];
    const md = renderMarkdown(empty);
    expect(md).toContain("## 3. Semaines");
    expect(md).toMatch(/## 3\. Semaines[\s\S]*_Aucune donnée\._/);
  });
});

describe("export — JSON valide en sortie", () => {
  it("renderJson produit un JSON reparsable et conforme au schéma", () => {
    const json = renderJson(fullFixture());
    const parsed: unknown = JSON.parse(json);
    expect(() => exportDataSchema.parse(parsed)).not.toThrow();
  });
});

describe("export — aucun secret", () => {
  it("le Markdown et le JSON d'un export normal ne contiennent aucun nom de champ sensible", () => {
    const data = fullFixture();
    expect(findSensitiveFieldName(renderMarkdown(data))).toBeNull();
    expect(findSensitiveFieldName(renderJson(data))).toBeNull();
  });

  it("détecte un nom de champ sensible s'il apparaît dans le contenu", () => {
    expect(findSensitiveFieldName("...accessTokenEnc...")).toBe("accessTokenEnc");
    expect(findSensitiveFieldName("rien de sensible ici")).toBeNull();
  });
});

describe("export — CSV", () => {
  it("échappe les champs contenant une virgule ou un guillemet", () => {
    const data = fullFixture();
    data.activities![0]!.name = 'Sortie, "longue"';
    const files = buildCsvFiles(data);
    expect(files["activites.csv"]).toContain('"Sortie, ""longue"""');
  });

  it("produit un fichier par section fournie, aucun pour les sections absentes", () => {
    const data = fullFixture();
    data.health = null;
    const files = buildCsvFiles(data);
    expect(Object.keys(files)).toContain("activites.csv");
    expect(Object.keys(files)).not.toContain("sante.csv");
  });
});
