import { describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "../../../lib/supabase/client";
import type { StoredTake } from "../../../services/review/types";
import type { ScriptListItem } from "../../../services/scripts/types";
import { getReviewScriptSnapshot, getStoredReview, hydrateStoredReview } from "../../../services/review/review.service";
import { buildScriptProgressItem, getProgressOverview, getScriptTakeComparison } from "../../../services/progress/progress.service";
import { assertPracticeScript, deleteScript } from "../../../services/scripts/scripts.service";
import { buildScriptAudioCacheKey } from "../../../services/voice/cache";
import { fetchMobileProgress, fetchMobileReview } from "../src/lib/api";
import { toMobileReviewDto } from "../../../lib/mobile/dto";
import { updateScriptSchema } from "../../../schemas/script";
vi.mock("server-only", () => ({}));
const script: ScriptListItem = { id: "20000000-0000-4000-8000-000000000001", currentRevisionId: "60000000-0000-4000-8000-000000000002", title: "Current title", content: "Current content", locale: "en-US", targetSeconds: 60, lockVersion: 3, practiceEpoch: 2, archivedAt: null, createdAt: "2026-09-01", updatedAt: "2026-09-02" };
function take(id: string, revision: string | null, score: number, date: string, status = "reviewed") {
  return { id, script_id: script.id, user_id: "owner", script_revision_id: revision, script_title_snapshot: revision ? "Original title" : null, script_practice_epoch: revision ? 1 : null, audio_path: "synthetic", duration_seconds: 60, evaluation_summary_ja: "Saved", score, accuracy_score: score, fluency_score: score, rhythm_score: score, status, created_at: date, reviewed_at: status === "reviewed" ? date : null, transcript_text: "Saved recording", total_words: 2, evaluation_strengths_ja: [], evaluation_payload: {}, coach_feedback_payload: {}, favorite: true, display_name: "Favorite" } as StoredTake;
}
function clientFor(rows: Record<string, unknown>) {
  const filters: unknown[] = [];
  const client = { from: vi.fn((table: string) => {
    const q = { select: () => q, eq: (key: string, value: unknown) => { filters.push([table, key, value]); return q; }, in: () => q, order: () => q,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      then: (done: (value: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(done) };
    return q;
  }) };
  return { client: client as unknown as AppSupabaseClient, from: client.from, filters };
}
const oldRevision = "60000000-0000-4000-8000-000000000001";
const reviews = [take("legacy", null, 100, "2026-09-05"), take("completed", null, 99, "2026-09-06", "completed"), take("old", oldRevision, 95, "2026-09-04"), take("latest", script.currentRevisionId, 70, "2026-09-03"), take("best", script.currentRevisionId, 80, "2026-09-02")];
describe("revision and legacy display boundaries", () => {
  it("keeps archived/old/legacy records in all-time but compares only current reviewed revision", () => {
    const result = buildScriptProgressItem({ ...script, archivedAt: "2026-09-07" }, reviews.map(t => hydrateStoredReview({ take: t, weakWords: [], coachFeedback: null })));
    expect(result).toMatchObject({ takeCount: 2, allTimeTakeCount: 4, legacyTakeCount: 1, legacyRecordCount: 1, latestTake: { id: "latest" }, bestTake: { id: "best" }, latestVsPrevious: { scoreDelta: -10 } });
    expect(result.takeHistory.map(t => t.id)).toEqual(["completed", "legacy", "old", "latest", "best"]);
    expect(result.revisionHistory.find(r => r.revisionId === oldRevision)?.bestTake?.id).toBe("old");
  });
  it("reads saved revision and title without querying current content", async () => {
    const f = clientFor({ script_revisions: { id: oldRevision, revision_no: 1, content: "Original content", locale: "en-US", target_seconds: 45 } });
    expect(await getReviewScriptSnapshot(f.client, reviews[2])).toMatchObject({ title: "Original title", content: "Original content", targetSeconds: 45 });
    expect(f.filters).toEqual([["script_revisions", "script_id", script.id], ["script_revisions", "id", oldRevision]]);
    expect(f.from).toHaveBeenCalledTimes(1);
  });
  it("does not infer legacy snapshot and fails closed for lost versioned content", async () => {
    const f = clientFor({});
    expect(await getReviewScriptSnapshot(f.client, reviews[0])).toBeNull();
    expect(f.from).not.toHaveBeenCalled();
    await expect(getReviewScriptSnapshot(f.client, reviews[2])).rejects.toThrow("保存時の台本");
  });
  it.each([reviews[0], reviews[1]])("reads an owned legacy $status Review without inventing a historical title or content", async legacy => {
    const f = clientFor({ takes: legacy, weak_words: [], coach_feedback: null });
    const stored = await getStoredReview(f.client, "owner", script.id, legacy.id);
    expect(stored?.take.id).toBe(legacy.id);
    expect(stored?.scriptSnapshot).toBeNull();
    expect(f.filters).toContainEqual(["takes", "user_id", "owner"]);
    expect(f.filters).toContainEqual(["takes", "script_id", script.id]);
    expect(f.filters).not.toContainEqual(["takes", "script_revision_id", script.currentRevisionId]);
    expect(f.from).not.toHaveBeenCalledWith("script_revisions");
    const dto = toMobileReviewDto(hydrateStoredReview(stored!));
    expect(dto).toMatchObject({
      takeId: legacy.id,
      historyStatus: "UNVERIFIED_LEGACY",
      scriptSnapshot: null,
      scriptTitleSnapshot: null
    });
    expect(JSON.stringify(dto)).not.toContain(script.content);
  });
  it("keeps legacy-only practice in overview history across edits and archive", async () => {
    const row = { id: script.id, user_id: "owner", title: script.title, content: script.content,
      locale: script.locale, target_seconds: script.targetSeconds, current_revision_id: script.currentRevisionId,
      lock_version: script.lockVersion, practice_epoch: script.practiceEpoch, archived_at: null as string | null,
      created_at: script.createdAt, updated_at: script.updatedAt };
    const legacy = reviews[0];
    const f = clientFor({ scripts: [row], takes: [legacy, reviews[1]], weak_words: [], coach_feedback: [] });
    const before = await getProgressOverview(f.client, "owner");
    expect(before).toMatchObject({ totalScripts: 1, totalReviewedTakes: 1, bestTakeCount: 0 });
    expect(before.scripts[0]).toMatchObject({
      takeCount: 0, allTimeTakeCount: 1, legacyTakeCount: 1, legacyRecordCount: 1,
      latestTake: null, bestTake: null, latestVsBest: null, improvementTrend: "insufficient_data"
    });
    expect(before.scripts[0].takeHistory.map(take => take.id)).toEqual(["completed", "legacy"]);
    expect(before.scripts[0].takeHistory.find(take => take.id === "legacy")?.scriptTitleSnapshot).toBeNull();
    row.title = "Edited current title";
    row.content = "Edited current content";
    row.current_revision_id = "60000000-0000-4000-8000-000000000003";
    row.archived_at = "2026-09-08";
    const archived = await getProgressOverview(f.client, "owner");
    expect(archived.totalScripts).toBe(0);
    expect(archived.scripts[0].script.archivedAt).toBe("2026-09-08");
    expect(archived.scripts[0].takeHistory).toEqual(before.scripts[0].takeHistory);
    expect(archived.scripts[0].latestTake).toBeNull();
    row.archived_at = null;
    const restored = await getProgressOverview(f.client, "owner");
    expect(restored.totalScripts).toBe(1);
    expect(restored.scripts[0].takeHistory).toEqual(before.scripts[0].takeHistory);
  });
  it.each(["legacy", "completed"])("never compares %s to another NULL or current revision", async id => {
    const f = clientFor({ takes: reviews });
    expect(await getScriptTakeComparison(f.client, "owner", script.id, id)).toMatchObject({ best: null, diff: null, isBest: false, takeCount: 0 });
  });
  it("old revision Review compares only its saved version", async () => {
    const f = clientFor({ takes: reviews });
    expect(await getScriptTakeComparison(f.client, "owner", script.id, "old")).toMatchObject({ best: { id: "old" }, isBest: true, takeCount: 1 });
  });
});
describe("practice and mutation boundaries", () => {
  it("title-only metadata preserves the audio key; content revision and preset cannot reuse it", () => {
    const key = { revisionId: oldRevision, provider: "mock", voiceId: "voice", scriptLocale: "en-US", scriptContent: "Original" };
    const v2 = buildScriptAudioCacheKey(key);
    expect(buildScriptAudioCacheKey({ ...key })).toBe(v2);
    expect(buildScriptAudioCacheKey({ ...key, revisionId: script.currentRevisionId })).not.toBe(v2);
    expect(buildScriptAudioCacheKey({ ...key, voiceStylePreset: "slow" })).not.toBe(v2);
    expect(buildScriptAudioCacheKey({ ...key, revisionId: undefined })).not.toBe(v2);
  });
  it("requires fresh revision and epoch and rejects archive", () => {
    const identity = { expectedRevisionId: script.currentRevisionId, expectedPracticeEpoch: script.practiceEpoch };
    expect(() => assertPracticeScript(script, identity)).not.toThrow();
    expect(() => assertPracticeScript({ ...script, archivedAt: "now" }, identity)).toThrow();
    expect(() => assertPracticeScript(script, { ...identity, expectedRevisionId: oldRevision })).toThrow();
    expect(() => assertPracticeScript(script, { ...identity, expectedPracticeEpoch: 1 })).toThrow();
  });
  it("normal DELETE calls one-way archive and never physical delete", async () => {
    const row = { id: script.id, current_revision_id: script.currentRevisionId, lock_version: 3, practice_epoch: 2, archived_at: null };
    const f = clientFor({ scripts: row });
    const rpc = vi.fn(async () => ({ data: { ...row, archived_at: "now", lock_version: 4 }, error: null }));
    Object.assign(f.client, { rpc });
    expect((await deleteScript(f.client, "owner", script.id)).archivedAt).toBe("now");
    expect(rpc).toHaveBeenCalledWith("set_script_archived", { p_script_id: script.id, p_archived: true, p_expected_lock_version: 3 });
    expect(f.filters).toContainEqual(["scripts", "user_id", "owner"]);
  });
  it("requires edit concurrency fields while leaving existing content validation to the owned edit service", () => {
    const draft = { id: script.id, title: "New title", content: "a".repeat(3000) };
    expect(updateScriptSchema.safeParse(draft).success).toBe(false);
    expect(updateScriptSchema.safeParse({ ...draft, expectedRevisionId: script.currentRevisionId, expectedLockVersion: 3 }).success).toBe(true);
  });
});

describe("public payload revision round trip", () => {
  it("accepts current count smaller than complete historical count and rejects a false current count", async () => {
    const item=buildScriptProgressItem(script,reviews.map(take=>hydrateStoredReview({take,weakWords:[],coachFeedback:null})));
    const progress={scripts:[item],totalScripts:1,totalReviewedTakes:4,bestTakeCount:1};
    const fetchImpl=async()=>new Response(JSON.stringify({ok:true,data:{progress}}),{headers:{"Content-Type":"application/json"}});
    expect((await fetchMobileProgress("https://fixture.test","fixture",{fetchImpl})).kind).toBe("success");
    item.takeCount=5;
    expect((await fetchMobileProgress("https://fixture.test","fixture",{fetchImpl})).kind).toBe("invalid-response");
  });
  it("rejects VERSIONED Review without its immutable snapshot", async () => {
    const review=toMobileReviewDto(hydrateStoredReview({take:reviews[2],weakWords:[],coachFeedback:null}));
    const fetchImpl=async()=>new Response(JSON.stringify({ok:true,data:{review}}),{headers:{"Content-Type":"application/json"}});
    expect((await fetchMobileReview("https://fixture.test","fixture",script.id,"old",{fetchImpl})).kind).toBe("invalid-response");
    review.scriptSnapshot={revisionId:oldRevision,revisionNo:1,title:"Original",content:"Saved",locale:"en-US",targetSeconds:60};
    expect((await fetchMobileReview("https://fixture.test","fixture",script.id,"old",{fetchImpl})).kind).toBe("success");
  });
});
