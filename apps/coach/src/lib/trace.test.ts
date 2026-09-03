import { describe, expect, it } from "vitest";
import { buildTracePath, normalizeToBox, simplifyPath, type LatLng } from "./trace.ts";

describe("simplifyPath", () => {
  it("garde les extrémités et réduit les points alignés", () => {
    const line: LatLng[] = [
      [0, 0],
      [0, 0.001],
      [0, 0.002],
      [0, 0.003],
      [0, 0.004],
    ];
    const out = simplifyPath(line, 0.0001);
    expect(out[0]).toEqual(line[0]);
    expect(out[out.length - 1]).toEqual(line[line.length - 1]);
    expect(out.length).toBeLessThan(line.length);
  });

  it("conserve un virage marqué (n'aplati pas la forme)", () => {
    const corner: LatLng[] = [
      [0, 0],
      [0, 0.01],
      [0.01, 0.01],
    ];
    const out = simplifyPath(corner, 0.0001);
    expect(out).toHaveLength(3);
  });

  it("ne modifie pas un tracé à 2 points", () => {
    const two: LatLng[] = [
      [0, 0],
      [1, 1],
    ];
    expect(simplifyPath(two, 0.0001)).toEqual(two);
  });
});

describe("normalizeToBox", () => {
  it("centre le tracé dans [0,1]×[0,1]", () => {
    const points: LatLng[] = [
      [45, 5],
      [45.01, 5.01],
      [44.99, 4.99],
    ];
    const normalized = normalizeToBox(points);
    for (const p of normalized) {
      expect(p.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.x).toBeLessThanOrEqual(1.01);
      expect(p.y).toBeGreaterThanOrEqual(-0.01);
      expect(p.y).toBeLessThanOrEqual(1.01);
    }
  });

  it("préserve le ratio d'aspect (pas d'étirement)", () => {
    // Tracé deux fois plus large que haut : la boîte normalisée doit garder
    // ce ratio, pas remplir [0,1]×[0,1] dans les deux dimensions.
    const points: LatLng[] = [
      [0, 0],
      [0, 0.02],
      [0.01, 0.02],
      [0.01, 0],
    ];
    const normalized = normalizeToBox(points);
    const xs = normalized.map((p) => p.x);
    const ys = normalized.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    expect(spanX).toBeGreaterThan(spanY * 1.5);
  });

  it("renvoie un tableau vide sur une entrée vide", () => {
    expect(normalizeToBox([])).toEqual([]);
  });
});

describe("buildTracePath", () => {
  it("renvoie null avec moins de 2 points valides", () => {
    expect(buildTracePath([])).toBeNull();
    expect(buildTracePath([[45, 5]])).toBeNull();
    expect(buildTracePath([null, [45, 5], null])).toBeNull();
  });

  it("ignore les trous (null) du flux GPS", () => {
    const path = buildTracePath([
      [45, 5],
      null,
      [45.001, 5.001],
      [45.002, 5.002],
    ]);
    expect(path).not.toBeNull();
    expect(path).toMatch(/^M/);
  });

  it("produit un chemin dans la boîte demandée", () => {
    const path = buildTracePath(
      [
        [45, 5],
        [45.01, 5.01],
        [45.02, 5.0],
      ],
      100,
    );
    expect(path).toBeTruthy();
    const coords = [...path!.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(101);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(101);
    }
  });
});
