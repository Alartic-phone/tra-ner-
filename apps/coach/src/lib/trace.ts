/**
 * Génération d'un chemin SVG statique à partir d'un flux GPS (lat/lng).
 * Fonction PURE : aucune dépendance à React, Next ou la base. Le tracé est
 * calculé une fois (page activité, TraceThumb, TraceAtlas) et mis en cache
 * plutôt que redessiné avec une carte par ligne — 137 instances MapLibre
 * tueraient une page de liste.
 */

export type LatLng = readonly [number, number];

/**
 * Simplification de Douglas-Peucker (1973) : conserve les points qui
 * s'écartent le plus d'une corde, élimine les autres. Réduit un tracé
 * seconde par seconde à quelques centaines de points sans déformer sa forme
 * — contrairement à un sous-échantillonnage régulier qui peut couper des
 * virages serrés.
 */
export function simplifyPath(points: readonly LatLng[], epsilon: number): LatLng[] {
  if (points.length <= 2) return [...points];

  let maxDist = 0;
  let index = 0;
  const [x1, y1] = points[0]!;
  const [x2, y2] = points[points.length - 1]!;

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i]!, [x1, y1], [x2, y2]);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, index + 1), epsilon);
    const right = simplifyPath(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0]!, points[points.length - 1]!];
}

function perpendicularDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  // Distance point-segment (pas point-droite) : au-delà des extrémités, la
  // distance est prise au point le plus proche du segment.
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

export type NormalizedPoint = { x: number; y: number };

/**
 * Projette lat/lng sur un plan localement (correction cosinus de la latitude
 * moyenne — suffisant à l'échelle d'une sortie, pas besoin d'une projection
 * globale), puis normalise dans une boîte [0,1]×[0,1] en conservant le ratio
 * d'aspect réel du tracé (le tracé le plus centré/carré est complété par une
 * marge, jamais étiré).
 */
export function normalizeToBox(points: readonly LatLng[]): NormalizedPoint[] {
  if (points.length === 0) return [];
  const avgLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  const projected = points.map(([lat, lng]) => ({ x: lng * cosLat, y: -lat }));

  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1e-9);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return projected.map((p) => ({
    x: 0.5 + (p.x - midX) / span,
    y: 0.5 + (p.y - midY) / span,
  }));
}

/**
 * Chemin SVG (attribut `d`) prêt à poser dans un `<path>`, dans une boîte
 * `size`×`size`. `simplifyEpsilon` est en degrés — ~0.00005 conserve la forme
 * d'un tracé de course tout en divisant fortement le nombre de points ;
 * augmenter pour des vignettes très petites où le détail ne se voit pas.
 */
export function buildTracePath(
  latlng: readonly (LatLng | null)[],
  size = 100,
  simplifyEpsilon = 0.00005,
): string | null {
  const valid = latlng.filter((p): p is LatLng => p != null);
  if (valid.length < 2) return null;

  const simplified = simplifyPath(valid, simplifyEpsilon);
  const normalized = normalizeToBox(simplified);

  return normalized
    .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * size).toFixed(2)},${(p.y * size).toFixed(2)}`)
    .join(" ");
}
