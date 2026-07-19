import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

describe("Web and mobile session coexistence", () => {
  it("keeps normal Web logout local and omits raw provider detail", () => {
    const route = readFileSync(
      resolve(REPOSITORY_ROOT, "app/api/auth/sign-out/route.ts"),
      "utf8"
    );

    expect(route).toContain('supabase.auth.signOut({ scope: "local" })');
    expect(route).not.toContain("error.message");
  });
});
