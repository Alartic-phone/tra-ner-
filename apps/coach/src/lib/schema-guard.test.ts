import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertNoSchemaDrift,
  assertPrismaClientIsCurrent,
  extractSchemaFields,
  findSchemaDrift,
} from "./schema-guard.ts";

const SCHEMA = `
model Lap {
  id         String   @id @default(cuid())
  activityId String
  activity   Activity @relation(fields: [activityId], references: [id])

  lapIndex Int
  isManual Boolean @default(false)

  @@unique([activityId, lapIndex])
}

model Activity {
  id   String @id @default(cuid())
  name String
}
`;

describe("extractSchemaFields", () => {
  it("liste les champs déclarés par modèle, sans les lignes @@", () => {
    const models = extractSchemaFields(SCHEMA);
    expect([...models.get("Lap")!].sort()).toEqual(
      ["activity", "activityId", "id", "isManual", "lapIndex"].sort(),
    );
    expect([...models.get("Activity")!].sort()).toEqual(["id", "name"]);
  });
});

describe("findSchemaDrift / assertNoSchemaDrift", () => {
  it("ne signale rien quand le client connaît tous les champs déclarés", () => {
    const clientModels = [
      { name: "Lap", fields: [{ name: "id" }, { name: "activityId" }, { name: "activity" }, { name: "lapIndex" }, { name: "isManual" }] },
      { name: "Activity", fields: [{ name: "id" }, { name: "name" }] },
    ];
    expect(findSchemaDrift(extractSchemaFields(SCHEMA), clientModels)).toEqual([]);
    expect(() => assertNoSchemaDrift(SCHEMA, clientModels)).not.toThrow();
  });

  it("détecte exactement le scénario du 05/09 : isManual déclaré, absent du client généré", () => {
    const staleClientModels = [
      // Client généré avant la migration qui a ajouté isManual.
      { name: "Lap", fields: [{ name: "id" }, { name: "activityId" }, { name: "activity" }, { name: "lapIndex" }] },
      { name: "Activity", fields: [{ name: "id" }, { name: "name" }] },
    ];
    const drift = findSchemaDrift(extractSchemaFields(SCHEMA), staleClientModels);
    expect(drift).toEqual([{ model: "Lap", field: "isManual" }]);
    expect(() => assertNoSchemaDrift(SCHEMA, staleClientModels)).toThrow(/Lap\.isManual/);
    expect(() => assertNoSchemaDrift(SCHEMA, staleClientModels)).toThrow(/prisma generate/);
  });

  it("détecte un modèle entièrement absent du client", () => {
    const clientModels = [{ name: "Activity", fields: [{ name: "id" }, { name: "name" }] }];
    expect(() => assertNoSchemaDrift(SCHEMA, clientModels)).toThrow(/Lap\./);
  });
});

/**
 * Test verrou du câblage réel (`assertPrismaClientIsCurrent`), pas seulement
 * de la partie pure : c'est la résolution du chemin de schema.prisma qui a
 * cassé sous Webpack (07/09/2026, cf. le commentaire du fichier source), pas
 * `assertNoSchemaDrift`. `projectRoot` est le seul paramètre injectable,
 * réservé au test — le code applicatif appelle toujours la fonction sans
 * argument et reçoit `process.cwd()`.
 */
describe("assertPrismaClientIsCurrent (câblage réel : lecture disque + client Prisma réel)", () => {
  let tmpRoot: string | undefined;

  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it("lit schema.prisma sur disque et détecte une dérive contre le client Prisma généré réel", () => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "schema-guard-drift-"));
    mkdirSync(path.join(tmpRoot, "prisma"));
    // Modèle et champ inventés : garantis absents du client généré réel,
    // donc détectés en dérive quel que soit le schéma applicatif du moment.
    writeFileSync(
      path.join(tmpRoot, "prisma", "schema.prisma"),
      "model SchemaGuardCanary {\n  id     String  @id\n  leaked Boolean\n}\n",
    );

    expect(() => assertPrismaClientIsCurrent(tmpRoot!)).toThrow(/SchemaGuardCanary\.leaked/);
  });

  it("lève une erreur explicite quand schema.prisma est introuvable, jamais un passage silencieux", () => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "schema-guard-missing-"));
    // Pas de sous-dossier prisma/ : le fichier attendu n'existe pas.

    expect(() => assertPrismaClientIsCurrent(tmpRoot!)).toThrow(/Garde-fou de schéma inopérant/);
  });
});
