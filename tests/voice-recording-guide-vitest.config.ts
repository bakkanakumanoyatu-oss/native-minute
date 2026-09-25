import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": root } },
  test: {
    environment: "node",
    include: ["tests/voice-recording-guide-web.test.tsx"]
  }
});
