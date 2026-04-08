import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      vscode: resolve(__dirname, "tests/mocks/vscode.ts")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      enabled: false
    }
  }
});
