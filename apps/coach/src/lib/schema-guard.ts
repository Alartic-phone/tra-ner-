import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";

/**
 * Garde-fou de démarrage contre un client Prisma périmé.
 *
 * Chaque worktree/checkout a son propre `node_modules`, jamais partagé ni
 * suivi par git : un `prisma generate` oublié après une migration laisse un
 * client qui ignore silencieusement les nouveaux champs. Le 05/09/2026,
 * cette dérive a coûté les tours d'une vraie activité — `deleteMany` avait
 * déjà réussi quand `createMany` a échoué sur `isManual`, un champ que ce
 * client-là ne connaissait pas. La découverte doit avoir lieu ICI, avant
 * toute écriture, jamais au milieu d'une transaction de remplacement.
 */

export type SchemaModels = Map<string, Set<string>>;

/** Modèle et champs tels que le client Prisma généré les connaît réellement. */
export type DmmfModel = { name: string; fields: ReadonlyArray<{ name: string }> };

/**
 * Extrait, pour chaque `model` du schema.prisma, l'ensemble des noms de
 * champs qu'il déclare. Analyse volontairement légère (regex) : suffisante
 * pour ce schéma, qui n'utilise ni enum ni type composite (portabilité
 * SQLite → PostgreSQL, cf. CLAUDE.md) — un champ par ligne.
 */
export function extractSchemaFields(schemaText: string): SchemaModels {
  const models: SchemaModels = new Map();
  const modelRe = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = modelRe.exec(schemaText))) {
    const [, name, body] = match;
    if (!name || !body) continue;
    const fields = new Set<string>();
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const fieldName = line.match(/^(\w+)\s+\S/)?.[1];
      if (fieldName) fields.add(fieldName);
    }
    models.set(name, fields);
  }
  return models;
}

/** Écarts entre ce que schema.prisma déclare et ce que le client connaît —
 * vide si le client est à jour. */
export function findSchemaDrift(
  schemaModels: SchemaModels,
  clientModels: readonly DmmfModel[],
): Array<{ model: string; field: string }> {
  const clientFieldsByModel = new Map(
    clientModels.map((m) => [m.name, new Set(m.fields.map((f) => f.name))]),
  );
  const drift: Array<{ model: string; field: string }> = [];
  for (const [model, fields] of schemaModels) {
    const known = clientFieldsByModel.get(model);
    for (const field of fields) {
      if (!known || !known.has(field)) drift.push({ model, field });
    }
  }
  return drift;
}

/** Partie pure, testable sans client Prisma réel. Lève si un champ déclaré
 * dans schema.prisma est absent du client généré. */
export function assertNoSchemaDrift(schemaText: string, clientModels: readonly DmmfModel[]): void {
  const drift = findSchemaDrift(extractSchemaFields(schemaText), clientModels);
  if (drift.length > 0) {
    const details = drift.map((d) => `${d.model}.${d.field}`).join(", ");
    throw new Error(
      `Client Prisma périmé par rapport à schema.prisma : ${details}. ` +
        `Lancer "npx prisma generate" dans ce worktree avant de continuer.`,
    );
  }
}

/** Câblage réel : lit schema.prisma sur disque, compare au client importé. */
export function assertPrismaClientIsCurrent(): void {
  const schemaPath = new URL("../../prisma/schema.prisma", import.meta.url);
  const schemaText = readFileSync(schemaPath, "utf8");
  assertNoSchemaDrift(schemaText, Prisma.dmmf.datamodel.models);
}
