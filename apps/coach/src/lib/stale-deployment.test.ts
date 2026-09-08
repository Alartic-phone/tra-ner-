import { describe, expect, it } from "vitest";
import { isStaleDeploymentError } from "./stale-deployment.ts";

describe("isStaleDeploymentError", () => {
  it("reconnaît un ChunkLoadError", () => {
    const error = new Error("Loading chunk 42 failed");
    error.name = "ChunkLoadError";
    expect(isStaleDeploymentError(error)).toBe(true);
  });

  it("reconnaît le message Next.js de Server Action introuvable", () => {
    const error = new Error(
      'Failed to find Server Action "abc123". This request might be from an older or newer deployment.',
    );
    expect(isStaleDeploymentError(error)).toBe(true);
  });

  it("ignore une erreur applicative normale", () => {
    expect(isStaleDeploymentError(new Error("Distance négative"))).toBe(false);
  });

  it("ignore une valeur qui n'est pas une Error", () => {
    expect(isStaleDeploymentError("boom")).toBe(false);
    expect(isStaleDeploymentError(null)).toBe(false);
  });
});
