/**
 * Le tracé GPS comme matière graphique — fonctions PURES, testées, qui
 * transforment une suite de positions en chemin SVG. Aucune dépendance à
 * React, à MapLibre ni à la base : `route-map.tsx` (vignette et carte
 * interactive), `strava/sync.ts` (mise en cache à l'import) et la carte
 * annuelle de `/progression` s'appuient toutes sur ce module plutôt que de
 * réimplémenter la projection chacune à leur façon.
 *
 * Projection équirectangulaire simple (pas de Mercator) : sur l'échelle
 * d'une sortie ou même d'une année de sorties locales, l'erreur introduite
 * est invisible à l'œil, et une projection plus riche n'apporterait qu'une
 * dépendance de plus pour un tracé qui n'est déjà qu'indicatif.
 */

export type LatLng = readonly [number, number];
export type Point = { x: number; y: number };

/** Réduit à ~maxPoints par prélèvement régulier — un tracé n'a pas besoin de
 * plus de points que de pixels pour rester fidèle à l'œil. */
export function decimate<T>(points: readonly T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return [...points];
  const step = points.length / maxPoints;
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.floor(i * step)]!);
  }
  return out;
}

/** Projette des [lat, lng] en coordonnées planes, corrigées de la latitude moyenne. */
export function project(points: readonly LatLng[]): Point[] {
  const avgLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  return points.map(([lat, lng]) => ({ x: lng * cosLat, y: -lat }));
}

function pathFromPoints(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function pathLengthOf(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    sum += Math.hypot(curr.x - prev.x, curr.y - prev.y);
  }
  return sum;
}

export type TracePath = {
  /** Attribut `d` du `<path>`, déjà à l'échelle du viewBox. */
  pathD: string;
  viewBox: string;
  width: number;
  height: number;
  /** Longueur totale du tracé projeté, pour l'animation de dessin (stroke-dasharray). */
  pathLength: number;
  /**
   * Projette un point [lat, lng] SUPPLÉMENTAIRE dans le même espace de
   * coordonnées que `pathD` — sert au marqueur de survol synchronisé avec
   * les graphiques, recalculé à chaque déplacement de souris sans refaire
   * tourner toute la projection du tracé.
   */
  projectPoint: (p: LatLng) => Point;
};

/**
 * Tracé d'UNE activité, recentré sur sa propre étendue — c'est l'usage
 * vignette et carte détaillée : chaque sortie occupe tout l'espace qui lui
 * est donné, quelle que soit sa taille réelle.
 */
export function computeTracePath(
  latlng: readonly (LatLng | null)[],
  options: { width?: number; height?: number; strokeWidth?: number; maxPoints?: number } = {},
): TracePath | null {
  const width = options.width ?? 200;
  const height = options.height ?? 200;
  const strokeWidth = options.strokeWidth ?? 3;
  const maxPoints = options.maxPoints ?? 400;

  const valid = latlng.filter((p): p is LatLng => p != null);
  if (valid.length < 2) return null;

  const avgLat = valid.reduce((sum, [lat]) => sum + lat, 0) / valid.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  const projectOne = (p: LatLng): Point => ({ x: p[1] * cosLat, y: -p[0] });

  const projected = decimate(valid, maxPoints).map(projectOne);

  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const padding = strokeWidth * 3;
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const toSvg = (p: Point): Point => ({
    x: width / 2 + (p.x - midX) * scale,
    y: height / 2 + (p.y - midY) * scale,
  });

  const svgPoints = projected.map(toSvg);

  return {
    pathD: pathFromPoints(svgPoints),
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    pathLength: pathLengthOf(svgPoints),
    projectPoint: (p: LatLng) => toSvg(projectOne(p)),
  };
}

/**
 * Version prête à écrire en base (`ActivityStream.tracePath` /
 * `traceViewBox`) : taille canonique, indépendante de l'usage final — le
 * consommateur (vignette 96 px, carte détaillée) redimensionne juste le
 * `<svg>` autour du même viewBox, sans jamais redécompresser `data` pour un
 * simple aperçu.
 */
export function buildCachedTrace(
  latlng: readonly (LatLng | null)[],
): { tracePath: string | null; traceViewBox: string | null } {
  const trace = computeTracePath(latlng, { width: 200, height: 200, strokeWidth: 3, maxPoints: 300 });
  return trace ? { tracePath: trace.pathD, traceViewBox: trace.viewBox } : { tracePath: null, traceViewBox: null };
}

export type OverlayTrace = { pathD: string };

export type OverlayMap = {
  paths: OverlayTrace[];
  viewBox: string;
  width: number;
  height: number;
};

/**
 * Superpose plusieurs tracés dans UN espace de coordonnées PARTAGÉ : à la
 * différence de `computeTracePath`, aucun tracé n'est recentré sur sa propre
 * étendue — c'est ce qui fait de la carte de `/progression` une vraie carte
 * (les sorties qui partent du même point restent superposées), pas une
 * collection de vignettes indépendantes.
 */
export function computeOverlayPaths(
  traces: ReadonlyArray<ReadonlyArray<LatLng | null>>,
  options: { width?: number; height?: number; padding?: number; maxPointsPerTrace?: number } = {},
): OverlayMap | null {
  const width = options.width ?? 900;
  const height = options.height ?? 900;
  const padding = options.padding ?? 16;
  const maxPointsPerTrace = options.maxPointsPerTrace ?? 300;

  const cleanTraces = traces
    .map((t) => t.filter((p): p is LatLng => p != null))
    .filter((t) => t.length >= 2);
  if (cleanTraces.length === 0) return null;

  const allPoints = cleanTraces.flat();
  const avgLat = allPoints.reduce((sum, [lat]) => sum + lat, 0) / allPoints.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  const projectShared = (p: LatLng): Point => ({ x: p[1] * cosLat, y: -p[0] });

  const projectedAll = allPoints.map(projectShared);
  const xs = projectedAll.map((p) => p.x);
  const ys = projectedAll.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const toSvg = (p: Point): Point => ({
    x: width / 2 + (p.x - midX) * scale,
    y: height / 2 + (p.y - midY) * scale,
  });

  const paths = cleanTraces.map((trace) => {
    const decimated = decimate(trace, maxPointsPerTrace);
    const svgPoints = decimated.map((p) => toSvg(projectShared(p)));
    return { pathD: pathFromPoints(svgPoints) };
  });

  return { paths, viewBox: `0 0 ${width} ${height}`, width, height };
}
