import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const AASA_PATH = "public/.well-known/apple-app-site-association";
const STAGING_APPLICATION_IDENTIFIER =
  "46P9QD3T3Q.com.nativeminutes.app.staging";
const CALLBACK_PATH = "/mobile/auth/callback";

function readAasa() {
  return JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, AASA_PATH), "utf8"));
}

describe("staging apple-app-site-association", () => {
  it("contains only the exact staging app and callback component", () => {
    expect(readAasa()).toEqual({
      applinks: {
        details: [
          {
            appIDs: [STAGING_APPLICATION_IDENTIFIER],
            components: [{ "/": CALLBACK_PATH }]
          }
        ]
      }
    });
  });

  it("uses the extensionless well-known path and an explicit JSON response header", () => {
    const nextConfig = readFileSync(resolve(REPOSITORY_ROOT, "next.config.mjs"), "utf8");

    expect(AASA_PATH.endsWith("apple-app-site-association")).toBe(true);
    expect(AASA_PATH.endsWith(".json")).toBe(false);
    expect(nextConfig).toContain('source: "/.well-known/apple-app-site-association"');
    expect(nextConfig).toContain('value: "application/json"');
    expect(nextConfig).not.toMatch(/redirects\s*\(|rewrites\s*\(/);
  });
});
