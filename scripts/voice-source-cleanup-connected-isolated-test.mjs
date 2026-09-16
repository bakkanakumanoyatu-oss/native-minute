#!/usr/bin/env node
// Real R1 SQL transitions + production repository/runner + fake Storage only.
// Invoked by the disposable runner, never reads an env file or remote URL.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { runVoiceSourceCleanup } from "../services/voice/voice-source-cleanup.service.ts";
import { createVoiceSourceCleanupRepository } from "../services/voice/voice-source-cleanup.repository.ts";
import { createAccountDeletionStorageAdapter } from "../services/account-deletion/account-deletion-storage-adapter.ts";
const container = process.argv[2];
assert.match(container ?? "", /^native-minute-r1-proof-[0-9a-f]{10}$/);
const state = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
assert.equal(state.HostConfig.NetworkMode, "none");
assert.ok(!state.HostConfig.PortBindings || Object.keys(state.HostConfig.PortBindings).length === 0);
function sql(statement) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-At", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: statement, encoding: "utf8", timeout: 20000 }).trim();
}
const literal = value => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const argsByRpc = {
  select_voice_source_cleanup: ["p_after_id"],
  claim_voice_source_cleanup: ["p_source_id", "p_token"],
  check_voice_source_cleanup: ["p_source_id", "p_token"],
  finish_voice_source_cleanup: ["p_source_id", "p_token", "p_result"]
};
const repository = createVoiceSourceCleanupRepository({ async rpc(name, args) {
  assert.ok(argsByRpc[name]);
  const values = argsByRpc[name].map(k => literal(args[k])).join(",");
  return { data: JSON.parse(sql(`select coalesce(to_jsonb(public.${name}(${values})),'null'::jsonb)`)), error: null };
} });
sql("select r1_test.seed(41); select r1_test.age_source(s,interval '25 hours'),r1_test.age_source(r,interval '25 hours') from r1_test.fixture where n=41;");
const fixture = JSON.parse(sql("select to_jsonb(f) from r1_test.fixture f where n=41"));
const sources = JSON.parse(sql(`select jsonb_agg(jsonb_build_object('id',id,'key',storage_object_key,'kind',kind)) from public.voice_asset_write_intents where id in (${literal(fixture.s)},${literal(fixture.r)})`));
const objects = new Set(sources.map(s => s.key));
let failConsent = true;
let deletes = 0;
const storage = {
  async listOwnedInventory() { throw new Error("R1 must not list"); },
  async verifyObjectAbsence(input) { assert.equal(input.userId, fixture.u); return { kind: objects.has(input.objectKey) ? "present" : "absent" }; },
  async deleteObject(input) {
    assert.equal(input.userId, fixture.u);
    assert.ok(sources.some(s => s.key === input.objectKey));
    deletes++;
    if (input.targetKind === "voice_consent_recording" && failConsent) return { kind: "network_error" };
    objects.delete(input.objectKey); return { kind: "request_succeeded" };
  }
};
const options = { env: { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" }, repository, storage };
function before(id) {
  const hex = (BigInt(`0x${id.replaceAll("-", "")}`) - 1n).toString(16).padStart(32, "0");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const sample = await runVoiceSourceCleanup({ mode: "execute", afterId: before(fixture.s) }, options);
assert.equal(sample.safeReasonCode, "cleanup_succeeded");
const failed = await runVoiceSourceCleanup({ mode: "execute", afterId: before(fixture.r) }, options);
assert.equal(failed.safeReasonCode, "storage_delete_transient_failure");
assert.equal(sql(`select cleanup_state from public.voice_asset_write_intents where id=${literal(fixture.s)}`), "completed");
assert.equal(sql(`select cleanup_state from public.voice_asset_write_intents where id=${literal(fixture.r)}`), "claimed");
const dueBefore = sql(`select cleanup_due_at from public.voice_asset_write_intents where id=${literal(fixture.r)}`);
failConsent = false;
const retry = await runVoiceSourceCleanup({ mode: "execute", afterId: before(fixture.r) }, options);
assert.equal(retry.safeReasonCode, "cleanup_succeeded");
assert.equal(sql(`select cleanup_due_at from public.voice_asset_write_intents where id=${literal(fixture.r)}`), dueBefore);
assert.equal(deletes, 3);
assert.equal(objects.size, 0);
assert.equal(sql(`select count(*) from public.voice_consents where id=${literal(fixture.c)}`), "1");
assert.equal(sql(`select cleanup_attempt_count from public.voice_asset_write_intents where id=${literal(fixture.r)}`), "2");
console.log("R1_CONNECTED_SQL_REPOSITORY_ROUTINE_FAKE_STORAGE_PARTIAL_RETRY_PASS");

// Exact mode: an unrelated eligible B remains present throughout every case.
sql(`select r1_test.seed(n) from generate_series(60,71) n;
  select r1_test.reserve(64);
  select r1_test.age_source(s,interval '25 hours'),r1_test.age_source(r,interval '25 hours')
    from r1_test.fixture where n between 60 and 71 and n<>62;
  insert into public.account_deletion_requests(user_id,status,confirmed_at)
    select u,'confirmed',clock_timestamp() from r1_test.fixture where n=63;
  select public.apply_account_deletion_legal_hold(id,array['storage'],'lh_'||repeat('a',32))
    from public.account_deletion_requests where user_id=(select u from r1_test.fixture where n=63);
  select set_config('session_replication_role','replica',false);
  update public.voice_asset_write_intents set source_lifecycle_known=false,cleanup_state=null
    where id=(select s from r1_test.fixture where n=65);
  update public.voice_asset_write_intents set storage_object_key='foreign/consent/sample.wav'
    where id=(select s from r1_test.fixture where n=66);
  select set_config('session_replication_role','origin',false);
  select public.claim_voice_source_cleanup(s,t) from r1_test.fixture where n=67;`);
const exactFixtures = JSON.parse(sql("select jsonb_object_agg(n,to_jsonb(f)) from r1_test.fixture f where n between 60 and 71"));
const sourceRows = JSON.parse(sql("select jsonb_agg(to_jsonb(i)) from public.voice_asset_write_intents i join r1_test.fixture f on i.id in (f.s,f.r) where n between 60 and 71"));
const exactObjects = new Set(sourceRows.map(s => `${s.storage_bucket}/${s.storage_object_key}`));
const bObjects = [...exactObjects].filter(key => key.includes(exactFixtures[60].u));
const untouched = id => sql(`select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.voice_asset_write_intents i where id<>${literal(id)}`);
let selected = 0;
const claims = [];
const exactRepository = {
  ...repository,
  async select(cursor) { selected++; return repository.select(cursor); },
  async claim(id, token) { claims.push(id); return repository.claim(id, token); }
};
const removed = [];
const verified = [];
let keepPresent = false;
const exactStorage = createAccountDeletionStorageAdapter({ storage: { from(bucket) { return {
  async list() { throw new Error("Exact cleanup must not list"); },
  async info(key) {
    const locator = `${bucket}/${key}`; verified.push(locator);
    return exactObjects.has(locator) ? { data: { id: "fake-object" }, error: null }
      : { data: null, error: { status: 400, infoBody: { statusCode: "404", error: "not_found", code: "NoSuchKey", message: "Object not found" } } };
  },
  async remove(keys) {
    assert.equal(keys.length, 1);
    const locator = `${bucket}/${keys[0]}`; removed.push(locator);
    if (!keepPresent) exactObjects.delete(locator);
    return { error: null };
  }
}; } } });
const exactOptions = { env: options.env, repository: exactRepository, storage: exactStorage };
async function exact(id, reason, expectedDeletes = 0, overrides = {}) {
  const before = untouched(id);
  const targetBefore = sql(`select to_jsonb(i) from public.voice_asset_write_intents i where id=${literal(id)}`);
  const source = sourceRows.find(row => row.id === id);
  const locator = source && `${source.storage_bucket}/${source.storage_object_key}`;
  const otherObjects = [...exactObjects].filter(key => key !== locator).sort();
  const deleteCount = removed.length;
  const verifyCount = verified.length;
  const claimCount = claims.length;
  const result = await runVoiceSourceCleanup({ mode: "execute", sourceId: id }, { ...exactOptions, ...overrides });
  assert.equal(result.safeReasonCode, reason);
  assert.equal(result.nextAfterId, null);
  assert.equal(removed.length - deleteCount, expectedDeletes);
  assert.equal(verified.length - verifyCount, expectedDeletes ? 2 : 0);
  if (expectedDeletes) {
    assert.deepEqual(removed.slice(deleteCount), [locator]);
    assert.deepEqual(verified.slice(verifyCount), [locator, locator]);
  } else {
    assert.equal(sql(`select to_jsonb(i) from public.voice_asset_write_intents i where id=${literal(id)}`), targetBefore);
  }
  assert.deepEqual([...exactObjects].filter(key => key !== locator).sort(), otherObjects);
  assert.equal(selected, 0);
  if (claims.length > claimCount) assert.deepEqual(claims.slice(claimCount), [id]);
  assert.equal(untouched(id), before, "Unrelated source state must not change");
  for (const key of bObjects) { assert.ok(exactObjects.has(key)); assert.ok(!removed.includes(key)); }
  for (const f of Object.values(exactFixtures)) assert.ok(!JSON.stringify(result).includes(f.u));
  assert.ok(!JSON.stringify(result).includes("sample.wav"));
  return result;
}
const targetA = exactFixtures[61].s;
assert.equal(await repository.select(before(exactFixtures[60].s)), exactFixtures[60].s, "B is a discoverable due candidate");
assert.equal((await exact(targetA, "cleanup_succeeded", 1)).status, "succeeded");
assert.equal(sql(`select cleanup_state from public.voice_asset_write_intents where id=${literal(targetA)}`), "completed");
await exact(targetA, "cleanup_succeeded"); // Already completed: no second DELETE.
await exact(exactFixtures[61].r, "cleanup_succeeded", 1); // Consent source uses the same contract.
await exact(exactFixtures[62].s, "not_due");
await exact(exactFixtures[63].s, "legal_hold");
await exact(exactFixtures[64].s, "in_flight_use");
await exact("ffffffff-ffff-4fff-8fff-ffffffffffff", "source_authority_removed");
await exact(exactFixtures[65].s, "malformed_canonical_state");
await exact(exactFixtures[66].s, "unsafe_locator_or_ownership");
await exact(exactFixtures[67].s, "claim_conflict");
await exact(exactFixtures[68].op, "malformed_canonical_state"); // Wrong intent kind.
await exact(exactFixtures[71].s, "destructive_guard_missing", 0, { env: {} });
keepPresent = true;
await exact(exactFixtures[70].s, "verification_failure", 1);
keepPresent = false;
assert.equal(sql(`select cleanup_state from public.voice_asset_write_intents where id=${literal(exactFixtures[70].s)}`), "claimed");
console.log("R1_EXACT_SQL_ELIGIBILITY_NO_FALLBACK_UNRELATED_UNCHANGED_ABSENCE_PASS");

// Overlap two invocations at a deterministic post-claim/pre-Storage barrier.
// The second real DB claim sees the first lease; only the first can DELETE.
const concurrentId = exactFixtures[69].s;
let signalClaimed;
let releaseClaim;
const claimed = new Promise(resolve => { signalClaimed = resolve; });
const release = new Promise(resolve => { releaseClaim = resolve; });
let first = true;
const concurrentRepository = { ...exactRepository, async claim(id, token) {
  const result = await exactRepository.claim(id, token);
  if (first) { first = false; signalClaimed(); await release; }
  return result;
} };
const beforeConcurrent = untouched(concurrentId);
const concurrentSource = sourceRows.find(row => row.id === concurrentId);
const concurrentLocator = `${concurrentSource.storage_bucket}/${concurrentSource.storage_object_key}`;
const objectsBeforeConcurrent = [...exactObjects].filter(key => key !== concurrentLocator).sort();
const deletesBeforeConcurrent = removed.length;
const firstRun = runVoiceSourceCleanup({ mode: "execute", sourceId: concurrentId }, { ...exactOptions, repository: concurrentRepository });
await claimed;
try {
  const second = await runVoiceSourceCleanup({ mode: "execute", sourceId: concurrentId }, { ...exactOptions, repository: concurrentRepository });
  assert.equal(second.safeReasonCode, "claim_conflict");
  assert.equal(second.safeCounts.deleteCalls, 0);
} finally { releaseClaim(); }
assert.equal((await firstRun).safeReasonCode, "cleanup_succeeded");
assert.equal(removed.length - deletesBeforeConcurrent, 1);
assert.deepEqual(removed.slice(deletesBeforeConcurrent), [concurrentLocator]);
assert.deepEqual([...exactObjects].filter(key => key !== concurrentLocator).sort(), objectsBeforeConcurrent);
assert.equal(sql(`select cleanup_attempt_count from public.voice_asset_write_intents where id=${literal(concurrentId)}`), "1");
assert.equal(untouched(concurrentId), beforeConcurrent);
assert.equal(selected, 0);
for (const key of bObjects) { assert.ok(exactObjects.has(key)); assert.ok(!removed.includes(key)); }
console.log("R1_EXACT_CONCURRENT_OPERATORS_REAL_CLAIM_SINGLE_DELETE_PASS");
