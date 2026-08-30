"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Tracé GPS d'une activité, deux rendus possibles :
 *
 * - avec `mapTilerKey` : une vraie carte interactive (rues, terrain) via
 *   MapLibre GL JS + les tuiles vectorielles MapTiler. Le plan gratuit
 *   MapTiler ne couvre PAS l'API « Static Maps » (image déjà rendue,
 *   payante), mais couvre les tuiles vectorielles normales qu'utilise une
 *   carte interactive — d'où MapLibre plutôt qu'une simple `<img>`.
 * - sans clé : repli sur un tracé SVG pur (ligne seule, animée), déjà en
 *   place — jamais une carte cassée, jamais une carte vide.
 *
 * `maplibre-gl` est chargé dynamiquement dans `useEffect` (jamais au niveau
 * module) : la bibliothèque touche `window` à l'import, ce qui casserait le
 * rendu serveur si elle était importée en haut du fichier.
 *
 * `public/maplibre-gl-worker.mjs` et `public/maplibre-gl-shared.mjs` sont des
 * copies de `node_modules/maplibre-gl/dist/` : le bundler Next.js ne sert pas
 * correctement le worker que MapLibre essaie de charger via `import.meta.url`,
 * donc on le sert nous-mêmes en statique et on le pointe explicitement via
 * `setWorkerUrl()` plus bas. Le worker importe à son tour `./maplibre-gl-
 * shared.mjs` en relatif — les deux fichiers doivent rester côte à côte dans
 * `public/`. À recopier tous les deux si `maplibre-gl` change de version.
 */

const MAPTILER_STYLE = "dataviz-dark";

type LatLng = [number, number];

/** Réduit à ~maxPoints par prélèvement régulier — un tracé n'a pas besoin
 * de plus de points que de pixels pour rester fidèle à l'œil. */
function decimate<T>(points: readonly T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return [...points];
  const step = points.length / maxPoints;
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.floor(i * step)]!);
  }
  return out;
}

function project(points: LatLng[]): Array<{ x: number; y: number }> {
  const avgLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  return points.map(([lat, lng]) => ({ x: lng * cosLat, y: -lat }));
}

function SvgRouteMap({
  points,
  width,
  height,
  strokeWidth,
  showMarkers,
  color,
  fill = false,
  className,
}: {
  points: LatLng[];
  width: number;
  height: number;
  strokeWidth: number;
  showMarkers: boolean;
  color: string;
  /** Remplit et recadre le conteneur (fond de carte) plutôt que de garantir
   *  le tracé entier visible sans recadrage. */
  fill?: boolean;
  className?: string;
}) {
  const decimated = decimate(points, 500);
  const projected = project(decimated);

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
  const toSvg = (p: { x: number; y: number }) => ({
    x: width / 2 + (p.x - midX) * scale,
    y: height / 2 + (p.y - midY) * scale,
  });

  const svgPoints = projected.map(toSvg);
  const pathD = svgPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  // Longueur approximative du tracé projeté, pour l'animation de dessin.
  const pathLength = svgPoints.reduce((sum, p, i) => {
    if (i === 0) return sum;
    const prev = svgPoints[i - 1]!;
    return sum + Math.hypot(p.x - prev.x, p.y - prev.y);
  }, 0);

  const start = svgPoints[0]!;
  const end = svgPoints[svgPoints.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={fill ? "100%" : undefined}
      preserveAspectRatio={fill ? "xMidYMid slice" : undefined}
      style={fill ? undefined : { height: "auto" }}
      className={className}
    >
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength}
        strokeDashoffset={0}
        style={
          {
            "--ring-circumference": pathLength,
            animation: "ring-fill 900ms var(--ease-standard) forwards",
          } as React.CSSProperties
        }
      />
      {showMarkers ? (
        <>
          <circle cx={start.x} cy={start.y} r={strokeWidth * 1.6} fill="var(--color-ok)" />
          <circle
            cx={end.x}
            cy={end.y}
            r={strokeWidth * 1.6}
            fill="var(--color-bg)"
            stroke={color}
            strokeWidth={strokeWidth * 0.8}
          />
        </>
      ) : null}
    </svg>
  );
}

/**
 * Charge MapLibre et bascule sur le tracé SVG dès que quelque chose échoue —
 * clé refusée, style ou tuiles indisponibles, WebGL absent, temps de charge
 * excessif. Jamais de rectangle vide affiché sans explication : au pire,
 * l'utilisateur retrouve le tracé simple qui marchait déjà.
 */
function MapLibreRouteMap({
  points,
  mapTilerKey,
  width,
  height,
  strokeWidth,
  showMarkers,
  color,
  fill = false,
  className,
}: {
  points: LatLng[];
  mapTilerKey: string;
  width: number;
  height: number;
  strokeWidth: number;
  showMarkers: boolean;
  color: string;
  fill?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) {
        console.error("RouteMap: chargement MapLibre trop long, repli sur le tracé SVG.");
        setFailed(true);
      }
    }, 8000);

    import("maplibre-gl")
      .then((maplibregl) => {
        if (cancelled || !container) return;

        // MapLibre charge son worker via `import.meta.url`, que le bundler
        // Next.js réécrit sans qu'une route statique corresponde derrière —
        // le navigateur reçoit alors la page HTML de secours à la place du
        // script, et rien ne se charge. On pointe donc explicitement vers
        // une copie statique du worker dans `public/` (cf. commentaire de
        // fichier). À resynchroniser si `maplibre-gl` est mis à jour.
        maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

        // Le paint WebGL de MapLibre n'interprète pas `var(--x)` : c'est du
        // CSS uniquement. On résout la variable en couleur calculée une fois
        // le composant monté ; une couleur déjà littérale (hex/rgb) traverse
        // telle quelle.
        const resolvedColor = color.startsWith("var(")
          ? getComputedStyle(document.documentElement)
              .getPropertyValue(color.slice(4, -1))
              .trim() || "#5b9cf6"
          : color;

        const coords = points.map(([lat, lng]) => [lng, lat] as [number, number]);
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(coords[0]!, coords[0]!),
        );

        map = new maplibregl.Map({
          container,
          style: `https://api.maptiler.com/maps/${MAPTILER_STYLE}/style.json?key=${mapTilerKey}`,
          bounds,
          fitBoundsOptions: { padding: 24, animate: false },
          interactive: false,
          attributionControl: false,
        });

        map.on("error", (e) => {
          console.error("RouteMap: erreur MapLibre, repli sur le tracé SVG.", e.error);
          clearTimeout(timeout);
          if (!cancelled) setFailed(true);
        });

        map.on("load", () => {
          if (cancelled || !map) return;
          clearTimeout(timeout);
          map.addSource("route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } },
          });
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": resolvedColor, "line-width": 3 },
          });
        });
      })
      .catch((error) => {
        console.error("RouteMap: échec du chargement de MapLibre, repli sur le tracé SVG.", error);
        clearTimeout(timeout);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapTilerKey]);

  if (failed) {
    return (
      <SvgRouteMap
        points={points}
        width={width}
        height={height}
        strokeWidth={strokeWidth}
        showMarkers={showMarkers}
        color={color}
        fill={fill}
        className={className}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={
        fill
          ? { width: "100%", height: "100%", borderRadius: "var(--radius-card)", overflow: "hidden" }
          : { width, height, maxWidth: "100%", borderRadius: "var(--radius-card)", overflow: "hidden" }
      }
    />
  );
}

export function RouteMap({
  latlng,
  mapTilerKey,
  width = 320,
  height = 220,
  strokeWidth = 3,
  showMarkers = true,
  color = "var(--color-accent)",
  fill = false,
  className,
}: {
  latlng: ReadonlyArray<LatLng | null>;
  /** Clé MapTiler (tuiles, gratuites) — omise ou vide = repli automatique sur le SVG seul. */
  mapTilerKey?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  showMarkers?: boolean;
  /** Couleur du tracé — `var(--sport-*)` pour l'identité du sport, valeur littérale sinon. */
  color?: string;
  /**
   * Remplit et recadre son conteneur au lieu de garantir le tracé entier
   * visible — pour un fond de carte (le conteneur impose sa taille, pas
   * `width`/`height`, qui ne servent alors qu'à cadrer le tracé en carré).
   */
  fill?: boolean;
  className?: string;
}) {
  const valid = latlng.filter((p): p is LatLng => p != null);
  if (valid.length < 2) return null;

  if (mapTilerKey) {
    return (
      <MapLibreRouteMap
        points={valid}
        mapTilerKey={mapTilerKey}
        width={width}
        height={height}
        strokeWidth={strokeWidth}
        showMarkers={showMarkers}
        color={color}
        fill={fill}
        className={className}
      />
    );
  }

  return (
    <SvgRouteMap
      points={valid}
      width={width}
      height={height}
      strokeWidth={strokeWidth}
      showMarkers={showMarkers}
      color={color}
      fill={fill}
      className={className}
    />
  );
}
