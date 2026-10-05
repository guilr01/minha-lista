import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/apoio/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/db/setup-global.ts"],
    // Os testes de banco compartilham um banco: um arquivo por vez.
    fileParallelism: false,
  },
});
