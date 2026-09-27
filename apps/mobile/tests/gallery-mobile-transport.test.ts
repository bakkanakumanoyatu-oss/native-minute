import { describe, expect, it, vi } from "vitest";
import { createMobileGalleryScript, fetchMobileGalleryPractice } from "../src/lib/api";

const practice = { id: "synthetic-one", practiceTextEn: "Synthetic spoken words.", translationJa: null,
  targetSeconds: 60, locale: "en-US", contentHash: "a".repeat(64) };
const script = { currentRevisionId: "60000000-0000-4000-8000-000000000001", archivedAt: null, lockVersion: 1, practiceEpoch: 1,
  id: "22222222-2222-4222-8222-222222222222", title: "Invented title", content: "Synthetic spoken words.",
  targetSeconds: 60, locale: "en-US", createdAt: "2026-09-27T00:00:00.000Z", updatedAt: "2026-09-27T00:00:00.000Z" };

describe("Mobile Gallery transport", () => {
  it("fetches only the requested item over Bearer BFF with no direct Storage URL", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, data: { practice } }));
    const result = await fetchMobileGalleryPractice("https://fixture.test", "test.token", practice.id, { fetchImpl });
    expect(result).toEqual({ kind: "success", practice });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://fixture.test/api/mobile/gallery/synthetic-one/practice");
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test.token");
    expect(init.cache).toBe("no-store");
    expect(url).not.toContain("storage/v1");
  });

  it("creates from the item ID without sending client text", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, data: { script } }, { status: 201 }));
    const result = await createMobileGalleryScript("https://fixture.test", "test.token", practice.id, { fetchImpl });
    expect(result).toEqual({ kind: "success", script });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });
});
