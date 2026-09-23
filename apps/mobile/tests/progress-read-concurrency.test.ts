import { describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "../../../lib/supabase/client";
import { getProgressOverview } from "../../../services/progress";

vi.mock("server-only", () => ({}));

type Result = { data: unknown[] | null; error: { message: string } | null };
function fixture() {
  const started: string[] = [];
  const filters: Record<string, Array<[string, unknown]>> = {};
  const resolve: Record<string, (value: Result) => void> = {};
  const client = { from(table: string) {
    filters[table] = [];
    const pending = new Promise<Result>(done => { resolve[table] = done; });
    const query = {
      select(columns: string) { filters[table].push(["select", columns]); return query; },
      eq(column: string, value: unknown) { filters[table].push([column, value]); return query; },
      in(column: string, value: unknown) { filters[table].push([column, value]); return query; },
      order(column: string, options: unknown) { filters[table].push([column, options]); return query; },
      then(fulfilled: (value: Result) => unknown, rejected?: (reason: unknown) => unknown) {
        started.push(table);
        return pending.then(fulfilled, rejected);
      }
    };
    return query;
  } } as unknown as AppSupabaseClient;
  return { client, started, filters, resolve };
}
const flush = () => new Promise<void>(done => setTimeout(done, 0));
const empty: Result = { data: [], error: null };

describe("owned Progress read scheduling", () => {
  it("starts independent reads before the slow Take response while preserving owner filters and empty output", async () => {
    const f = fixture();
    const pending = getProgressOverview(f.client, "owner-A");
    await flush();
    expect(f.started.sort()).toEqual(["coach_feedback", "scripts", "takes", "weak_words"]);
    expect(f.filters.scripts).toContainEqual(["user_id", "owner-A"]);
    expect(f.filters.takes).toEqual(expect.arrayContaining([["user_id", "owner-A"], ["status", ["reviewed", "completed"]]]));
    for (const table of ["weak_words", "coach_feedback"]) {
      expect(f.filters[table]).toContainEqual(["select", "*, takes!inner(user_id)"]);
      expect(f.filters[table]).toContainEqual(["takes.user_id", "owner-A"]);
    }
    for (const table of ["coach_feedback", "weak_words", "scripts", "takes"]) f.resolve[table](empty);
    expect(await pending).toEqual({ scripts: [], totalScripts: 0, totalReviewedTakes: 0, bestTakeCount: 0 });
  });

  it.each(["scripts", "takes", "weak_words", "coach_feedback"])("does not return a partial success when %s fails", async failing => {
    const f = fixture();
    const pending = getProgressOverview(f.client, "owner-A");
    const rejected = expect(pending).rejects.toThrow();
    await flush();
    for (const table of ["scripts", "takes", "weak_words", "coach_feedback"]) {
      f.resolve[table](table === failing ? { data: null, error: { message: "read denied" } } : empty);
    }
    await rejected;
  });

  it("keeps latest/best/history and attached coaching identical when reads complete out of order", async () => {
    const f = fixture();
    const pending = getProgressOverview(f.client, "owner-A");
    await flush();
    const take = (id: string, date: string, score: number) => ({ id, script_id: "script-A", user_id: "owner-A", status: "reviewed", script_revision_id: "60000000-0000-4000-8000-000000000001", created_at: date, reviewed_at: date, score, favorite: id === "older", display_name: null, accuracy_score: score, fluency_score: score, rhythm_score: score, total_words: 2, transcript_text: "Test words", evaluation_strengths_ja: [] });
    f.resolve.coach_feedback({ data: [{ id: "coach", take_id: "older", locale: "ja", title: "title", summary: "summary", bullets: ["tip"], next_step: "next", focus_words: ["words"] }], error: null });
    f.resolve.weak_words({ data: [{ id: "word", take_id: "older", word: "words", score: 70, note: "note" }], error: null });
    f.resolve.scripts({ data: [{current_revision_id: "60000000-0000-4000-8000-000000000001", archived_at: null, lock_version: 1, practice_epoch: 1,  id: "script-A", title: "Saved script", content: "Test words", locale: "en-US", target_seconds: 60, created_at: "2026-09-01", updated_at: "2026-09-02" }], error: null });
    f.resolve.takes({ data: [take("newer", "2026-09-02", 80), take("older", "2026-09-01", 90)], error: null });
    const result = await pending;
    expect(result.totalReviewedTakes).toBe(2);
    expect(result.scripts[0].takeHistory.map(t => t.id)).toEqual(["newer", "older"]);
    expect(result.scripts[0].latestTake?.id).toBe("newer");
    expect(result.scripts[0].bestTake).toMatchObject({ id: "older", favorite: true, weakWords: [{ word: "words", score: 70, note: "note" }], coach: { nextStepJa: "next" } });
    expect(result.scripts[0].latestVsPrevious?.scoreDelta).toBe(-10);
  });
});
