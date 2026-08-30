"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoPoint } from "@/lib/streams.ts";

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

/** Durée du dessin progressif du tracé au chargement — même valeur pour le
 * SVG (stroke-dashoffset) et MapLibre (révélation point par point). */
const DRAW_MS = 1200;

export type MapSelection = { startT: number; endT: number };

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

/** Index du point le plus proche de `t` par recherche dichotomique — `t` est
 * strictement croissant le long d'une activité. */
function nearestIndexByT(series: readonly GeoPoint[], t: number): number {
  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function averageCosLat(points: readonly GeoPoint[]): number {
  const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  return Math.cos((avgLat * Math.PI) / 180);
}

function projectWithCosLat(points: readonly GeoPoint[], cosLat: number): Array<{ x: number; y: number }> {
  return points.map((p) => ({ x: p.lng * cosLat, y: -p.lat }));
}

function SvgRouteMap({
  points,
  width,
  height,
  strokeWidth,
  showMarkers,
  className,
  cursorT,
  selection,
}: {
  points: GeoPoint[];
  width: number;
  height: number;
  strokeWidth: number;
  showMarkers: boolean;
  className?: string;
  cursorT?: number | null;
  selection?: MapSelection | null;
}) {
  const decimated = decimate(points, 500);
  const cosLat = averageCosLat(decimated);
  const projected = projectWithCosLat(decimated, cosLat);

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

  const selectionPathD = (() => {
    if (!selection) return null;
    const subset = points.filter((p) => p.t >= selection.startT && p.t <= selection.endT);
    if (subset.length < 2) return null;
    const sub = projectWithCosLat(subset, cosLat).map(toSvg);
    return sub.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  })();

  const cursorSvg = (() => {
    if (cursorT == null || points.length === 0) return null;
    const point = points[nearestIndexByT(points, cursorT)]!;
    return toSvg(projectWithCosLat([point], cosLat)[0]!);
  })();

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      <path
        d={pathD}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength}
        strokeDashoffset={0}
        style={
          {
            "--ring-circumference": pathLength,
            animation: `ring-fill ${DRAW_MS}ms var(--ease-standard) 1 forwards`,
          } as React.CSSProperties
        }
      />
      {selectionPathD ? (
        <path
          d={selectionPathD}
          fill="none"
          stroke="var(--color-warn)"
          strokeWidth={strokeWidth * 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {showMarkers ? (
        <>
          <circle cx={start.x} cy={start.y} r={strokeWidth * 1.6} fill="var(--color-ok)" />
          <circle
            cx={end.x}
            cy={end.y}
            r={strokeWidth * 1.6}
            fill="var(--color-bg)"
            stroke="var(--color-accent)"
            strokeWidth={strokeWidth * 0.8}
          />
        </>
      ) : null}
      {cursorSvg ? (
        <circle
          cx={cursorSvg.x}
          cy={cursorSvg.y}
          r={strokeWidth * 1.4}
          fill="var(--color-warn)"
          stroke="var(--color-bg)"
          strokeWidth={strokeWidth * 0.6}
        />
      ) : null}
    </svg>
  );
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function lineFeature(coords: Array<[number, number]>): GeoJSON.FeatureCollection {
  if (coords.length < 2) return EMPTY_FC;
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }],
  };
}

function pointFeature(coord: [number, number]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: coord } }],
  };
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
  strokeWidth,
  showMarkers,
  className,
  cursorT,
  selection,
}: {
  points: GeoPoint[];
  mapTilerKey: string;
  strokeWidth: number;
  showMarkers: boolean;
  className?: string;
  cursorT?: number | null;
  selection?: MapSelection | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

        const coords = points.map((p) => [p.lng, p.lat] as [number, number]);
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(coords[0]!, coords[0]!),
        );

        const map = new maplibregl.Map({
          container,
          style: `https://api.maptiler.com/maps/${MAPTILER_STYLE}/style.json?key=${mapTilerKey}`,
          bounds,
          fitBoundsOptions: { padding: 32, animate: false },
          interactive: false,
          attributionControl: false,
        });
        mapRef.current = map;

        map.on("error", (e) => {
          console.error("RouteMap: erreur MapLibre, repli sur le tracé SVG.", e.error);
          clearTimeout(timeout);
          if (!cancelled) setFailed(true);
        });

        map.on("load", () => {
          if (cancelled) return;
          clearTimeout(timeout);

          const animateDraw = !prefersReducedMotion() && coords.length > 2;
          map.addSource("route", { type: "geojson", data: lineFeature(animateDraw ? [] : coords) });
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#5b9cf6", "line-width": strokeWidth },
          });

          map.addSource("route-highlight", { type: "geojson", data: EMPTY_FC });
          map.addLayer({
            id: "route-highlight-line",
            type: "line",
            source: "route-highlight",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#fab219", "line-width": strokeWidth * 2 },
          });

          map.addSource("route-cursor", { type: "geojson", data: EMPTY_FC });
          map.addLayer({
            id: "route-cursor-point",
            type: "circle",
            source: "route-cursor",
            paint: {
              "circle-radius": strokeWidth * 1.6,
              "circle-color": "#fab219",
              "circle-stroke-color": "#0b0e14",
              "circle-stroke-width": strokeWidth * 0.6,
            },
          });

          if (showMarkers) {
            map.addSource("route-endpoints", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: [
                  { type: "Feature", properties: { kind: "start" }, geometry: { type: "Point", coordinates: coords[0]! } },
                  {
                    type: "Feature",
                    properties: { kind: "end" },
                    geometry: { type: "Point", coordinates: coords[coords.length - 1]! },
                  },
                ],
              },
            });
            map.addLayer({
              id: "route-endpoints-circles",
              type: "circle",
              source: "route-endpoints",
              paint: {
                "circle-radius": strokeWidth * 1.6,
                "circle-color": ["match", ["get", "kind"], "start", "#0ca30c", "#0b0e14"],
                "circle-stroke-color": "#5b9cf6",
                "circle-stroke-width": ["match", ["get", "kind"], "start", 0, strokeWidth * 0.8],
              },
            });
          }

          // Dessin progressif : révèle les coordonnées point par point plutôt
          // que d'un coup — équivalent du stroke-dashoffset SVG, MapLibre
          // n'ayant pas de primitive de dessin de trait native.
          const source = map.getSource("route") as import("maplibre-gl").GeoJSONSource;
          if (animateDraw) {
            const start = performance.now();
            const step = (now: number) => {
              if (cancelled) return;
              const progress = Math.min(1, (now - start) / DRAW_MS);
              const count = Math.max(2, Math.round(coords.length * progress));
              source.setData(lineFeature(coords.slice(0, count)));
              if (progress < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          } else {
            source.setData(lineFeature(coords));
          }
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
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapTilerKey]);

  // Curseur : suit le survol des graphiques, indépendamment du dessin
  // progressif ci-dessus (effet séparé pour ne pas relancer le chargement
  // de la carte à chaque déplacement de souris).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("route-cursor")) return;
    const source = map.getSource("route-cursor") as import("maplibre-gl").GeoJSONSource;
    if (cursorT == null || points.length === 0) {
      source.setData(EMPTY_FC);
      return;
    }
    const point = points[nearestIndexByT(points, cursorT)]!;
    source.setData(pointFeature([point.lng, point.lat]));
  }, [cursorT, points]);

  // Portion sélectionnée (clic sur un split/tour).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("route-highlight")) return;
    const source = map.getSource("route-highlight") as import("maplibre-gl").GeoJSONSource;
    if (!selection) {
      source.setData(EMPTY_FC);
      return;
    }
    const subset = points
      .filter((p) => p.t >= selection.startT && p.t <= selection.endT)
      .map((p) => [p.lng, p.lat] as [number, number]);
    source.setData(lineFeature(subset));
  }, [selection, points]);

  if (failed) {
    return (
      <SvgRouteMap
        points={points}
        width={1200}
        height={520}
        strokeWidth={strokeWidth}
        showMarkers={showMarkers}
        className={className}
        cursorT={cursorT}
        selection={selection}
      />
    );
  }

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
}

export function RouteMap({
  points,
  mapTilerKey,
  width = 320,
  height = 220,
  strokeWidth = 3,
  showMarkers = true,
  className,
  cursorT,
  selection,
}: {
  /** Série position + temps écoulé, déjà filtrée des points sans coordonnée. */
  points: GeoPoint[];
  /** Clé MapTiler (tuiles, gratuites) — omise ou vide = repli automatique sur le SVG seul. */
  mapTilerKey?: string;
  /** Dimensions du viewBox pour le repli SVG uniquement — sans effet en mode MapLibre, qui remplit son conteneur. */
  width?: number;
  height?: number;
  strokeWidth?: number;
  showMarkers?: boolean;
  className?: string;
  /** Temps écoulé (s) survolé dans les graphiques — affiche un curseur sur la carte. */
  cursorT?: number | null;
  /** Portion sélectionnée (clic sur un split/tour) — surlignée sur le tracé. */
  selection?: MapSelection | null;
}) {
  if (points.length < 2) return null;

  if (mapTilerKey) {
    return (
      <MapLibreRouteMap
        points={points}
        mapTilerKey={mapTilerKey}
        strokeWidth={strokeWidth}
        showMarkers={showMarkers}
        className={className}
        cursorT={cursorT}
        selection={selection}
      />
    );
  }

  return (
    <SvgRouteMap
      points={points}
      width={width}
      height={height}
      strokeWidth={strokeWidth}
      showMarkers={showMarkers}
      className={className}
      cursorT={cursorT}
      selection={selection}
    />
  );
}
