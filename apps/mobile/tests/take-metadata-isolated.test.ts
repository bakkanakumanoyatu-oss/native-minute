// Executed only by scripts/take-metadata-isolated-test.py against its private network-none DB.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { AppSupabaseClient } from "../../../lib/supabase/client";
import { updateTakeMetadata } from "../../../services/takes/take-metadata.service";
import { getStoredReview, hydrateStoredReview } from "../../../services/review";
import { buildScriptProgressItem } from "../../../services/progress";
import { handleTakeMetadataPatch } from "../../../lib/mobile/take-metadata-route";
import { NextRequest } from "next/server";

const container = process.env.P2_TEST_CONTAINER;
const uid = "10000000-0000-4000-8000-000000000003";
const other = "10000000-0000-4000-8000-000000000002";
const sid = "20000000-0000-4000-8000-000000000003";
const tid = "30000000-0000-4000-8000-000000000003";
const bestId = "30000000-0000-4000-8000-000000000004";
const literal = (v: unknown) => v === null ? "null" : typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
function sql(source: string) {
  if (!container?.startsWith("native-minute-p2-")) throw new Error("isolated container required");
  return execFileSync("docker", ["exec", "-i", container, "psql", "-XAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { input: source, encoding: "utf8" }).trim();
}
// Thin query transport only: real services, real PostgreSQL constraints and RLS.
function db(owner = uid): AppSupabaseClient {
  return { from(table: string) {
    let values: Record<string, unknown> | undefined;
    const filters: string[] = [];
    const query = {
      update(input: Record<string, unknown>) { values = input; return query; },
      select() { return query; },
      eq(key: string, value: string) { filters.push(`${key}=${literal(value)}`); return query; },
      order() { return query; },
      run(single = false) {
        const where = filters.length ? `where ${filters.join(" and ")}` : "";
        const statement = values ? `update public.${table} set ${Object.entries(values).map(([k,v]) => `${k}=${literal(v)}`).join(",")} ${where} returning *` : `select * from public.${table} ${where}`;
        const out = sql(`begin; set local role authenticated; set local request.jwt.claim.sub=${literal(owner)}; with rows as (${statement}) select coalesce(jsonb_agg(to_jsonb(rows)), '[]') from rows; commit;`);
        const rows = JSON.parse(out.split("\n").find(line => line.startsWith("[")) ?? "[]");
        return { data: single ? rows[0] ?? null : rows, error: null };
      },
      async maybeSingle() { return query.run(true); },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve().then(() => query.run()).then(resolve, reject); }
    };
    return query;
  } } as unknown as AppSupabaseClient;
}

describe.skipIf(!container)("metadata connected DB / service / route", () => {
  it("persists set/update/clear, isolates ownership, preserves automatic Best, and survives DB restart", async () => {
    sql(`insert into auth.users(id) values ('${uid}'); insert into public.scripts(id,user_id,title,content) values ('${sid}','${uid}','Script title','Hello.');
      insert into public.takes(id,script_id,user_id,audio_path,status,score) values ('${tid}','${sid}','${uid}','mock/a.wav','reviewed',70),('${bestId}','${sid}','${uid}','mock/b.wav','reviewed',90);`);
    const client = db();
    const before = sql(`select to_jsonb(takes) - 'favorite' - 'display_name' from public.takes where id='${tid}'`);
    expect(await updateTakeMetadata(client, uid, tid, { favorite: true })).toMatchObject({ favorite: true });
    expect(await updateTakeMetadata(client, uid, tid, { favorite: false })).toMatchObject({ favorite: false });
    expect(await updateTakeMetadata(client, uid, tid, { displayName: " First " })).toMatchObject({ displayName: "First" });
    expect(await updateTakeMetadata(client, uid, tid, { displayName: "Second" })).toMatchObject({ displayName: "Second" });
    expect(await updateTakeMetadata(client, uid, tid, { displayName: "   " })).toMatchObject({ displayName: null });
    await updateTakeMetadata(client, uid, tid, { displayName: "My voice", favorite: true });
    // Both explicit server owner filtering and DB RLS reject the wrong owner.
    await expect(updateTakeMetadata(db(other), other, tid, { favorite: false })).rejects.toMatchObject({ status: 404 });
    await expect(updateTakeMetadata(db(other), uid, tid, { displayName: "forged" })).rejects.toMatchObject({ status: 404 });
    execFileSync("docker", ["restart", container!]);
    for (let i = 0; i < 50; i++) {
      try { execFileSync("docker", ["exec", container!, "pg_isready", "-U", "postgres"], { stdio: "ignore" }); break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    const review = await getStoredReview(db(), uid, sid, tid);
    expect(review?.take).toMatchObject({ favorite: true, display_name: "My voice", score: 70 });
    const best = await getStoredReview(db(), uid, sid, bestId);
    const progress = buildScriptProgressItem({ id: sid, title: "Script title", content: "Hello.", locale: "en-US", targetSeconds: 60, createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" }, [hydrateStoredReview(review!), hydrateStoredReview(best!)]);
    expect(progress.bestTake?.id).toBe(bestId);
    expect(progress.takeHistory.find(take => take.id === tid)).toMatchObject({ favorite: true, displayName: "My voice" });
    expect(sql(`select to_jsonb(takes) - 'favorite' - 'display_name' from public.takes where id='${tid}'`)).toBe(before);
    const dependencies = { hasConfig: () => true, createClient: () => db(), validateUser: async () => ({ data: { user: { id: uid } }, error: null }), updateTakeMetadata };
    const response = await handleTakeMetadataPatch(new NextRequest('https://example.test', { method: 'PATCH', headers: { origin: 'capacitor://localhost', authorization: 'Bearer fixture' }, body: JSON.stringify({ favorite: false }) }), tid, dependencies);
    expect(response.status).toBe(200);
    expect((await response.json()).data.metadata).toMatchObject({ favorite: false, displayName: "My voice" });
    sql(`delete from public.takes where id='${tid}'`);
    await expect(updateTakeMetadata(db(), uid, tid, { favorite: true, displayName: "Resurrect" })).rejects.toMatchObject({ status: 404 });
    expect(await getStoredReview(db(), uid, sid, tid)).toBeNull();
  }, 30000);
});
