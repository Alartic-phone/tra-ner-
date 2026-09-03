import { describe, expect, it } from "vitest";
import { buildAtlasSvg, mercatorProject, mostFrequentStart } from "./trace-atlas.ts";
import type { LatLng } from "./trace.ts";

describe("mercatorProject", () => {
  it("place l'équateur/méridien origine au centre du monde (0.5, 0.5)", () => {
    const p = mercatorProject([0, 0]);
    expect(p.x).toBeCloseTo(0.5, 5);
    expect(p.y).toBeCloseTo(0.5, 5);
  });

  it("x croît vers l'est, y croît vers le sud", () => {
    const west = mercatorProject([45, -10]);
    const east = mercatorProject([45, 10]);
    expect(east.x).toBeGreaterThan(west.x);

    const north = mercatorProject([50, 5]);
    const south = mercatorProject([40, 5]);
    expect(south.y).toBeGreaterThan(north.y);
  });

  it("reste borné même à une latitude extrême", () => {
    const p = mercatorProject([89.9, 0]);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

describe("mostFrequentStart", () => {
  it("renvoie le point le plus représenté après regroupement par grille", () => {
    const starts: LatLng[] = [
      [45.75, 4.85],
      [45.7501, 4.8501], // même case de grille
      [45.7502, 4.8499],
      [46.1, 5.2], // isolé
    ];
    const best = mostFrequentStart(starts);
    expect(best![0]).toBeCloseTo(45.75, 1);
    expect(best![1]).toBeCloseTo(4.85, 1);
  });

  it("renvoie null sur une liste vide", () => {
    expect(mostFrequentStart([])).toBeNull();
  });
});

describe("buildAtlasSvg", () => {
  const traceNearLyon = (offset: number): LatLng[] => [
    [45.75 + offset, 4.85],
    [45.751 + offset, 4.851],
    [45.752 + offset, 4.852],
  ];

  it("renvoie un SVG vide sans trace exploitable", () => {
    expect(buildAtlasSvg([])).toEqual({ svg: "", traceCount: 0 });
    expect(buildAtlasSvg([[[45, 5]]])).toEqual({ svg: "", traceCount: 0 }); // 1 seul point
  });

  it("compte uniquement les traces d'au moins 2 points", () => {
    const result = buildAtlasSvg([traceNearLyon(0), [[45, 5]], traceNearLyon(0.01)]);
    expect(result.traceCount).toBe(2);
  });

  it("produit un <path> par trace, en trait fin et fusion additive", () => {
    const result = buildAtlasSvg([traceNearLyon(0), traceNearLyon(0.01)]);
    const pathCount = (result.svg.match(/<path /g) ?? []).length;
    expect(pathCount).toBe(2);
    expect(result.svg).toContain('stroke-width="1"');
    expect(result.svg).toContain('stroke-opacity="0.12"');
    expect(result.svg).toContain("mix-blend-mode:screen");
  });

  it("place un point ambre sur le départ le plus fréquent", () => {
    const result = buildAtlasSvg([traceNearLyon(0), traceNearLyon(0), traceNearLyon(1)]);
    expect(result.svg).toContain("var(--color-signal)");
    expect(result.svg).toContain("<circle");
  });

  it("est un SVG valide au sens minimal (une seule racine <svg>)", () => {
    const result = buildAtlasSvg([traceNearLyon(0), traceNearLyon(0.01)]);
    expect(result.svg.startsWith("<svg")).toBe(true);
    expect(result.svg.endsWith("</svg>")).toBe(true);
  });
});
