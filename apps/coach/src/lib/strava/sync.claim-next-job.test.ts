// Test verrou : deux exécutions concurrentes de runSyncWorker (webhook et
// bouton, deux clics rapprochés, cron et bouton…) ne doivent jamais pouvoir
// gagner la même tâche de la file — sans quoi elle serait traitée deux fois
// (double appel Strava, double écriture). Base SQLite jetable, jamais la
// vraie base de dev — claimNextJob() prend un client injecté pour ça, voir
// sync.ts.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimNextJob } from "./sync.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");

let dir: string;
let client: PrismaClient;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coach-claim-next-job-test-"));
  const dbPath = path.join(dir, "test.db");
  const url = `file:${dbPath}`;

  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  client = new PrismaClient({ datasourceUrl: url });
}, 30_000);

afterAll(async () => {
  await client.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("claimNextJob (prise atomique de la file)", () => {
  it("une seule des deux prises concurrentes gagne une tâche donnée", async () => {
    const job = await client.syncJob.create({
      data: { kind: "incremental", payloadJson: "{}" },
    });

    const [first, second] = await Promise.all([
      claimNextJob(client),
      claimNextJob(client),
    ]);

    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["claimed", "lost"]);

    const claimed = first.outcome === "claimed" ? first : second;
    if (claimed.outcome !== "claimed") throw new Error("unreachable");
    expect(claimed.job.id).toBe(job.id);

    // La tâche n'a été marquée "running" (ni ses tentatives incrémentées)
    // qu'une seule fois, pas deux.
    const row = await client.syncJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("running");
    expect(row.attempts).toBe(1);
  });

  it("ne réclame rien quand la file est vide", async () => {
    await client.syncJob.deleteMany({});
    const result = await claimNextJob(client);
    expect(result.outcome).toBe("empty");
  });
});
