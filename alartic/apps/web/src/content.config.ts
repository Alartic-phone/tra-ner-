import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Content collections — ALARTIC
 *
 * Source : fichiers Markdown sous content/ à la racine de apps/web/.
 * Les schemas Zod ci-dessous valident le frontmatter au build.
 * Toute incohérence (champ manquant, type incorrect) casse la CI.
 */

/* ───────── Produits ───────── */
const productColor = z.object({
  slug: z.string(),
  name: z.string(),
  hex: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "Couleur hex invalide"),
  frontImage: z.string().startsWith("/"),
  rearImage: z.string().startsWith("/").optional(),
});

const productStorage = z.object({
  slug: z.string(),
  label: z.string(),
  price: z.number().positive(),
  payplugUrl: z.string().url().optional(),
});

const productSpec = z.object({
  label: z.string(),
  value: z.string(),
});

const products = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./content/products" }),
  schema: z.object({
    title: z.string(),
    name: z.string(),
    shortDescription: z.string(),
    series: z.enum(["pixel-9", "pixel-10", "tablet"]),
    format: z.enum(["phone", "fold", "tablet"]),
    available: z.boolean().default(true),
    order: z.number().int(),
    stock: z.number().int().nonnegative().optional(),
    colors: z.array(productColor).min(1),
    storages: z.array(productStorage).min(1),
    included: z.array(z.string()).min(1),
    warranty: z.string(),
    specs: z.array(productSpec).min(1),
  }),
});

/* ───────── FAQ ───────── */
const faq = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./content/faq" }),
  schema: z.object({
    question: z.string(),
    category: z.enum([
      "general",
      "commande",
      "livraison",
      "sav",
      "garantie",
      "technique",
      "privacy",
    ]),
    order: z.number().int(),
  }),
});

export const collections = { products, faq };
