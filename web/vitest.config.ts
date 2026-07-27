import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // server-only — no-op в тестах (react-server condition не выставлен).
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
  // JSX automatic runtime — component/hook-тесты (React Testing Library,
  // спека 0014) рендерят .tsx без ручного `import React` (tsconfig здесь
  // "preserve" для Next.js, esbuild-транспайлер Vitest иначе бы требовал
  // React в скоупе, спека 0014 T9/T10).
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
