import { describe, expect, it } from "vitest";
import { selectedStoredExcerpt } from "../../../lib/gallery/range-selection";
import { getScriptLength } from "../../../lib/script-length";

describe("stored Gallery range selection", () => {
  it("returns the exact stored contiguous text across CRLF and emoji", () => {
    const stored = "First 😀 line\r\nSecond line";
    const normalized = stored.replace(/\r\n/gu, "\n");
    const start = normalized.indexOf("😀");
    const end = normalized.length;
    expect(selectedStoredExcerpt(stored, start, end)).toBe("😀 line\r\nSecond line");
    expect(stored.includes(selectedStoredExcerpt(stored, start, end))).toBe(true);
    expect(selectedStoredExcerpt(stored, start + 1, end)).toBe("");
  });
  it("keeps long stored text while enforcing only the chosen script range", () => {
    const stored = "word ".repeat(300);
    expect(getScriptLength(stored).exceedsLimit).toBe(true);
    const selected = selectedStoredExcerpt(stored, 0, 5 * 20);
    expect(selected).toBe("word ".repeat(20));
    expect(getScriptLength(selected).exceedsLimit).toBe(false);
  });
});
