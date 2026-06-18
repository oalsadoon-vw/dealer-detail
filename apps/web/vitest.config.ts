import { defineConfig } from "vitest/config";

export default defineConfig({
  // The `react-server` resolve condition makes `import "server-only"` a no-op
  // shim so server-only modules (e.g. lib/sources/tekion/client.ts) can be unit
  // tested. See dealerdetail-api-pipeline-build skill gotcha #2.
  resolve: {
    conditions: ["react-server"]
  },
  test: {
    environment: "node"
  }
});


