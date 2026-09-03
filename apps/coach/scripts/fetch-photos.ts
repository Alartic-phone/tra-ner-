/**
 * Télécharge UNE FOIS le pack de photos d'ambiance (paysages, jamais de
 * personne) et le verse dans public/photos, où il est ensuite versionné :
 * l'app ne fait plus aucune requête réseau vers Unsplash/Pexels à
 * l'exécution (règle R6 du CLAUDE.md de ce dossier).
 *
 * Idempotent : relancé, ne retélécharge que ce qui manque au regard de
 * public/photos/manifest.json. Supprimer une entrée du manifeste (et son
 * fichier) puis relancer le script la remplace.
 *
 *   npm run photos:fetch
 *
 * Nécessite UNE clé, dans apps/coach/.env.local (jamais commitée) :
 *   UNSPLASH_ACCESS_KEY=...   (https://unsplash.com/developers, gratuit)
 *   PEXELS_API_KEY=...       (https://www.pexels.com/api/, gratuit)
 * Unsplash est essayé en priorité si les deux sont présentes.
 *
 * Les requêtes de recherche visent des paysages (sentier, brume, montagne,
 * rivière, route de campagne, lumière rasante) mais aucune API de recherche
 * d'image ne garantit "zéro personne" : après un premier lancement, relire
 * manifest.json et les fichiers, et remplacer à la main (supprimer l'entrée
 * + relancer) toute photo qui montre quelqu'un.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Fichier absent : ignoré, comme pour les autres scripts du dossier.
  }
}

const MOMENTS = ["aube", "jour", "soir", "nuit"] as const;
type Moment = (typeof MOMENTS)[number];

const PHOTOS_PER_MOMENT = 6;

/**
 * Termes de recherche par moment. Toujours des paysages — jamais "runner",
 * "athlete", "person" : dans une app perso, un athlète anonyme sonne faux,
 * un paysage est une atmosphère, il ne prétend pas être moi (CLAUDE.md).
 */
const QUERIES: Record<Moment, string[]> = {
  aube: ["misty sunrise landscape", "dawn mountain trail", "foggy morning countryside"],
  jour: ["mountain trail daylight", "countryside road landscape", "river valley clear sky"],
  soir: ["golden hour landscape", "sunset countryside road", "evening light mountains"],
  nuit: ["night landscape mountains", "starry sky countryside", "night fog forest trail"],
};

type ManifestEntry = {
  id: string;
  moment: Moment;
  file1600: string;
  file800: string;
  blurDataUrl: string;
  source: "unsplash" | "pexels";
  sourceUrl: string;
  author: string;
  authorUrl: string;
  license: string;
};

type Manifest = {
  generatedAt: string;
  photos: ManifestEntry[];
};

const publicDir = resolve(import.meta.dirname, "../public/photos");
const manifestPath = resolve(publicDir, "manifest.json");

function readManifest(): Manifest {
  if (!existsSync(manifestPath)) return { generatedAt: new Date().toISOString(), photos: [] };
  return JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
}

function writeManifest(manifest: Manifest): void {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

type RawCandidate = {
  id: string;
  downloadUrl: string;
  sourceUrl: string;
  author: string;
  authorUrl: string;
};

async function searchUnsplash(query: string, count: number, key: string): Promise<RawCandidate[]> {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", String(count));
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
  if (!res.ok) throw new Error(`Unsplash ${res.status} pour "${query}"`);
  const data = (await res.json()) as {
    results: Array<{
      id: string;
      urls: { raw: string };
      links: { html: string };
      user: { name: string; links: { html: string } };
    }>;
  };
  return data.results.map((r) => ({
    id: `unsplash-${r.id}`,
    downloadUrl: `${r.urls.raw}&w=1600&h=900&fit=crop&q=85`,
    sourceUrl: r.links.html,
    author: r.user.name,
    authorUrl: r.user.links.html,
  }));
}

async function searchPexels(query: string, count: number, key: string): Promise<RawCandidate[]> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", String(count));
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status} pour "${query}"`);
  const data = (await res.json()) as {
    photos: Array<{
      id: number;
      src: { large2x: string };
      url: string;
      photographer: string;
      photographer_url: string;
    }>;
  };
  return data.photos.map((p) => ({
    id: `pexels-${p.id}`,
    downloadUrl: p.src.large2x,
    sourceUrl: p.url,
    author: p.photographer,
    authorUrl: p.photographer_url,
  }));
}

async function main(): Promise<void> {
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!unsplashKey && !pexelsKey) {
    console.error(
      "Aucune clé trouvée. Ajouter UNSPLASH_ACCESS_KEY ou PEXELS_API_KEY dans " +
        "apps/coach/.env.local (voir l'en-tête de ce script pour où l'obtenir).",
    );
    process.exitCode = 1;
    return;
  }
  const source: "unsplash" | "pexels" = unsplashKey ? "unsplash" : "pexels";

  mkdirSync(publicDir, { recursive: true });
  for (const moment of MOMENTS) mkdirSync(resolve(publicDir, moment), { recursive: true });

  const manifest = readManifest();

  for (const moment of MOMENTS) {
    const existing = manifest.photos.filter((p) => p.moment === moment);
    const missing = PHOTOS_PER_MOMENT - existing.length;
    if (missing <= 0) {
      console.log(`${moment} : déjà complet (${existing.length}/${PHOTOS_PER_MOMENT}).`);
      continue;
    }

    const knownIds = new Set(existing.map((p) => p.id));
    const candidates: RawCandidate[] = [];
    for (const query of QUERIES[moment]) {
      if (candidates.length >= missing * 2) break;
      const results = unsplashKey
        ? await searchUnsplash(query, 10, unsplashKey)
        : await searchPexels(query, 10, pexelsKey!);
      for (const r of results) {
        if (!knownIds.has(r.id) && !candidates.some((c) => c.id === r.id)) candidates.push(r);
      }
    }

    const toDownload = candidates.slice(0, missing);
    if (toDownload.length < missing) {
      console.warn(
        `${moment} : seulement ${toDownload.length}/${missing} candidat(e)s trouvé(e)s — relancer plus tard complètera.`,
      );
    }

    for (const candidate of toDownload) {
      console.log(`${moment} : téléchargement ${candidate.id}…`);
      const res = await fetch(candidate.downloadUrl);
      if (!res.ok) {
        console.warn(`  échec (${res.status}), ignoré.`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());

      const base = sharp(buffer).resize(1600, 900, { fit: "cover" });
      const file1600 = `${moment}/${candidate.id}-1600.webp`;
      const file800 = `${moment}/${candidate.id}-800.webp`;
      await base.clone().webp({ quality: 82 }).toFile(resolve(publicDir, file1600));
      await sharp(buffer)
        .resize(800, 450, { fit: "cover" })
        .webp({ quality: 80 })
        .toFile(resolve(publicDir, file800));

      const blurBuffer = await sharp(buffer)
        .resize(20, 12, { fit: "cover" })
        .webp({ quality: 40 })
        .toBuffer();
      const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString("base64")}`;

      manifest.photos.push({
        id: candidate.id,
        moment,
        file1600,
        file800,
        blurDataUrl,
        source,
        sourceUrl: candidate.sourceUrl,
        author: candidate.author,
        authorUrl: candidate.authorUrl,
        license: source === "unsplash" ? "Unsplash License" : "Pexels License",
      });
      manifest.generatedAt = new Date().toISOString();
      writeManifest(manifest);
    }
  }

  const total = manifest.photos.length;
  console.log(`Terminé : ${total}/${MOMENTS.length * PHOTOS_PER_MOMENT} photos dans le manifeste.`);
  if (total < MOMENTS.length * PHOTOS_PER_MOMENT) {
    console.log("Relancer le script pour compléter ce qui manque.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
