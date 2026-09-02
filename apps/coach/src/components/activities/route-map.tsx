"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { computeTracePath } from "@/lib/trace.ts";

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

function SvgRouteMap({
  points,
  width,
  height,
  strokeWidth,
  showMarkers,
  highlight,
  fill = false,
  drawMs = 900,
  className,
}: {
  points: LatLng[];
  width: number;
  height: number;
  strokeWidth: number;
  showMarkers: boolean;
  /** Position survolée dans les graphiques synchronisés — `null` = aucun survol en cours. */
  highlight?: LatLng | null;
  /** Remplit le cadre du conteneur (recadré, façon `object-fit: cover`) plutôt
   * que de dicter sa propre hauteur selon le ratio du tracé — pour le héros
   * de la page activité, dont le cadre est fixé en `vh` par la page. */
  fill?: boolean;
  /** Durée du tracé qui se dessine, en ms. */
  drawMs?: number;
  className?: string;
}) {
  const trace = computeTracePath(points, { width, height, strokeWidth, maxPoints: 500 });
  if (!trace) return null;

  const start = trace.projectPoint(points[0]!);
  const end = trace.projectPoint(points[points.length - 1]!);
  const highlightPoint = highlight ? trace.projectPoint(highlight) : null;

  return (
    <svg
      viewBox={trace.viewBox}
      width="100%"
      height={fill ? "100%" : undefined}
      preserveAspectRatio={fill ? "xMidYMid slice" : undefined}
      style={fill ? undefined : { height: "auto" }}
      className={className}
    >
      <path
        d={trace.pathD}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={trace.pathLength}
        strokeDashoffset={0}
        style={
          {
            "--ring-circumference": trace.pathLength,
            animation: `ring-fill ${drawMs}ms var(--ease-standard) forwards`,
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
            stroke="var(--color-accent)"
            strokeWidth={strokeWidth * 0.8}
          />
        </>
      ) : null}
      {highlightPoint ? (
        <circle
          cx={highlightPoint.x}
          cy={highlightPoint.y}
          r={strokeWidth * 2.2}
          fill="var(--color-text)"
          stroke="var(--color-bg)"
          strokeWidth={strokeWidth * 0.6}
        />
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
  highlight,
  fill = false,
  className,
}: {
  points: LatLng[];
  mapTilerKey: string;
  width: number;
  height: number;
  strokeWidth: number;
  showMarkers: boolean;
  /** NON supporté sur le fond de carte MapLibre (limitation connue) : le
   * marqueur de survol synchronisé n'existe que sur le repli SVG, qui est
   * de toute façon le rendu par défaut sans clé MapTiler configurée. */
  highlight?: LatLng | null;
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
            paint: { "line-color": "#5b9cf6", "line-width": 3 },
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
        highlight={highlight}
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
  highlight = null,
  fill = false,
  drawMs = 900,
  className,
}: {
  latlng: ReadonlyArray<LatLng | null>;
  /** Clé MapTiler (tuiles, gratuites) — omise ou vide = repli automatique sur le SVG seul. */
  mapTilerKey?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  showMarkers?: boolean;
  /** Position survolée dans les graphiques synchronisés de la page activité. */
  highlight?: LatLng | null;
  /** Remplit son conteneur (recadré) plutôt que d'imposer son propre ratio —
   * pour un héros plein cadre en hauteur fixée par la page (vh). */
  fill?: boolean;
  /** Durée du tracé qui se dessine, en ms (héros : 1200, vignettes : 900 par défaut). */
  drawMs?: number;
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
        highlight={highlight}
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
      highlight={highlight}
      fill={fill}
      drawMs={drawMs}
      className={className}
    />
  );
}
