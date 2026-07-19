import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  define: {
    __MOBILE_PROFILE__: JSON.stringify("local-spike"),
    __BFF_BASE_URL__: JSON.stringify("https://native-minute.vercel.app"),
    __SUPABASE_URL__: JSON.stringify("https://auth.example"),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify("sb_publishable_fixture_value_1234567890"),
    __AUTH_CALLBACK_URI__: JSON.stringify("com.nativeminutes.app.debug://auth/callback")
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
