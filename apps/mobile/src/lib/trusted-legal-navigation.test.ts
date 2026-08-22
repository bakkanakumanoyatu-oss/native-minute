import { describe, expect, it, vi } from "vitest";
import { mobileEnvironment } from "./environment";
import {
  openTrustedLegalPage,
  resolveTrustedLegalPageUrl
} from "./trusted-legal-navigation";

describe("trusted legal navigation", () => {
  it.each([
    ["privacy", "/privacy"],
    ["terms", "/terms"],
    ["support", "/support"],
    ["accountDeletionInfo", "/support/account-deletion"]
  ] as const)("resolves %s only on the canonical BFF origin", (page, pathname) => {
    const target = new URL(resolveTrustedLegalPageUrl(page));

    expect(target.origin).toBe(mobileEnvironment.bffBaseUrl);
    expect(target.pathname).toBe(pathname);
    expect(target.search).toBe("");
    expect(target.hash).toBe("");
    expect(target.username).toBe("");
    expect(target.password).toBe("");
  });

  it("does not provide an arbitrary URL opening API", async () => {
    const browser = { open: vi.fn(async () => undefined) };

    expect(() => resolveTrustedLegalPageUrl("https://attacker.example" as never)).toThrow("Unknown trusted legal page");
    await openTrustedLegalPage("privacy", browser);

    expect(browser.open).toHaveBeenCalledWith({ url: resolveTrustedLegalPageUrl("privacy") });
  });
});
