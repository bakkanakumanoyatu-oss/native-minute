import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  define: {
    __MOBILE_PROFILE__: JSON.stringify("local-spike"),
    __BFF_BASE_URL__: JSON.stringify("https://native-minute.vercel.app")
  },
  resolve: {
    alias: {
      "@": repositoryRoot
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    reporters: ["default"]
  }
});
