import { describe, expect, it } from "vitest";
import { assertNoSchemaDrift, extractSchemaFields, findSchemaDrift } from "./schema-guard.ts";

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
