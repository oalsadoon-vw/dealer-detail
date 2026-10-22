import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // The `react-server` resolve condition makes `import "server-only"` a no-op
  // shim so server-only modules (e.g. lib/sources/tekion/client.ts) can be unit
  // tested. See dealerdetail-api-pipeline-build skill gotcha #2.
  resolve: {
    conditions: ["react-server"],
    // Mirror tsconfig paths so modules that import "@/lib/..." load under vitest.
    alias: {
      "@/lib": path.resolve(__dirname, "lib"),
      "@/app": path.resolve(__dirname, "app"),
      "@/components": path.resolve(__dirname, "components"),
    },
  },
  test: {
    environment: "node"
  }
});
