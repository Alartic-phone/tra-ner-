import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildZip, crc32 } from "./zip.ts";

describe("crc32", () => {
  it("correspond au vecteur de test standard 'check value'", () => {
    // Vecteur de test canonique de CRC-32 (ISO 3309) : crc32("123456789") = 0xCBF43926.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("crc32 d'une chaîne vide est 0", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("buildZip", () => {
  it("commence par la signature de fichier local ZIP", () => {
    const zip = buildZip([{ name: "a.txt", content: "hello" }]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
  });

  it("est déterministe : deux constructions du même contenu sont identiques octet à octet", () => {
    const entries = [
      { name: "a.csv", content: "x,y\n1,2\n" },
      { name: "b.csv", content: "z\n3\n" },
    ];
    expect(buildZip(entries)).toEqual(buildZip(entries));
  });

  it("produit une archive lisible par l'outil système unzip, contenu préservé", () => {
    let unzipAvailable = true;
    try {
      execFileSync("which", ["unzip"]);
    } catch {
      unzipAvailable = false;
    }
    if (!unzipAvailable) return; // Outil absent de l'environnement : test sauté plutôt qu'en échec.

    const dir = mkdtempSync(join(tmpdir(), "coach-zip-test-"));
    const zipPath = join(dir, "out.zip");
    const zip = buildZip([
      { name: "activites.csv", content: "id,distance\n1,1000\n" },
      { name: "sante.csv", content: "day,hrv\n2026-01-01,50\n" },
    ]);
    writeFileSync(zipPath, zip);

    const activites = execFileSync("unzip", ["-p", zipPath, "activites.csv"]).toString("utf-8");
    expect(activites).toBe("id,distance\n1,1000\n");

    const listing = execFileSync("unzip", ["-l", zipPath]).toString("utf-8");
    expect(listing).toContain("activites.csv");
    expect(listing).toContain("sante.csv");

    const santeContent = readFileSync(zipPath); // sanity: le fichier a bien été écrit
    expect(santeContent.length).toBeGreaterThan(0);
  });
});
