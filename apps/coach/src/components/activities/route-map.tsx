"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { DUR } from "@/lib/motion.ts";

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
 * Le tracé se dessine une seule fois au chargement (DUR.draw, page activité) :
 * départ en vert (--color-ok), arrivée en ambre (--color-signal) — posée
 * seulement une fois le dessin terminé. `prefers-reduced-motion` saute
 * directement au tracé complet.
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
  activeLatLng,
  className,
}: {
  points: LatLng[];
  width: number;
  height: number;
  strokeWidth: number;
  showMarkers: boolean;
  activeLatLng?: LatLng | null;
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
  const active = activeLatLng ? toSvg(project([activeLatLng])[0]!) : null;
  const drawSeconds = prefersReducedMotion() ? 0 : DUR.draw;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ height: "auto" }}
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
        strokeDashoffset={drawSeconds === 0 ? 0 : undefined}
        style={
          drawSeconds === 0
            ? undefined
            : ({
                "--ring-circumference": pathLength,
                animation: `ring-fill ${drawSeconds}s var(--ease-standard) forwards`,
              } as React.CSSProperties)
        }
      />
      {showMarkers ? (
        <>
          <circle cx={start.x} cy={start.y} r={strokeWidth * 1.6} fill="var(--color-ok)" />
          <circle
            cx={end.x}
            cy={end.y}
            r={strokeWidth * 1.6}
            fill="var(--color-signal)"
            style={
              drawSeconds === 0
                ? undefined
                : { opacity: 0, animation: `fade-in var(--duration-fast) var(--ease-standard) ${drawSeconds}s forwards` }
            }
          />
        </>
      ) : null}
      {active ? (
        <circle cx={active.x} cy={active.y} r={strokeWidth * 1.4} fill="var(--color-text)" stroke="var(--color-bg)" strokeWidth={1.5} />
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
  activeLatLng,
  fillParent,
  className,
}: {
  points: LatLng[];
  mapTilerKey: string;
  width: number;
  height: number;
  strokeWidth: number;
  showMarkers: boolean;
  activeLatLng?: LatLng | null;
  /** Remplit le conteneur parent (classe CSS, ex. h-[45vh]) au lieu de `width`×`height` en pixels — page activité. */
  fillParent?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const activeMarkerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const mapglRef = useRef<typeof import("maplibre-gl") | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);

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
        mapglRef.current = maplibregl;

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
        mapRef.current = map;

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
            data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
          });
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#5b9cf6", "line-width": 3 },
          });

          const startMarker = new maplibregl.Marker({ color: "#0ca30c" }).setLngLat(coords[0]!).addTo(map);
          let endMarker: import("maplibre-gl").Marker | undefined;

          const setCoords = (upTo: number) => {
            const source = map!.getSource("route") as import("maplibre-gl").GeoJSONSource;
            source.setData({
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: coords.slice(0, upTo) },
            });
          };

          const finish = () => {
            setCoords(coords.length);
            if (showMarkers && !endMarker) {
              endMarker = new maplibregl.Marker({ color: "#f5a524" })
                .setLngLat(coords[coords.length - 1]!)
                .addTo(map!);
            }
          };

          if (prefersReducedMotion() || coords.length < 2) {
            finish();
          } else {
            const durationMs = DUR.draw * 1000;
            const start = performance.now();
            const tick = (now: number) => {
              if (cancelled) return;
              const progress = Math.min(1, (now - start) / durationMs);
              setCoords(Math.max(2, Math.round(progress * coords.length)));
              if (progress < 1) requestAnimationFrame(tick);
              else finish();
            };
            requestAnimationFrame(tick);
          }

          if (!showMarkers) startMarker.remove();
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
      activeMarkerRef.current?.remove();
      activeMarkerRef.current = null;
      mapRef.current = null;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapTilerKey]);

  // Marqueur du curseur synchronisé avec les graphiques — séparé de l'effet
  // de montage ci-dessus, qui ne doit tourner qu'une fois.
  useEffect(() => {
    const maplibregl = mapglRef.current;
    const map = mapRef.current;
    if (!maplibregl || !map || failed) return;

    if (activeLatLng) {
      if (!activeMarkerRef.current) {
        const el = document.createElement("div");
        el.style.width = "10px";
        el.style.height = "10px";
        el.style.borderRadius = "50%";
        el.style.background = "var(--color-text)";
        el.style.border = "2px solid var(--color-bg)";
        activeMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([activeLatLng[1], activeLatLng[0]])
          .addTo(map);
      } else {
        activeMarkerRef.current.setLngLat([activeLatLng[1], activeLatLng[0]]);
      }
    } else if (activeMarkerRef.current) {
      activeMarkerRef.current.remove();
      activeMarkerRef.current = null;
    }
  }, [activeLatLng, failed]);

  if (failed) {
    return (
      <SvgRouteMap
        points={points}
        width={width}
        height={height}
        strokeWidth={strokeWidth}
        showMarkers={showMarkers}
        activeLatLng={activeLatLng}
        className={className}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={
        fillParent
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
  activeLatLng,
  fillParent,
  className,
}: {
  latlng: ReadonlyArray<LatLng | null>;
  /** Clé MapTiler (tuiles, gratuites) — omise ou vide = repli automatique sur le SVG seul. */
  mapTilerKey?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  showMarkers?: boolean;
  /** Position à surligner, synchronisée avec le survol des graphiques. */
  activeLatLng?: LatLng | null;
  /** Remplit le conteneur parent au lieu de `width`×`height` en pixels — page activité (45vh/30vh). */
  fillParent?: boolean;
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
        activeLatLng={activeLatLng}
        fillParent={fillParent}
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
      activeLatLng={activeLatLng}
      className={className}
    />
  );
}
