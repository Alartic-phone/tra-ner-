import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Reflète tsconfig.json (`paths: { "@/*": ["./src/*"] }`) — nécessaire
    // dès qu'un fichier testé (ou importé par lui) utilise cet alias, comme
    // src/middleware.ts et les routes sous src/app/.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
