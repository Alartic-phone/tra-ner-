import type { LatLng } from "./trace.ts";

/**
 * Superposition de tous les tracés d'une période sur un repère commun
 * (Web Mercator). Fonction PURE : produit une chaîne SVG, aucun accès disque
 * ni réseau — la mise en cache disque et l'invalidation vivent dans
 * lib/trace-atlas-repository.ts, qui appelle ce module.
 */

export type MercatorPoint = { x: number; y: number };

/** Projection Web Mercator standard, coordonnées normalisées dans [0,1]×[0,1] à l'échelle du monde. */
export function mercatorProject([lat, lng]: LatLng): MercatorPoint {
  const x = (lng + 180) / 360;
  const clampedLat = Math.max(-85.05, Math.min(85.05, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return { x, y };
}

/** Réduit une trace à ~maxPoints par prélèvement régulier (l'atlas est un rendu d'ensemble, pas un tracé individuel à préserver au pixel près). */
function decimate<T>(points: readonly T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return [...points];
  const step = points.length / maxPoints;
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(points[Math.floor(i * step)]!);
  return out;
}

/**
 * Point de départ le plus fréquent : arrondi à une grille (~110 m à
 * l'équateur) pour regrouper des départs proches sans exiger une
 * coïncidence exacte, puis mode de la distribution.
 */
export function mostFrequentStart(starts: readonly LatLng[]): LatLng | null {
  if (starts.length === 0) return null;
  const GRID = 0.001;
  const counts = new Map<string, { count: number; sample: LatLng }>();
  for (const s of starts) {
    const key = `${Math.round(s[0] / GRID)}_${Math.round(s[1] / GRID)}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, sample: s });
  }
  let best: { count: number; sample: LatLng } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best?.sample ?? null;
}

export type TraceAtlasSvg = {
  svg: string;
  traceCount: number;
};

/**
 * Construit le SVG de l'atlas : un `<path>` à 1 px / 12 % d'opacité par
 * trace, fusion additive (`mix-blend-mode: screen` par chemin — deux tracés
 * qui se recouvrent s'éclaircissent naturellement), cadré sur la boîte
 * englobante de l'ENSEMBLE des tracés. Un point ambre sur le départ le plus
 * fréquent.
 */
export function buildAtlasSvg(
  traces: readonly (readonly LatLng[])[],
  size = 900,
  maxPointsPerTrace = 300,
): TraceAtlasSvg {
  const nonEmpty = traces.filter((t) => t.length >= 2);
  if (nonEmpty.length === 0) return { svg: "", traceCount: 0 };

  const projectedTraces = nonEmpty.map((t) => decimate(t, maxPointsPerTrace).map(mercatorProject));
  const flat = projectedTraces.flat();

  const xs = flat.map((p) => p.x);
  const ys = flat.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Boîte carrée sur le plus grand des deux axes, avec 5 % de marge, pour ne
  // jamais étirer le monde réel.
  const span = Math.max(maxX - minX, maxY - minY, 1e-9) * 1.1;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const toSvg = (p: MercatorPoint) => ({
    x: ((p.x - midX) / span + 0.5) * size,
    y: ((p.y - midY) / span + 0.5) * size,
  });

  const pathTags = projectedTraces
    .map((pts) => {
      const svgPts = pts.map(toSvg);
      const d = svgPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      return `<path d="${d}" fill="none" stroke="var(--color-accent)" stroke-width="1" stroke-opacity="0.12" style="mix-blend-mode:screen" />`;
    })
    .join("");

  const start = mostFrequentStart(nonEmpty.map((t) => t[0]!));
  const startTag = start
    ? (() => {
        const p = toSvg(mercatorProject(start));
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--color-signal)" />`;
      })()
    : "";

  const svg =
    `<svg viewBox="0 0 ${size} ${size}" width="100%" style="height:auto" role="img" aria-label="Carte de tous les tracés de la période, superposés">` +
    pathTags +
    startTag +
    `</svg>`;

  return { svg, traceCount: nonEmpty.length };
}
