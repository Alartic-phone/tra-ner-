import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { PhotoManifestEntry } from "./photos.ts";

/**
 * Lecture du manifeste écrit par scripts/fetch-photos.ts. Côté serveur
 * uniquement (node:fs) : les pages/composants qui ont besoin d'une photo lui
 * passent le résultat, `lib/photos.ts` reste pur. Validé par Zod comme toute
 * sortie JSON lue par l'app (CLAUDE.md) — un manifeste corrompu ou absent
 * dégrade vers un pack vide, jamais une erreur qui casse la page (R6 : l'app
 * ne casse jamais quand le pack manque).
 */

const photoEntrySchema = z.object({
  id: z.string(),
  moment: z.enum(["aube", "jour", "soir", "nuit"]),
  file1600: z.string(),
  file800: z.string(),
  blurDataUrl: z.string(),
  source: z.enum(["unsplash", "pexels"]),
  sourceUrl: z.string(),
  author: z.string(),
  authorUrl: z.string(),
  license: z.string(),
}) satisfies z.ZodType<PhotoManifestEntry>;

const manifestSchema = z.object({
  generatedAt: z.string(),
  photos: z.array(photoEntrySchema),
});

const manifestPath = resolve(process.cwd(), "public/photos/manifest.json");

export async function readPhotoManifest(): Promise<PhotoManifestEntry[]> {
  try {
    const raw = await readFile(manifestPath, "utf-8");
    const parsed = manifestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.photos;
  } catch {
    return [];
  }
}
