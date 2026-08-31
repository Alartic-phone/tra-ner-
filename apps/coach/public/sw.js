// Service worker minimal — écrit à la main, pas de next-pwa : le besoin tient
// en deux règles, une dépendance de plus n'aurait rien simplifié.
//
// Règle absolue : jamais les pages ni les données. Une page HTML, un flux RSC
// ou un appel /api/* doivent toujours atteindre le réseau — les mettre en
// cache reviendrait à afficher un état de poste, un plan ou une séance
// périmé sans le dire, ce que le reste de l'application s'interdit. Seuls les
// fichiers statiques (JS/CSS compilés, icônes, manifest, worker MapLibre) et
// le style de carte MapTiler (rarement modifié, coûteux à retélécharger sur
// une connexion de sortie de poste) sont mis en cache, en cache-first.
//
// Bump CACHE_VERSION à chaque changement de cette liste ou du comportement.
const CACHE_VERSION = "coach-static-v1";

const STATIC_PATHS = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/maplibre-gl-worker.mjs",
  "/maplibre-gl-shared.mjs",
];

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return url.pathname.startsWith("/_next/static/") || STATIC_PATHS.includes(url.pathname);
}

function isMapStyle(url) {
  // Style vectoriel + tuiles MapTiler : rendu de la carte de tracé GPS.
  return url.hostname === "api.maptiler.com";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_PATHS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigations (pages), RSC et /api/* : jamais interceptés, toujours frais.
  if (!isStaticAsset(url) && !isMapStyle(url)) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      // `no-store`/opaque cross-origin restent cachables ici : la carte n'a
      // pas besoin de lire le contenu, seulement de le rejouer plus vite.
      if (response.ok || response.type === "opaque") {
        cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
