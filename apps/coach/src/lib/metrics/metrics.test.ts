import { describe, expect, it } from "vitest";
import {
  banisterWeight,
  heartRateReserveFraction,
  isEstimated,
  trimpFromAverage,
  trimpFromRpe,
  trimpFromStream,
  type HeartRateProfile,
} from "./trimp.ts";
import {
  acwrZone,
  computeAcwr,
  computeFitnessSeries,
  computeFoster,
  toDailyLoads,
  type DailyLoad,
} from "./load.ts";
import {
  computeHeartRateZones,
  computePaceZones,
  estimateVmaFromRace,
  paceAtVmaPercent,
  timeInZones,
  zoneForHeartRate,
} from "./zones.ts";
import { computeGap, gradeFactor, minettiCost, smoothAltitude } from "./gap.ts";
import { computeDecoupling, decouplingVerdict } from "./decoupling.ts";
import { computeReadiness, findLatestReadinessMeasurement, meanAndStdDev } from "./readiness.ts";
import {
  buildPrediction,
  classifyTrajectory,
  computeCriticalSpeed,
  danielsPaces,
  estimatesForDistance,
  fitRiegelExponent,
  fractionOfVo2Max,
  isCriticalSpeedInDomain,
  isPlausiblePrediction,
  predictTimeFromCriticalSpeed,
  predictTimeFromVdot,
  riegel,
  vdotFromRace,
  velocityAtVo2,
  vo2AtVelocity,
} from "./prediction.ts";
import {
  bestDistanceForDurations,
  bestTimeForDistances,
  detectPersonalRecords,
  mergeBestEfforts,
} from "./best-efforts.ts";
import { computeWeekStreak } from "./streak.ts";
import { computeSportVolume } from "./volume.ts";
import { longestRunProgression } from "./records.ts";

const MAN: HeartRateProfile = { hrMax: 190, hrRest: 50, sex: "M" };

// ---------------------------------------------------------------------------

describe("TRIMP de Banister", () => {
  it("calcule la fraction de réserve cardiaque de Karvonen", () => {
    // (155 - 50) / (190 - 50) = 0,75
    expect(heartRateReserveFraction(155, MAN)).toBeCloseTo(0.75, 6);
    expect(heartRateReserveFraction(50, MAN)).toBe(0);
    expect(heartRateReserveFraction(190, MAN)).toBe(1);
  });

  it("borne la fraction pour ne pas emballer l'exponentielle", () => {
    // Une FC au-dessus du maximum déclaré ne doit pas produire un TRIMP absurde.
    expect(heartRateReserveFraction(210, MAN)).toBe(1);
    expect(heartRateReserveFraction(30, MAN)).toBe(0);
  });

  it("applique des coefficients différents selon le sexe", () => {
    // Y = 0,64 · e^(1,92 × 0,75) = 0,64 × 4,2207 = 2,7013
    expect(banisterWeight(0.75, "M")).toBeCloseTo(2.7013, 3);
    // Y = 0,86 · e^(1,67 × 0,75) = 0,86 × 3,4991 = 3,0092
    expect(banisterWeight(0.75, "F")).toBeCloseTo(3.0092, 3);
  });

  it("retrouve la valeur de référence d'une heure à 75 % de réserve", () => {
    // TRIMP = 60 min × 0,75 × 2,7013 = 121,6
    expect(trimpFromAverage(155, 3600, MAN)).toBeCloseTo(121.56, 1);
  });

  it("calcule le TRIMP seconde par seconde", () => {
    const time = Array.from({ length: 3601 }, (_, i) => i);
    const heartrate = time.map(() => 155);
    const result = trimpFromStream(heartrate, time, MAN);
    expect(result).not.toBeNull();
    expect(result!.trimp).toBeCloseTo(121.56, 0);
    expect(result!.coveredSeconds).toBe(3600);
  });

  it("majore la charge d'un fractionné par rapport à sa FC moyenne", () => {
    // Même FC moyenne (155), mais alternance 130/180 : la pondération étant
    // convexe, la charge réelle doit être supérieure.
    const time = Array.from({ length: 3601 }, (_, i) => i);
    const alternating = time.map((t) => (Math.floor(t / 120) % 2 === 0 ? 130 : 180));
    const interval = trimpFromStream(alternating, time, MAN)!;
    const steady = trimpFromStream(time.map(() => 155), time, MAN)!;
    expect(interval.trimp).toBeGreaterThan(steady.trimp);
  });

  it("ignore les mesures absentes sans les interpoler", () => {
    const time = Array.from({ length: 1201 }, (_, i) => i);
    const heartrate = time.map((t) => (t < 600 ? 155 : null));
    const result = trimpFromStream(heartrate, time, MAN)!;
    expect(result.coveredSeconds).toBe(599);
    expect(result.trimp).toBeCloseTo(20.2, 0);
  });

  it("exclut les pauses de plus d'une minute", () => {
    // Deux blocs de 10 minutes séparés par une interruption d'une heure.
    const time = [
      ...Array.from({ length: 601 }, (_, i) => i),
      ...Array.from({ length: 601 }, (_, i) => i + 4200),
    ];
    const heartrate = time.map(() => 155);
    const result = trimpFromStream(heartrate, time, MAN)!;
    expect(result.coveredSeconds).toBe(1200);
  });

  it("retourne null quand aucune donnée n'est exploitable", () => {
    expect(trimpFromStream([], [], MAN)).toBeNull();
    expect(trimpFromStream([null, null], [0, 1], MAN)).toBeNull();
  });

  it("fournit un repli RPE et le signale comme estimé", () => {
    // RPE 5 pendant une heure : 5 × 60 × 0,3 = 90
    expect(trimpFromRpe(5, 3600)).toBeCloseTo(90, 6);
    expect(isEstimated("rpe_foster")).toBe(true);
    expect(isEstimated("banister_stream")).toBe(true);
    expect(isEstimated("coros_native")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("CTL, ATL et TSB", () => {
  const constantLoad = (days: number, load: number): DailyLoad[] =>
    Array.from({ length: days }, (_, i) => ({
      day: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      load,
    }));

  it("converge vers la charge quotidienne à charge constante", () => {
    const series = computeFitnessSeries(constantLoad(400, 50));
    const last = series[series.length - 1]!;
    expect(last.ctl).toBeCloseTo(50, 1);
    expect(last.atl).toBeCloseTo(50, 1);
    expect(last.tsb).toBeCloseTo(0, 1);
  });

  it("fait monter la fatigue plus vite que la condition physique", () => {
    const series = computeFitnessSeries(constantLoad(14, 100));
    const day14 = series[13]!;
    expect(day14.atl).toBeGreaterThan(day14.ctl);
    // À charge soutenue, la forme est donc négative : c'est attendu.
    expect(day14.tsb).toBeLessThan(0);
  });

  it("fait remonter la forme pendant une phase d'affûtage", () => {
    const build = constantLoad(60, 80);
    const taper = Array.from({ length: 14 }, (_, i) => ({
      day: new Date(Date.UTC(2026, 2, 2 + i)).toISOString().slice(0, 10),
      load: 20,
    }));
    const series = computeFitnessSeries([...build, ...taper]);
    const end = series[series.length - 1]!;
    expect(end.tsb).toBeGreaterThan(0);
    expect(end.atl).toBeLessThan(end.ctl);
  });

  it("remplit les jours sans entraînement avec une charge nulle", () => {
    const sparse: DailyLoad[] = [
      { day: "2026-01-01", load: 100 },
      { day: "2026-01-10", load: 100 },
    ];
    const series = computeFitnessSeries(sparse);
    expect(series).toHaveLength(10);
    expect(series[4]!.load).toBe(0);
    // La fatigue décroît pendant la coupure.
    expect(series[8]!.atl).toBeLessThan(series[0]!.atl);
  });

  it("marque comme non fiables les 42 premiers jours", () => {
    const series = computeFitnessSeries(constantLoad(60, 50));
    expect(series[0]!.reliable).toBe(false);
    expect(series[41]!.reliable).toBe(false);
    expect(series[42]!.reliable).toBe(true);
  });

  it("applique correctement la récurrence exponentielle", () => {
    // Un seul jour à 42 de charge : CTL = 0 + (42 - 0)/42 = 1
    const series = computeFitnessSeries([{ day: "2026-01-01", load: 42 }]);
    expect(series[0]!.ctl).toBeCloseTo(1, 6);
    expect(series[0]!.atl).toBeCloseTo(6, 6);
  });
});

// ---------------------------------------------------------------------------

describe("ratio aigu/chronique", () => {
  const uniform = (load: number): DailyLoad[] =>
    Array.from({ length: 28 }, (_, i) => ({
      day: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      load,
    }));

  it("vaut 1 quand la charge est stable", () => {
    const acwr = computeAcwr(uniform(50), "2026-01-28");
    expect(acwr.ratio).toBeCloseTo(1, 6);
    expect(acwr.zone).toBe("optimale");
  });

  it("compare bien des moyennes quotidiennes, pas des sommes", () => {
    // Une comparaison de sommes donnerait mécaniquement 7/28 = 0,25.
    const acwr = computeAcwr(uniform(50), "2026-01-28");
    expect(acwr.acute).toBeCloseTo(50, 6);
    expect(acwr.chronic).toBeCloseTo(50, 6);
  });

  it("détecte une progression trop brutale", () => {
    const loads = uniform(30);
    for (let i = 21; i < 28; i++) loads[i]!.load = 90;
    const acwr = computeAcwr(loads, "2026-01-28");
    // aigu = 90 ; chronique = (21×30 + 7×90)/28 = 45
    expect(acwr.ratio).toBeCloseTo(2, 6);
    expect(acwr.zone).toBe("alerte");
  });

  it("classe correctement les zones", () => {
    expect(acwrZone(0.7)).toBe("sous-charge");
    expect(acwrZone(0.8)).toBe("optimale");
    expect(acwrZone(1.3)).toBe("optimale");
    expect(acwrZone(1.4)).toBe("prudence");
    expect(acwrZone(1.51)).toBe("alerte");
    expect(acwrZone(null)).toBe("indeterminee");
  });

  it("ne renvoie pas de ratio quand la charge chronique est nulle", () => {
    const acwr = computeAcwr(uniform(0), "2026-01-28");
    expect(acwr.ratio).toBeNull();
    expect(acwr.zone).toBe("indeterminee");
  });

  it("CTL et ratio aigu/chronique restent cohérents entre eux : même source, même fenêtre", () => {
    // Reproduit la construction de loadFitnessSnapshot (repository.ts) : CTL
    // et ACWR sont dérivés du même tableau `loads`. Avec un entraînement
    // continu jusqu'à la veille du jour observé, une CTL substantielle ne
    // peut pas coexister avec un ratio strictement nul — sans quoi la carte
    // « État de forme » du tableau de bord afficherait deux nombres
    // incohérents pour la même fenêtre, comme observé (CTL 53, ratio 0,00).
    const loads = uniform(60);
    const series = computeFitnessSeries(loads);
    const current = series[series.length - 1]!;
    const acwr = computeAcwr(loads, "2026-01-28");
    expect(current.ctl).toBeGreaterThan(20);
    expect(acwr.ratio).not.toBeNull();
    expect(acwr.ratio).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe("monotonie et contrainte de Foster", () => {
  const week = (loads: number[]): DailyLoad[] =>
    loads.map((load, i) => ({
      day: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      load,
    }));

  it("calcule la monotonie comme moyenne divisée par écart-type", () => {
    // Charges : 50 ×5 puis 0 ×2. Moyenne = 250/7 = 35,7143.
    // Variance de population = (5×14,2857² + 2×35,7143²)/7 = 510,204
    // Écart-type = 22,5877 -> monotonie = 35,7143 / 22,5877 = 1,5811
    const loads = week([50, 50, 50, 50, 50, 0, 0]);
    const foster = computeFoster(loads, "2026-01-07");
    expect(foster.weeklyLoad).toBe(250);
    expect(foster.monotony).toBeCloseTo(1.5811, 3);
    expect(foster.strain).toBeCloseTo(395.28, 1);
  });

  it("pénalise une semaine sans aucun jour de repos", () => {
    const contrasted = computeFoster(week([70, 0, 70, 0, 70, 0, 70]), "2026-01-07");
    const flat = computeFoster(week([40, 40, 40, 40, 40, 40, 40]), "2026-01-07");
    // Charge hebdomadaire proche (280 contre 280), mais monotonie opposée.
    expect(contrasted.weeklyLoad).toBe(280);
    expect(flat.weeklyLoad).toBe(280);
    expect(flat.monotony).toBeNull(); // Écart-type nul : monotonie indéfinie.
    // Moyenne 40, écart-type de population 34,641 -> monotonie 1,1547.
    expect(contrasted.monotony).toBeCloseTo(1.1547, 3);
  });

  it("signale une monotonie au-dessus du seuil de 2", () => {
    // Six jours identiques et un jour légèrement plus léger.
    const foster = computeFoster(week([50, 50, 50, 50, 50, 50, 40]), "2026-01-07");
    expect(foster.monotony).toBeGreaterThan(2);
    expect(foster.monotonyWarning).toBe(true);
  });

  it("compte bien les jours de repos comme charge nulle", () => {
    const withRest = computeFoster(week([100, 0, 0, 0, 0, 0, 0]), "2026-01-07");
    expect(withRest.weeklyLoad).toBe(100);
    expect(withRest.monotony).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------

describe("agrégation des charges quotidiennes", () => {
  it("additionne plusieurs séances d'un même jour et comble les jours vides", () => {
    const loads = toDailyLoads(
      [
        { day: "2026-01-02", load: 40 },
        { day: "2026-01-02", load: 25 },
        { day: "2026-01-04", load: 80 },
        { day: "2026-01-05", load: null },
      ],
      "2026-01-01",
      "2026-01-05",
    );
    expect(loads).toHaveLength(5);
    expect(loads[0]!.load).toBe(0);
    expect(loads[1]!.load).toBe(65);
    expect(loads[3]!.load).toBe(80);
    expect(loads[4]!.load).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("zones de fréquence cardiaque (Karvonen)", () => {
  const zones = computeHeartRateZones(190, 50);

  it("produit cinq zones sur la réserve cardiaque", () => {
    expect(zones).toHaveLength(5);
    // Réserve = 140. Zone 2 : 50 + 0,6×140 = 134 à 50 + 0,7×140 = 148.
    expect(zones[1]!.fromBpm).toBe(134);
    expect(zones[1]!.toBpm).toBe(148);
    // Zone 4 : 162 à 176.
    expect(zones[3]!.fromBpm).toBe(162);
    expect(zones[3]!.toBpm).toBe(176);
    expect(zones[4]!.toBpm).toBe(190);
  });

  it("distingue deux coureurs de FC de repos différentes", () => {
    // Même FC max, FC de repos différente : 150 bpm n'est pas la même
    // intensité relative pour les deux.
    const trained = computeHeartRateZones(190, 40);
    const untrained = computeHeartRateZones(190, 70);
    expect(zoneForHeartRate(150, trained)!.index).toBe(3);
    expect(zoneForHeartRate(150, untrained)!.index).toBe(2);
  });

  it("classe une fréquence dans la bonne zone", () => {
    // 120 bpm est exactement la borne basse de la zone 1 : il y appartient.
    expect(zoneForHeartRate(120, zones)!.index).toBe(1);
    expect(zoneForHeartRate(110, zones)).toBeNull(); // Sous la zone 1.
    expect(zoneForHeartRate(140, zones)!.index).toBe(2);
    expect(zoneForHeartRate(200, zones)!.index).toBe(5);
  });

  it("répartit le temps par zone et isole le temps non mesuré", () => {
    const time = Array.from({ length: 601 }, (_, i) => i);
    const heartrate = time.map((t) => (t < 300 ? 140 : t < 500 ? 170 : null));
    const result = timeInZones(heartrate, time, zones);
    expect(result.byZone.get(2)).toBe(299);
    expect(result.byZone.get(4)).toBe(200);
    expect(result.unmeasured).toBe(101);
  });
});

// ---------------------------------------------------------------------------

describe("zones d'allure", () => {
  it("dérive les allures d'une VMA de 16 km/h", () => {
    // Endurance fondamentale, 60-70 % : 9,6 à 11,2 km/h,
    // soit 6'25"/km à 5'21"/km.
    const zones = computePaceZones(16);
    const endurance = zones[1]!;
    expect(endurance.slowestSPerKm).toBeCloseTo(375, 0);
    expect(endurance.fastestSPerKm).toBeCloseTo(321.4, 0);
  });

  it("convertit un pourcentage de VMA en allure", () => {
    // 100 % de 16 km/h = 3'45"/km
    expect(paceAtVmaPercent(16, 1)).toBeCloseTo(225, 6);
    // 85 % de 16 km/h = 13,6 km/h = 4'24,7"/km
    expect(paceAtVmaPercent(16, 0.85)).toBeCloseTo(264.7, 1);
  });

  it("estime une VMA plafonnée sur un effort court", () => {
    // 1500 m en 5 min = 18 km/h, tenu ~6 min : proche de la VMA.
    const vma = estimateVmaFromRace(1500, 300)!;
    expect(vma).toBeCloseTo(18, 1);
  });

  it("applique un abattement croissant avec la durée", () => {
    // 10 km en 45 min = 13,33 km/h, soutenu à ~87 % de VMA.
    const vma = estimateVmaFromRace(10000, 2700)!;
    expect(vma).toBeCloseTo(15.3, 0);
    expect(vma).toBeGreaterThan(13.33);
  });
});

// ---------------------------------------------------------------------------

describe("allure ajustée du dénivelé (Minetti)", () => {
  it("retrouve le coût de référence sur le plat", () => {
    expect(minettiCost(0)).toBeCloseTo(3.6, 6);
    expect(gradeFactor(0)).toBeCloseTo(1, 6);
  });

  it("renchérit la montée", () => {
    // 5 % de pente : environ 30 % de coût en plus.
    expect(gradeFactor(0.05)).toBeCloseTo(1.301, 2);
    expect(gradeFactor(0.1)).toBeGreaterThan(1.5);
  });

  it("retrouve le minimum de coût vers −20 % de pente", () => {
    // La courbe de Minetti atteint son minimum autour de −20 %,
    // à environ 1,8 J/kg/m — la descente cesse d'être « gratuite » au-delà.
    expect(minettiCost(-0.2)).toBeCloseTo(1.8, 1);
    expect(minettiCost(-0.2)).toBeLessThan(minettiCost(-0.1));
    expect(minettiCost(-0.2)).toBeLessThan(minettiCost(-0.35));
  });

  it("borne la pente au domaine de validité du polynôme", () => {
    expect(minettiCost(0.9)).toBeCloseTo(minettiCost(0.45), 6);
    expect(minettiCost(-0.9)).toBeCloseTo(minettiCost(-0.45), 6);
  });

  it("lisse le bruit altimétrique du GPS", () => {
    const noisy = [100, 103, 98, 101, 99, 102, 100, 101, 99, 100];
    const smoothed = smoothAltitude(noisy, 5);
    const spread = (a: Array<number | null>) => {
      const v = a.filter((x): x is number => x != null);
      return Math.max(...v) - Math.min(...v);
    };
    expect(spread(smoothed)).toBeLessThan(spread(noisy));
  });

  it("rend une allure ajustée plus rapide que l'allure réelle en montée", () => {
    // 3 km à vitesse constante, 5 % de pente régulière.
    const time = Array.from({ length: 901 }, (_, i) => i);
    const distance = time.map((t) => t * 3.33);
    const altitude = distance.map((d) => 100 + d * 0.05);
    const gap = computeGap(distance, altitude, time)!;
    expect(gap.actualSPerKm).toBeCloseTo(300, 0);
    expect(gap.gapSPerKm).toBeLessThan(gap.actualSPerKm);
    // Le lissage altimétrique aplatit les tout premiers et derniers mètres,
    // ce qui laisse un écart de l'ordre du pour cent avec la valeur théorique.
    expect(Math.abs(gap.gapSPerKm - 300 / gradeFactor(0.05))).toBeLessThan(3);
    expect(gap.estimated).toBe(true);
  });

  it("laisse l'allure inchangée sur le plat", () => {
    const time = Array.from({ length: 901 }, (_, i) => i);
    const distance = time.map((t) => t * 3.33);
    const altitude = distance.map(() => 100);
    const gap = computeGap(distance, altitude, time)!;
    expect(gap.gapSPerKm).toBeCloseTo(gap.actualSPerKm, 0);
  });

  it("retourne null sans données exploitables", () => {
    expect(computeGap([], [], [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("découplage cardiaque", () => {
  const build = (
    seconds: number,
    speedOf: (t: number) => number,
    hrOf: (t: number) => number,
  ) => {
    const time = Array.from({ length: seconds + 1 }, (_, i) => i);
    return {
      time,
      speed: time.map(speedOf),
      heartrate: time.map(hrOf),
    };
  };

  it("ne détecte aucun découplage à rendement stable", () => {
    const { time, speed, heartrate } = build(5400, () => 3.3, () => 150);
    const result = computeDecoupling(speed, heartrate, time)!;
    expect(result.decouplingPct).toBeCloseTo(0, 3);
  });

  it("détecte une dérive cardiaque à vitesse constante", () => {
    // FC qui monte de 145 à 170 sur 90 minutes, à vitesse identique.
    const { time, speed, heartrate } = build(
      5400,
      () => 3.3,
      (t) => 145 + (t / 5400) * 25,
    );
    const result = computeDecoupling(speed, heartrate, time)!;
    expect(result.decouplingPct).toBeGreaterThan(5);
    expect(decouplingVerdict(result.decouplingPct)).not.toBe("bon");

    // Une dérive plus modeste (15 bpm) reste sous le seuil de 5 % : le
    // verdict doit rester bon, sans alarmisme.
    const mild = build(5400, () => 3.3, (t) => 145 + (t / 5400) * 15);
    const mildResult = computeDecoupling(mild.speed, mild.heartrate, mild.time)!;
    expect(mildResult.decouplingPct).toBeGreaterThan(4);
    expect(decouplingVerdict(mildResult.decouplingPct)).toBe("bon");
  });

  it("refuse de se prononcer sur un effort trop court", () => {
    const { time, speed, heartrate } = build(1500, () => 3.3, () => 150);
    expect(computeDecoupling(speed, heartrate, time)).toBeNull();
  });

  it("écarte l'échauffement du calcul", () => {
    // FC basse au départ : sans exclusion, le rendement initial serait
    // artificiellement excellent et le découplage surestimé.
    const { time, speed, heartrate } = build(
      5400,
      () => 3.3,
      (t) => (t < 600 ? 110 : 150),
    );
    const result = computeDecoupling(speed, heartrate, time)!;
    expect(result.decouplingPct).toBeCloseTo(0, 3);
  });

  it("classe le verdict selon les seuils usuels", () => {
    expect(decouplingVerdict(3)).toBe("bon");
    expect(decouplingVerdict(7)).toBe("correct");
    expect(decouplingVerdict(12)).toBe("eleve");
  });
});

// ---------------------------------------------------------------------------

describe("Riegel", () => {
  it("extrapole un 10 km depuis un 5 km", () => {
    // 20 min sur 5 km -> 1200 × 2^1,06 = 2501,9 s, soit 41 min 42 s
    expect(riegel(5000, 1200, 10000)).toBeCloseTo(2501.9, 1);
  });

  it("interpole vers une distance plus courte", () => {
    expect(riegel(10000, 2501.9, 5000)).toBeCloseTo(1200, 0);
  });

  it("ajuste l'exposant sur deux performances réelles", () => {
    // Un coureur endurant : 5 km en 20 min et 10 km en 41 min.
    const b = fitRiegelExponent(
      { distanceM: 5000, timeS: 1200 },
      { distanceM: 10000, timeS: 2460 },
    )!;
    expect(b).toBeCloseTo(1.036, 2);
    expect(b).toBeLessThan(1.06);
  });

  it("refuse d'ajuster sur deux distances trop proches", () => {
    expect(
      fitRiegelExponent(
        { distanceM: 5000, timeS: 1200 },
        { distanceM: 5100, timeS: 1225 },
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("VDOT de Daniels", () => {
  it("retrouve la valeur publiée pour 5 000 m en 20 min", () => {
    // Table de Daniels : 5 km en 20:00 correspond à VDOT 49,8.
    expect(vdotFromRace(5000, 1200)).toBeCloseTo(49.8, 1);
  });

  it("retrouve la valeur publiée pour 10 000 m en 40 min", () => {
    // Table de Daniels : 10 km en 40:03 correspond à VDOT 52.
    // Même vitesse que 5 km en 20:00, mais tenue deux fois plus longtemps :
    // le VDOT doit donc être nettement supérieur aux 49,8 de ce 5 km.
    expect(vdotFromRace(10000, 2400)).toBeCloseTo(52, 0);
    expect(vdotFromRace(10000, 2400)!).toBeGreaterThan(vdotFromRace(5000, 1200)!);
  });

  it("applique le polynôme de consommation d'oxygène", () => {
    // v = 250 m/min : VO2 = -4,60 + 45,5645 + 6,50 = 47,46
    expect(vo2AtVelocity(250)).toBeCloseTo(47.46, 2);
  });

  it("inverse correctement le polynôme", () => {
    expect(velocityAtVo2(vo2AtVelocity(250))).toBeCloseTo(250, 3);
  });

  it("décroît la fraction de VO2max soutenable avec la durée", () => {
    expect(fractionOfVo2Max(6)).toBeGreaterThan(fractionOfVo2Max(30));
    expect(fractionOfVo2Max(30)).toBeGreaterThan(fractionOfVo2Max(120));
    // Environ 95 % à 20 minutes d'effort.
    expect(fractionOfVo2Max(20)).toBeCloseTo(0.953, 2);
  });

  it("retrouve les allures d'entraînement publiées pour VDOT 50", () => {
    const paces = danielsPaces(50);
    // Table de Daniels, VDOT 50 : seuil 4'15"/km, intervalles ~3'54"/km.
    expect(paces.thresholdSPerKm).toBeCloseTo(255, 0);
    expect(paces.intervalSPerKm).toBeCloseTo(234, 0);
    expect(paces.marathonSPerKm).toBeGreaterThan(paces.thresholdSPerKm);
    expect(paces.easySlowSPerKm).toBeGreaterThan(paces.easyFastSPerKm);
    expect(paces.repetitionSPerKm).toBeLessThan(paces.intervalSPerKm);
  });

  it("prédit un chrono cohérent avec le VDOT dont il est issu", () => {
    const vdot = vdotFromRace(5000, 1200)!;
    expect(predictTimeFromVdot(vdot, 5000)).toBeCloseTo(1200, 0);
    // Extrapolation sur 10 km : cohérente avec l'ordre de grandeur de Riegel.
    const tenK = predictTimeFromVdot(vdot, 10000)!;
    expect(tenK).toBeGreaterThan(2400);
    expect(tenK).toBeLessThan(2600);
  });
});

// ---------------------------------------------------------------------------

describe("vitesse critique", () => {
  it("retrouve les paramètres d'un jeu de données synthétique", () => {
    // d = 4,5·t + 150 : vitesse critique 4,5 m/s, réserve 150 m.
    const efforts = [180, 300, 600, 900, 1200].map((t) => ({
      durationS: t,
      distanceM: 4.5 * t + 150,
    }));
    const cs = computeCriticalSpeed(efforts)!;
    expect(cs.csMps).toBeCloseTo(4.5, 6);
    expect(cs.dPrimeM).toBeCloseTo(150, 4);
    expect(cs.r2).toBeCloseTo(1, 6);
    expect(cs.sampleCount).toBe(5);
  });

  it("écarte les efforts trop courts, dominés par l'anaérobie", () => {
    const efforts = [
      { durationS: 30, distanceM: 250 },
      { durationS: 180, distanceM: 960 },
      { durationS: 600, distanceM: 2850 },
      { durationS: 1200, distanceM: 5550 },
    ];
    const cs = computeCriticalSpeed(efforts)!;
    expect(cs.sampleCount).toBe(3);
  });

  it("refuse de conclure avec moins de trois points", () => {
    expect(
      computeCriticalSpeed([
        { durationS: 300, distanceM: 1500 },
        { durationS: 600, distanceM: 2900 },
      ]),
    ).toBeNull();
  });

  it("prédit un chrono à partir du modèle", () => {
    const cs = { csMps: 4.5, dPrimeM: 150, r2: 1, sampleCount: 5, maxSampleDurationS: 1800 };
    // (10000 - 150) / 4,5 = 2188,9 s
    expect(predictTimeFromCriticalSpeed(cs, 10000)).toBeCloseTo(2188.9, 0);
  });

  it("retient la durée du plus long effort réellement utilisé, pas la borne déclarée", () => {
    // Domaine déclaré jusqu'à 30 min, mais aucun effort de référence ne
    // dépasse 20 min ici : le plus long RÉELLEMENT utilisé doit être retenu.
    const efforts = [180, 300, 600, 900, 1200].map((t) => ({
      durationS: t,
      distanceM: 4.5 * t + 150,
    }));
    const cs = computeCriticalSpeed(efforts)!;
    expect(cs.maxSampleDurationS).toBe(1200);
  });

  it("référence : projette le marathon hors du domaine d'un modèle basé sur 2-30 min", () => {
    // 5'09/km, R² 0,999, 5 efforts — reproduit le cas signalé (projection
    // marathon en 3:36:59 malgré un domaine de validité de 2 à 30 minutes).
    const csMps = 1000 / (5 * 60 + 9);
    const cs = {
      csMps,
      dPrimeM: 120,
      r2: 0.999,
      sampleCount: 5,
      maxSampleDurationS: 1800, // 30 minutes, le plus long effort de référence
    };
    const marathonTimeS = predictTimeFromCriticalSpeed(cs, 42195)!;
    expect(marathonTimeS).toBeGreaterThan(3 * 3600); // largement > 2×30 min
    expect(isCriticalSpeedInDomain(marathonTimeS, cs)).toBe(false);

    // Un 10 km projeté reste dans le domaine (proche de la durée de référence).
    const tenKTimeS = predictTimeFromCriticalSpeed(cs, 10000)!;
    expect(isCriticalSpeedInDomain(tenKTimeS, cs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("synthèse des prédictions", () => {
  it("renvoie une fourchette et non un chiffre unique", () => {
    const p = buildPrediction(
      10000,
      [
        { source: "riegel", timeS: 2500 },
        { source: "vdot", timeS: 2460 },
        { source: "vitesse_critique", timeS: 2520 },
      ],
      { sourceAgeDays: 20, sampleCount: 5 },
    )!;
    expect(p.medianTimeS).toBe(2500);
    expect(p.fastestTimeS).toBeLessThan(p.medianTimeS);
    expect(p.slowestTimeS).toBeGreaterThan(p.medianTimeS);
    expect(p.bySource).toHaveLength(3);
  });

  it("accorde une confiance élevée à des modèles concordants et récents", () => {
    const p = buildPrediction(
      10000,
      [
        { source: "riegel", timeS: 2500 },
        { source: "vdot", timeS: 2490 },
        { source: "vitesse_critique", timeS: 2510 },
      ],
      { sourceAgeDays: 15, sampleCount: 6 },
    )!;
    expect(p.confidence).toBeGreaterThan(0.9);
    expect(p.confidenceNotes).toEqual([]);
  });

  it("dégrade la confiance sur des données anciennes", () => {
    const recent = buildPrediction(
      10000,
      [
        { source: "riegel", timeS: 2500 },
        { source: "vdot", timeS: 2490 },
        { source: "vitesse_critique", timeS: 2510 },
      ],
      { sourceAgeDays: 15, sampleCount: 6 },
    )!;
    const old = buildPrediction(
      10000,
      [
        { source: "riegel", timeS: 2500 },
        { source: "vdot", timeS: 2490 },
        { source: "vitesse_critique", timeS: 2510 },
      ],
      { sourceAgeDays: 300, sampleCount: 6 },
    )!;
    expect(old.confidence).toBeLessThan(recent.confidence);
    expect(old.confidenceNotes.some((n) => n.includes("mois"))).toBe(true);
    // Une confiance plus faible élargit la fourchette affichée.
    expect(old.slowestTimeS - old.fastestTimeS).toBeGreaterThan(
      recent.slowestTimeS - recent.fastestTimeS,
    );
  });

  it("dégrade la confiance quand les modèles divergent", () => {
    const p = buildPrediction(
      42195,
      [
        { source: "riegel", timeS: 12000 },
        { source: "vdot", timeS: 14000 },
      ],
      { sourceAgeDays: 20, sampleCount: 4 },
    )!;
    expect(p.confidence).toBeLessThan(0.7);
    expect(p.confidenceNotes.some((n) => n.includes("divergent"))).toBe(true);
  });

  it("un seul modèle plausible ne suffit plus : la prédiction devient non disponible", () => {
    // Avant le garde-fou de plausibilité, un modèle unique produisait quand
    // même une fourchette (confiance dégradée). Le garde-fou est plus
    // strict : moins de deux modèles retenus, pas de prédiction du tout.
    const p = buildPrediction(
      10000,
      [
        { source: "riegel", timeS: 2500 },
        { source: "vdot", timeS: null },
      ],
      { sourceAgeDays: 10, sampleCount: 5 },
    );
    expect(p).toBeNull();
  });

  describe("garde-fou de plausibilité (allure entre 3'00 et 12'00/km)", () => {
    it("classe correctement les bornes du domaine", () => {
      // 12 km en 1 h -> 5'00/km : plausible.
      expect(isPlausiblePrediction(3600, 12000)).toBe(true);
      // 12 km en 7 h 13 -> largement hors domaine.
      expect(isPlausiblePrediction(7 * 3600 + 13 * 60, 12000)).toBe(false);
      // Juste sous 3'00/km et juste au-dessus de 12'00/km : exclus.
      expect(isPlausiblePrediction(179 * 12, 12000)).toBe(false);
      expect(isPlausiblePrediction(721 * 12, 12000)).toBe(false);
    });

    it("référence : reproduit le cas signalé — un modèle à 7h13 pollue une prédiction sur 12 km", () => {
      // Riegel et VDOT sont sains (~1h04, cohérent avec le chrono visé du
      // profil), la vitesse critique dérape à 7h13 (confusion probable
      // d'unité en amont). Sans garde-fou, la médiane à trois modèles
      // serait tirée vers le haut et la fourchette irait jusqu'à 14h00.
      const p = buildPrediction(
        12000,
        [
          { source: "riegel", timeS: 3847 }, // 1h04m07s
          { source: "vdot", timeS: 3840 }, // 1h04m00s
          { source: "vitesse_critique", timeS: 7 * 3600 + 13 * 60 }, // 7h13 : hors domaine
        ],
        { sourceAgeDays: 20, sampleCount: 6 },
      )!;
      expect(p).not.toBeNull();
      expect(p.bySource).toHaveLength(2);
      expect(p.bySource.every((e) => e.source !== "vitesse_critique")).toBe(true);
      expect(p.excluded).toHaveLength(1);
      expect(p.excluded[0]!.source).toBe("vitesse_critique");
      // La fourchette reste sur les deux modèles sains, jamais étirée
      // jusqu'à 14h00 par le modèle aberrant.
      expect(p.slowestTimeS).toBeLessThan(4200); // < 1 h 10
      expect(p.confidenceNotes.some((n) => n.includes("hors du domaine"))).toBe(true);
    });

    it("sans garde-fou disponible (un seul modèle plausible), la prédiction est retirée plutôt que faussée", () => {
      const p = buildPrediction(
        12000,
        [
          { source: "riegel", timeS: 3847 },
          { source: "vdot", timeS: 7 * 3600 },
          { source: "vitesse_critique", timeS: 14 * 3600 },
        ],
        { sourceAgeDays: 20, sampleCount: 6 },
      );
      expect(p).toBeNull();
    });
  });

  it("ne prédit rien sans aucune estimation valide", () => {
    expect(
      buildPrediction(10000, [{ source: "riegel", timeS: null }], {
        sourceAgeDays: 10,
        sampleCount: 0,
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("estimatesForDistance", () => {
  it("renvoie trois estimations à null sans aucun effort de référence", () => {
    const estimates = estimatesForDistance(10000, []);
    expect(estimates).toHaveLength(3);
    expect(estimates.every((e) => e.timeS === null)).toBe(true);
  });

  it("produit des estimations cohérentes à partir d'un seul effort de référence", () => {
    // 20 minutes à 3,5 m/s : 4200 m.
    const estimates = estimatesForDistance(10000, [{ durationS: 1200, distanceM: 4200 }]);
    const bySource = Object.fromEntries(estimates.map((e) => [e.source, e.timeS]));
    // Riegel et VDOT sont calculables dès un seul effort.
    expect(bySource.riegel).not.toBeNull();
    expect(bySource.vdot).not.toBeNull();
    // La vitesse critique exige au moins trois efforts entre 2 et 30 min.
    expect(bySource.vitesse_critique).toBeNull();
    // 10 km est plus long que la référence : le chrono prédit doit être plus lent.
    expect(bySource.riegel!).toBeGreaterThan(1200 * (10000 / 4200));
  });
});

describe("classifyTrajectory", () => {
  const targetTimeS = 3840; // 1h04

  it("classe 'avance' quand la prédiction bat largement la cible", () => {
    expect(classifyTrajectory(3600, targetTimeS)).toBe("avance");
  });

  it("classe 'dans_les_temps' dans la bande de tolérance", () => {
    expect(classifyTrajectory(3850, targetTimeS)).toBe("dans_les_temps");
  });

  it("classe 'retard' quand la prédiction est nettement plus lente", () => {
    expect(classifyTrajectory(4200, targetTimeS)).toBe("retard");
  });
});

// ---------------------------------------------------------------------------

describe("meilleurs efforts", () => {
  // Sortie d'une heure : 20 minutes à 3 m/s, 10 minutes à 5 m/s, puis 3 m/s.
  const time = Array.from({ length: 3601 }, (_, i) => i);
  const distance = time.map((t) => {
    if (t <= 1200) return t * 3;
    if (t <= 1800) return 3600 + (t - 1200) * 5;
    return 6600 + (t - 1800) * 3;
  });

  it("trouve la meilleure distance sur cinq minutes", () => {
    const efforts = bestDistanceForDurations({ time, distance }, [300]);
    expect(efforts[0]!.distanceM).toBeCloseTo(1500, 0);
  });

  it("trouve la meilleure distance sur vingt minutes", () => {
    // La fenêtre optimale englobe le bloc rapide de 10 minutes.
    const efforts = bestDistanceForDurations({ time, distance }, [1200]);
    expect(efforts[0]!.distanceM).toBeGreaterThan(3600);
    expect(efforts[0]!.distanceM).toBeCloseTo(4800, 0);
  });

  it("ignore les durées plus longues que l'activité", () => {
    expect(bestDistanceForDurations({ time, distance }, [7200])).toEqual([]);
  });

  it("trouve le meilleur temps sur une distance", () => {
    // 1 000 m au meilleur rythme (5 m/s) : 200 s.
    const efforts = bestTimeForDistances({ time, distance }, [1000]);
    expect(efforts[0]!.durationS).toBeCloseTo(200, 0);
  });

  it("écarte les reculs de distance dus au GPS", () => {
    const noisy = [0, 10, 20, 15, 30, 40];
    const t = [0, 1, 2, 3, 4, 5];
    const efforts = bestDistanceForDurations({ time: t, distance: noisy }, [2]);
    expect(efforts[0]!.distanceM).toBeGreaterThan(0);
  });

  it("fusionne les meilleurs efforts de plusieurs sorties", () => {
    const merged = mergeBestEfforts([
      { durationS: 300, distanceM: 1500 },
      { durationS: 300, distanceM: 1620 },
      { durationS: 600, distanceM: 2900 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ durationS: 300, distanceM: 1620 });
  });
});

// ---------------------------------------------------------------------------

describe("détection des records personnels", () => {
  it("signale une durée quand l'effort du jour égale ou dépasse le record", () => {
    const current = [
      { durationS: 300, distanceM: 1500 },
      { durationS: 600, distanceM: 2800 },
    ];
    const allTimeBest = new Map([
      [300, 1500], // égalité : compte comme record.
      [600, 3000], // en retrait : pas un record.
    ]);
    expect(detectPersonalRecords(current, allTimeBest)).toEqual([300]);
  });

  it("traite une durée absente du all-time comme un record automatique", () => {
    const current = [{ durationS: 1200, distanceM: 4000 }];
    expect(detectPersonalRecords(current, new Map())).toEqual([1200]);
  });

  it("ne signale rien si aucun effort n'atteint le record", () => {
    const current = [{ durationS: 300, distanceM: 1400 }];
    const allTimeBest = new Map([[300, 1500]]);
    expect(detectPersonalRecords(current, allTimeBest)).toEqual([]);
  });
});

describe("série hebdomadaire (streak)", () => {
  const TODAY = "2026-08-29"; // samedi

  it("compte la semaine courante dès la première activité", () => {
    expect(computeWeekStreak(["2026-08-25"], TODAY)).toBe(1);
  });

  it("remonte les semaines consécutives", () => {
    // Semaines du 27/07, 03/08, 10/08, 17/08, 24/08 — cinq consécutives.
    const days = ["2026-07-28", "2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26"];
    expect(computeWeekStreak(days, TODAY)).toBe(5);
  });

  it("s'arrête à la première semaine sans activité", () => {
    // Semaine courante + précédente, puis un trou.
    const days = ["2026-08-26", "2026-08-19", "2026-08-01"];
    expect(computeWeekStreak(days, TODAY)).toBe(2);
  });

  it("une semaine en cours SANS activité ne casse pas une série qui continue la semaine précédente", () => {
    // La semaine courante (24/08) n'a encore rien ; celle d'avant (17/08) a
    // couru : la série n'est pas rompue, elle est juste "en attente" de la
    // sortie de cette semaine. Avant le correctif, ce cas retombait à 0.
    expect(computeWeekStreak(["2026-08-19"], TODAY)).toBe(1);
  });

  it("vaut zéro sans activité cette semaine ET sans continuité la semaine précédente", () => {
    // Trou entre la semaine courante (24/08, vide) et la seule activité
    // historique, huit jours avant le début de cette fenêtre.
    expect(computeWeekStreak(["2026-08-01"], TODAY)).toBe(0);
  });

  it("référence : au moins une course chaque semaine depuis le 20/07, observée un mercredi sans sortie hebdomadaire encore faite", () => {
    // Reproduit le cas réel : douze semaines consécutives de course jusqu'au
    // 24/08 inclus, puis un mercredi (02/09) où la semaine en cours n'a pas
    // encore de sortie. La série ne doit pas retomber à 0.
    const mondays = [
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
      "2026-07-06",
      "2026-07-13",
      "2026-07-20",
      "2026-07-27",
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
    ];
    expect(computeWeekStreak(mondays, "2026-09-02")).toBe(mondays.length);
  });
});

describe("volume hebdomadaire par sport", () => {
  // Semaine du 24 au 30/08/2026 : trois courses (25, 27, 29/08) réellement
  // enregistrées, aucun vélo — oracle de référence vérifié manuellement.
  const WEEK_ACTIVITIES = [
    { type: "Run", distanceM: 8964 }, // 25/08, "Morning run"
    { type: "Run", distanceM: 5009.5 }, // 27/08, "Reprise"
    { type: "Run", distanceM: 10714 }, // 29/08, "Test de seuil"
  ];

  it("additionne le volume de course sur la semaine de référence", () => {
    const { runKm, rideKm } = computeSportVolume(WEEK_ACTIVITIES);
    expect(runKm).toBeCloseTo(24.6875, 3);
    expect(rideKm).toBe(0);
  });

  it("compte les séances tapis (VirtualRun) comme de la course", () => {
    const { runKm } = computeSportVolume([{ type: "VirtualRun", distanceM: 5000 }]);
    expect(runKm).toBe(5);
  });

  it("ne mélange jamais vélo et course dans le même total", () => {
    const { runKm, rideKm } = computeSportVolume([
      ...WEEK_ACTIVITIES,
      { type: "Ride", distanceM: 30000 },
    ]);
    expect(runKm).toBeCloseTo(24.6875, 3);
    expect(rideKm).toBe(30);
  });

  it("ignore les sports ni course ni vélo (musculation, rameur…)", () => {
    const { runKm, rideKm } = computeSportVolume([{ type: "WeightTraining", distanceM: 0 }]);
    expect(runKm).toBe(0);
    expect(rideKm).toBe(0);
  });
});

describe("progression du record de distance", () => {
  it("référence : 6,84 -> 7,32 -> 8,00 -> 8,96 -> 10,71 km, sans jamais fusionner deux records proches", () => {
    const runs = [
      { day: "2026-07-24", distanceM: 6840 },
      { day: "2026-07-30", distanceM: 6500 }, // ne bat pas le record : absent de la progression
      { day: "2026-08-14", distanceM: 7320 },
      { day: "2026-08-20", distanceM: 8000 },
      { day: "2026-08-25", distanceM: 8964 },
      { day: "2026-08-27", distanceM: 5009.5 }, // plus courte, n'apparaît pas
      { day: "2026-08-29", distanceM: 10714 },
    ];
    expect(longestRunProgression(runs)).toEqual([
      { day: "2026-07-24", distanceM: 6840 },
      { day: "2026-08-14", distanceM: 7320 },
      { day: "2026-08-20", distanceM: 8000 },
      { day: "2026-08-25", distanceM: 8964 },
      { day: "2026-08-29", distanceM: 10714 },
    ]);
    // 8964 m ne doit jamais être confondu avec 9000 m (arrondi à 1 décimale
    // en km) : le record précédent et le nouveau doivent rester distincts.
    const progression = longestRunProgression(runs);
    const previous = progression[progression.length - 2]!;
    expect((previous.distanceM / 1000).toFixed(2)).toBe("8.96");
    expect((previous.distanceM / 1000).toFixed(1)).toBe("9.0"); // la régression à éviter
  });
});

describe("fraîcheur du jour (readiness)", () => {
  it("moyenne et écart-type d'une série connue", () => {
    const { mean, sd } = meanAndStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(mean).toBe(5);
    expect(sd).toBeCloseTo(2, 5);
  });

  it("« frais » quand le VFC est dans la norme et la FC de repos stable", () => {
    const result = computeReadiness({
      hrv: 50,
      restingHr: 55,
      hrvBaselineMean: 48,
      hrvBaselineSd: 6,
      restingHrBaselineMean: 55,
    });
    expect(result.status).toBe("frais");
  });

  it("« prudence » quand le VFC chute nettement sous la norme", () => {
    const result = computeReadiness({
      hrv: 30,
      restingHr: 55,
      hrvBaselineMean: 48,
      hrvBaselineSd: 6,
      restingHrBaselineMean: 55,
    });
    expect(result.status).toBe("prudence");
  });

  it("« prudence » quand la FC de repos grimpe même si le VFC est stable", () => {
    const result = computeReadiness({
      hrv: 48,
      restingHr: 61,
      hrvBaselineMean: 48,
      hrvBaselineSd: 6,
      restingHrBaselineMean: 55,
    });
    expect(result.status).toBe("prudence");
  });

  it("« correct » entre les deux", () => {
    const result = computeReadiness({
      hrv: 44,
      restingHr: 57,
      hrvBaselineMean: 48,
      hrvBaselineSd: 6,
      restingHrBaselineMean: 55,
    });
    expect(result.status).toBe("correct");
  });
});

describe("dernière mesure disponible (fallback readiness)", () => {
  // Reproduit les fichiers bruts COROS réels : VFC disponible seulement à
  // partir du 23/08, FC de repos presque tous les jours, et le 29/08 (dernier
  // jour importé) n'a NI VFC NI FC de repos — le capteur n'a pas encore
  // synchronisé cette mesure au moment de l'export.
  const HISTORY = [
    { day: "2026-08-29", hrv: null, restingHr: null },
    { day: "2026-08-28", hrv: 51, restingHr: 56 },
    { day: "2026-08-27", hrv: 46, restingHr: 56 },
    { day: "2026-08-26", hrv: 31, restingHr: 57 },
    { day: "2026-08-25", hrv: 59, restingHr: 54 },
    { day: "2026-08-24", hrv: 49, restingHr: 57 },
    { day: "2026-08-23", hrv: 57, restingHr: 59 },
    { day: "2026-08-22", hrv: null, restingHr: 57 },
    { day: "2026-08-21", hrv: null, restingHr: 53 },
  ];

  it("remonte à la dernière mesure complète quand celle du jour manque", () => {
    // Il n'y a que 6 jours avec VFC avant le 29/08 (23 -> 28 inclus) : pas
    // assez pour 7 échantillons de baseline, donc pas de résultat exploitable
    // avec seulement cet historique.
    expect(findLatestReadinessMeasurement(HISTORY)).toBeNull();
  });

  it("expose la date de la mesure retenue dès qu'il y a assez d'historique", () => {
    const longerHistory = [
      ...HISTORY,
      { day: "2026-08-20", hrv: 55, restingHr: 54 },
      { day: "2026-08-19", hrv: 52, restingHr: 60 },
    ];
    const measurement = findLatestReadinessMeasurement(longerHistory);
    expect(measurement?.measurementDay).toBe("2026-08-28");
    expect(measurement?.hrv).toBe(51);
    expect(measurement?.restingHr).toBe(56);
  });

  it("calcule la plage habituelle sur les jours DISPONIBLES, pas calendaires", () => {
    // Historique plus large avec un vrai trou calendaire (rien le 17 et 18) :
    // les 7 échantillons doivent quand même être les 7 dernières valeurs
    // réellement mesurées avant la mesure retenue, pas une fenêtre de 7 jours
    // calendaires qui en manquerait deux.
    const withCalendarGap = [
      { day: "2026-08-25", hrv: 59, restingHr: 54 },
      { day: "2026-08-24", hrv: 49, restingHr: 57 },
      { day: "2026-08-23", hrv: 57, restingHr: 59 },
      { day: "2026-08-22", hrv: 50, restingHr: 57 },
      { day: "2026-08-19", hrv: 52, restingHr: 60 }, // trou les 20 et 21
      { day: "2026-08-18", hrv: 53, restingHr: 57 },
      { day: "2026-08-17", hrv: 54, restingHr: 57 },
      { day: "2026-08-16", hrv: 55, restingHr: 57 },
    ];
    const measurement = findLatestReadinessMeasurement(withCalendarGap);
    expect(measurement?.measurementDay).toBe("2026-08-25");
    // Moyenne des 7 VFC disponibles avant le 25/08 (49,57,50,52,53,54,55).
    expect(measurement?.hrvBaseline.mean).toBeCloseTo((49 + 57 + 50 + 52 + 53 + 54 + 55) / 7, 6);
  });
});
