import { describe, expect, it } from "vitest";
import { computeOverlayPaths, computeTracePath, decimate, project } from "./trace.ts";

describe("decimate", () => {
  it("laisse une série plus courte que la cible inchangée", () => {
    expect(decimate([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it("réduit au nombre de points demandé", () => {
    const series = Array.from({ length: 1000 }, (_, i) => i);
    expect(decimate(series, 100)).toHaveLength(100);
  });

  it("conserve l'ordre d'origine", () => {
    const series = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const out = decimate(series, 5);
    expect(out).toEqual([...out].sort((a, b) => a - b));
  });
});

describe("project", () => {
  it("inverse la latitude en y (nord vers le haut)", () => {
    const [a, b] = project([
      [48.0, 2.0],
      [49.0, 2.0],
    ]);
    expect(b!.y).toBeLessThan(a!.y);
  });

  it("corrige la longitude par le cosinus de la latitude moyenne", () => {
    const points = project([
      [60.0, 0.0],
      [60.0, 1.0],
    ]);
    const dx = Math.abs(points[1]!.x - points[0]!.x);
    expect(dx).toBeCloseTo(Math.cos((60 * Math.PI) / 180), 5);
  });
});

describe("computeTracePath", () => {
  it("retourne null avec moins de deux points valides", () => {
    expect(computeTracePath([])).toBeNull();
    expect(computeTracePath([[48, 2]])).toBeNull();
    expect(computeTracePath([[48, 2], null])).toBeNull();
  });

  it("ignore les points null sans planter", () => {
    const result = computeTracePath([[48.85, 2.35], null, [48.86, 2.36], null]);
    expect(result).not.toBeNull();
  });

  it("produit un chemin qui commence par M et dans les bornes du viewBox", () => {
    const width = 200;
    const height = 200;
    const result = computeTracePath(
      [
        [48.85, 2.35],
        [48.86, 2.36],
        [48.855, 2.34],
      ],
      { width, height },
    );
    expect(result).not.toBeNull();
    expect(result!.pathD.startsWith("M")).toBe(true);
    expect(result!.viewBox).toBe(`0 0 ${width} ${height}`);

    // Toutes les coordonnées du chemin restent dans le cadre (avec la marge).
    const coords = result!.pathD.match(/-?\d+\.\d/g)!.map(Number);
    for (let i = 0; i < coords.length; i += 2) {
      expect(coords[i]).toBeGreaterThanOrEqual(-1);
      expect(coords[i]).toBeLessThanOrEqual(width + 1);
    }
  });

  it("un aller simple en ligne droite produit une longueur de chemin positive", () => {
    const result = computeTracePath([
      [48.85, 2.35],
      [48.86, 2.36],
    ]);
    expect(result!.pathLength).toBeGreaterThan(0);
  });

  it("projectPoint place un point du tracé exactement sur le chemin déjà tracé", () => {
    const points: [number, number][] = [
      [48.85, 2.35],
      [48.86, 2.36],
      [48.855, 2.34],
    ];
    const result = computeTracePath(points, { width: 200, height: 200 });
    expect(result).not.toBeNull();

    // Le premier point du tracé DOIT retomber exactement sur le début du
    // chemin (commande M) : même transform, un seul calcul de projection.
    const first = result!.projectPoint(points[0]!);
    const mCoords = result!.pathD.match(/^M(-?\d+\.\d+),(-?\d+\.\d+)/)!;
    expect(first.x).toBeCloseTo(Number(mCoords[1]), 0);
    expect(first.y).toBeCloseTo(Number(mCoords[2]), 0);
  });

  it("un point unique dupliqué (tracé sur place) ne fait pas planter le calcul d'échelle", () => {
    const result = computeTracePath([
      [48.85, 2.35],
      [48.85, 2.35],
      [48.85, 2.35],
    ]);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.pathLength)).toBe(true);
  });
});

describe("computeOverlayPaths", () => {
  it("retourne null sans aucun tracé exploitable", () => {
    expect(computeOverlayPaths([])).toBeNull();
    expect(computeOverlayPaths([[null], [[48, 2]]])).toBeNull();
  });

  it("place deux tracés partageant un point de départ au même endroit dans le cadre", () => {
    const start: [number, number] = [48.85, 2.35];
    const traceA = [start, [48.86, 2.36] as [number, number]];
    const traceB = [start, [48.84, 2.34] as [number, number]];

    const overlay = computeOverlayPaths([traceA, traceB]);
    expect(overlay).not.toBeNull();
    expect(overlay!.paths).toHaveLength(2);

    // Les deux chemins partagent le même point M (même départ géographique
    // projeté dans le même espace de coordonnées) — c'est la garantie
    // structurelle qui distingue la superposition de deux vignettes
    // recentrées indépendamment.
    const startOf = (d: string) => d.match(/^M(-?\d+\.\d)/)![1];
    expect(startOf(overlay!.paths[0]!.pathD)).toBe(startOf(overlay!.paths[1]!.pathD));
  });

  it("un tracé sans position valide est simplement écarté, les autres restent", () => {
    const valid = [
      [48.85, 2.35],
      [48.86, 2.36],
    ] as const;
    const overlay = computeOverlayPaths([valid, [null, null]]);
    expect(overlay).not.toBeNull();
    expect(overlay!.paths).toHaveLength(1);
  });
});
