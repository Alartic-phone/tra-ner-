import { describe, expect, it } from "vitest";
import { buildMarkdownExport } from "./markdown.ts";
import { buildActivitiesCsv, buildHealthCsv, buildSplitsCsv, buildWeeksCsv } from "./csv.ts";
import { exportDataSchema, type ExportData } from "./schema.ts";

function fixture(): ExportData {
  const data: ExportData = {
    meta: {
      schemaVersion: "1.0.0",
      exportedAt: "2026-08-30",
      periodFrom: "2026-08-24",
      periodTo: "2026-08-30",
      scope: "7j",
      timezone: "Europe/Paris",
      counts: { activities: 1, healthDays: 7, weeks: 1 },
      notation: { estimated: "est.", unavailable: "non disponible" },
    },
    profile: {
      firstName: "Thomas",
      hrMax: 187,
      hrRest: 46,
      sex: "M",
      weightKg: 72,
      vma: 17.5,
      hrZones: [{ index: 1, name: "Récupération", fromBpm: 118, toBpm: 132 }],
      paceZones: [{ name: "Endurance", fromVmaPct: 0.6, toVmaPct: 0.7, fastestSPerKm: 240, slowestSPerKm: 280 }],
    },
    shifts: {
      cycleAnchorDay: "2026-08-26",
      blocks: [{ sequence: "MMAAANN", restDays: 9 }],
      days: [{ day: "2026-08-29", code: "M", label: "Matin", isException: false, isReplacement: false }],
      replacements: [],
    },
    weeks: [
      {
        weekStart: "2026-08-24",
        weekEnd: "2026-08-30",
        runKm: 24.68,
        rideKm: 0,
        sessions: 3,
        elevationM: 210,
        durationS: 7200,
        trimp: 320,
        ctlEnd: 42.1,
        atlEnd: 38.2,
        tsbEnd: 3.9,
        zonePct: { Z1: 10, Z2: 60 },
      },
    ],
    activities: [
      {
        id: "a1",
        day: "2026-08-29",
        name: "Sortie test",
        type: "Run",
        distanceM: 10710,
        movingTimeS: 3600,
        elevationGainM: 120,
        avgHr: 150,
        maxHr: 177,
        avgSpeedMps: 2.97,
        trimp: 85,
        trimpEstimated: true,
        gapPaceSPerKm: 330,
        gapEstimated: true,
        decouplingPct: 3.2,
        hasStreams: true,
        hasHeartrate: true,
      },
    ],
    activityDetails: [
      {
        activityId: "a1",
        splits: [{ index: 1, distanceM: 1000, movingTimeS: 295, avgHr: 150 }],
        laps: [{ index: 900, distanceM: 4030, movingTimeS: 1187, avgHr: 177, isManual: true }],
        zoneSecondsByZone: [200, 2000, 1000, 300, 100],
        bestEfforts: [{ durationS: 1200, distanceM: 4200 }],
      },
    ],
    health: Array.from({ length: 7 }, (_, i) => ({
      day: `2026-08-${24 + i}`,
      hrv: i === 3 ? null : 50 + i,
      restingHr: i === 3 ? null : 46 + i,
      sleepDurationMin: 420,
      sleepDeepMin: 90,
      sleepScore: 80,
      recoveryStatusPct: 70,
    })),
    records: [
      { label: "Plus longue sortie", value: 10.71, unit: "km", day: "2026-08-29", estimated: false },
      { label: "5 km", value: 1200, unit: "s/km", day: null, estimated: true },
    ],
    plan: {
      goal: {
        name: "Course cible",
        day: "2026-10-25",
        distanceM: 21097,
        targetTimeMinS: 6000,
        targetTimeMaxS: 6000,
      },
      workouts: [
        { day: "2026-08-29", title: "Endurance", type: "endurance", status: "done", targetDistanceM: 10000, targetDurationS: 3600, activityId: "a1" },
      ],
    },
    quality: {
      daysWithoutHealthMetric: 1,
      activitiesWithoutHr: 0,
      activitiesWithoutGps: 0,
      suspectedDuplicates: [],
      estimatedFields: ["trimp (Banister)"],
      periodsWithoutShift: [],
    },
  };
  return exportDataSchema.parse(data);
}

describe("buildMarkdownExport", () => {
  it("est déterministe : même entrée -> même sortie au caractère près", () => {
    const md1 = buildMarkdownExport(fixture());
    const md2 = buildMarkdownExport(fixture());
    expect(md1).toBe(md2);
  });

  it("contient les 10 sections dans l'ordre", () => {
    const md = buildMarkdownExport(fixture());
    const order = [
      "## 0. Métadonnées",
      "## 1. Profil et zones",
      "## 2. Postes",
      "## 3. Semaines",
      "## 4. Activités",
      "## 5. Détail des activités sélectionnées",
      "## 6. Santé quotidienne",
      "## 7. Records et meilleurs efforts",
      "## 8. Plan",
      "## 9. Qualité des données",
    ];
    let lastIndex = -1;
    for (const heading of order) {
      const index = md.indexOf(heading);
      expect(index, `section manquante : ${heading}`).toBeGreaterThan(-1);
      expect(index, `section dans le désordre : ${heading}`).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("marque les valeurs estimées et rend les absences comme 'non disponible', jamais 0", () => {
    const md = buildMarkdownExport(fixture());
    expect(md).toContain("(est.)");
    expect(md).toContain("non disponible");
    // Le jour sans VFC/FC repos (index 3 de la fixture) ne doit jamais apparaître comme "0".
    expect(md).not.toMatch(/2026-08-27 \| 0 \| 0/);
  });

  it("la section 9 (Qualité) n'est jamais vide", () => {
    const md = buildMarkdownExport(fixture());
    const start = md.indexOf("## 9. Qualité des données");
    const section = md.slice(start);
    expect(section.length).toBeGreaterThan("## 9. Qualité des données".length + 20);
  });

  it("ne contient aucun secret (jeton, clé, cookie de session)", () => {
    const md = buildMarkdownExport(fixture());
    for (const pattern of [/access_?token/i, /refresh_?token/i, /encryption_?key/i, /coach_session/i, /app_password/i]) {
      expect(md).not.toMatch(pattern);
    }
  });

  it("omet la section 6 (Santé quotidienne) quand aucune valeur n'existe sur la période", () => {
    // Cas normal depuis l'abandon de l'import COROS manuel : toute période
    // qui ne recoupe pas le bloc archivé (6-28 août 2026) n'a plus de
    // mesure du tout — mieux vaut ne pas montrer une section vide à chaque
    // export plutôt que la garder pour une fonctionnalité qui n'alimentera
    // plus jamais de nouvelle donnée.
    const data = fixture();
    data.health = data.health.map((h) => ({
      ...h,
      hrv: null,
      restingHr: null,
      sleepDurationMin: null,
      sleepDeepMin: null,
      sleepScore: null,
      recoveryStatusPct: null,
    }));
    const md = buildMarkdownExport(data);
    expect(md).not.toContain("## 6. Santé quotidienne");
    // Les sections voisines restent présentes, sans décalage de numérotation.
    expect(md).toContain("## 5. Détail des activités sélectionnées");
    expect(md).toContain("## 7. Records et meilleurs efforts");
  });

  it("garde la section 6 dès qu'au moins un jour de la période a une valeur", () => {
    const data = fixture();
    data.health = data.health.map((h, i) => (i === 0 ? h : { ...h, hrv: null, restingHr: null, sleepDurationMin: null, sleepDeepMin: null, sleepScore: null, recoveryStatusPct: null }));
    const md = buildMarkdownExport(data);
    expect(md).toContain("## 6. Santé quotidienne");
  });
});

describe("CSV builders", () => {
  it("activites.csv a des en-têtes sans accent et une ligne par activité", () => {
    const csv = buildActivitiesCsv(fixture());
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("day,name,type,distance_m,moving_time_s,elevation_gain_m,avg_hr,max_hr,trimp,gap_pace_s_per_km,decoupling_pct");
    expect(lines).toHaveLength(2);
  });

  it("échappe les valeurs contenant une virgule", () => {
    const data = fixture();
    data.activities[0]!.name = "Sortie, avec virgule";
    const csv = buildActivitiesCsv(data);
    expect(csv).toContain('"Sortie, avec virgule"');
  });

  it("sante.csv contient une ligne par jour, y compris les jours sans mesure", () => {
    const csv = buildHealthCsv(fixture());
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(8); // en-tête + 7 jours
  });

  it("semaines.csv et splits.csv se construisent sans erreur sur la fixture", () => {
    expect(() => buildWeeksCsv(fixture())).not.toThrow();
    expect(() => buildSplitsCsv(fixture())).not.toThrow();
  });
});
