import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import {
  INVOCATION_VERSION, INVENTORY_VERSION, TABLES, invocationContextSchema,
  validateActualState, plannedInvocation, requirePresence, observeReadOnly,
  assertInvocationEnvironment, verifyInvocationPost, verifyDatabasePost
} from "./g5d4-invocation-evidence.mjs";
import { G5D4_CANONICAL_STAGING, G5D4_REQUIRED_MIGRATIONS, G5D4_STORAGE_BUCKETS, canonicalJson, hmacSha256Hex } from "./g5d4-proof-contract.mjs";
import { collectSelfTestInvocationSnapshot, collectLiveInvocationSnapshot } from "./g5d4-read-only-evidence-collector.mjs";
import { createInvocationPrivateRun, readInvocationSnapshot, confirmSelfTestInvocation, confirmLiveInvocationFromTty,
  consumeInvocationAuthorization, readInvocationAuthorization, readAliasKey, cleanupPrivateRunDirectory,
  writePrivateProofArtifact, readPrivateJson } from "./g5d4-proof-private-state.mjs";
import { runG5d4InvocationSelfTestOnly, runG5d4AuthorizedStep } from "./g5d4-authorized-step-wrapper.mjs";
import { guardInvocationExternal, guardInvocationRepository } from "./g5d4-invocation-operator.mjs";
const clone = value => structuredClone(value);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stamp = "2026-09-01T00:00:00.000Z";
const finalized = "2026-09-02T00:00:00.000Z";
const party = (n, providerId) => ({ userId: id(n), providerId, storage: G5D4_STORAGE_BUCKETS.map((bucket, i) => ({ bucket, key: `${id(n)}/synthetic-${i}.wav` })) });
const context = invocationContextSchema.parse({ version: INVOCATION_VERSION, purpose: "self_test", a: party(1, "A".repeat(20)), b: party(2, "B".repeat(20)), requestId: id(3), requestRef: `adr_${"c".repeat(32)}` });
const inspection = { environment: { ...G5D4_CANONICAL_STAGING, productionGuard: false, destructiveGuard: false }, migrations: { applied: [...G5D4_REQUIRED_MIGRATIONS], pending: [] }, git: { commit: "a".repeat(40), branch: "codex/self-test", trackedClean: true } };
function product(p, words, offset) {
  let next = offset;
  const tables = Object.fromEntries(TABLES.map(t => [t, []]));
  const row = (table, fields = {}) => { const r = { id: id(next++), owner_id: p.userId, user_id: p.userId, created_at: stamp, updated_at: null, status: null, ...fields }; tables[table].push(r); return r; };
  row("profiles", { id: p.userId });
  const script = row("scripts"); const consent = row("voice_consents");
  const voice = row("voices", { provider: "elevenlabs", provider_voice_id: p.providerId, consent_id: consent.id, sample_audio_path: `storage://voice-samples/${p.storage[2].key}` });
  row("script_audios", { script_id: script.id, voice_id: voice.id, stored_asset: { storageBucket: "script-audios", storageObjectKey: p.storage[1].key } });
  const take = row("takes", { script_id: script.id, audio_path: `storage://recordings/${p.storage[0].key}` });
  for (let i = 0; i < words; i++) row("weak_words", { take_id: take.id });
  row("coach_feedback", { take_id: take.id });
  for (const consent_type of ["voice_cloning", "pronunciation_processing"]) row("processing_consents", { consent_type, status: "active", withdrawn_at: null, consent_version: "2026-08-22.v1", accepted_at: stamp, purpose_id: consent_type, purpose_version: "v1",
    provider_set: consent_type === "pronunciation_processing" ? ["openai", "azure"] : ["elevenlabs"],
    data_categories: consent_type === "pronunciation_processing" ? ["recorded_audio", "transcript", "pronunciation_result"] : ["voice_sample", "consent_recording", "cloned_voice", "reference_audio"] });
  for (const [kind, bucket] of [["voice_create", null], ["script_audio_create", null], ["voice_sample_upload", "voice-samples"], ["voice_consent_upload", "voice-consents"], ["recording_upload", "recordings"]]) row("voice_asset_write_intents", { kind, status: "completed", script_id: kind === "recording_upload" ? script.id : null, storage_bucket: bucket, storage_object_key: bucket ? p.storage.find(x => x.bucket === bucket).key : null });
  row("quota_events", { subject_id: take.id, target_resource_id: script.id, idempotency_key: "synthetic", dedupe_key: "synthetic", request_fingerprint: "synthetic", provider_request_id: "synthetic", metadata: {}, event_type: "pronunciation", category: "practice", billing_status: "billable", retention_expires_at: "2026-12-01T00:00:00.000Z", identifier_scrubbed_at: null });
  return { database: { state: "present", evidence: tables }, provider: { state: "present", identity: p.providerId, evidence: { category: "cloned" } }, auth: { state: "present", identity: p.userId, evidence: { confirmed: true } }, storage: { state: "present", evidence: p.storage.map(x => ({ ...x, version: "synthetic-v1" })) } };
}
function actual(words = 4, bWords = 0) {
  const a = product(context.a, words, 100); const b = product(context.b, bWords, 300);
  const request = { id: context.requestId, owner_id: context.a.userId, user_id: context.a.userId, created_at: stamp, confirmed_at: stamp, anonymized_user_ref: context.requestRef, status: "confirmed", db_inventory_version: INVENTORY_VERSION,
    provider_snapshot_status: "sealed", provider_snapshot_target_count: 1, provider_snapshot_sealed_at: stamp,
    storage_snapshot_status: "sealed", storage_snapshot_target_count: 4, storage_snapshot_sealed_at: stamp,
    provider_cleanup_status: "pending", provider_sub_finalized_at: null, storage_cleanup_status: "pending", storage_sub_finalized_at: null,
    db_cleanup_status: "pending", db_sub_finalized_at: null, db_observed_row_count: 0, db_deleted_row_count: 0, db_anonymized_row_count: 0, db_retained_row_count: 0,
    auth_cleanup_status: "pending", auth_sub_finalized_at: null, completed_at: null };
  const target = (n, fields) => ({ id: id(n), owner_id: context.a.userId, user_id: context.a.userId, deletion_request_id: context.requestId, created_at: stamp, status: "pending", delete_attempt_count: 0, delete_outcome: "not_attempted", next_retry_at: null, ...fields });
  const providerTargets = [target(500, { provider_name: "elevenlabs", provider_resource_id: context.a.providerId, source_voice_id: a.database.evidence.voices[0].id, target_fingerprint: "synthetic", reconciliation_status: "pending" })];
  const kinds = ["recording", "script_audio", "voice_sample", "voice_consent_recording"];
  const storageTargets = context.a.storage.map((x, i) => target(510 + i, { storage_bucket: x.bucket, storage_object_key: x.key, target_kind: kinds[i], target_fingerprint: "synthetic", source_refs: [], verification_status: "pending" }));
  a.database.evidence.account_deletion_requests = [request]; a.database.evidence.account_deletion_provider_targets = providerTargets; a.database.evidence.account_deletion_storage_targets = storageTargets;
  return { a, b, request, providerTargets, storageTargets };
}
function priorTerminal(raw) {
  for (const s of ["provider", "storage"]) {
    raw.request[`${s}_cleanup_status`] = "succeeded"; raw.request[`${s}_sub_finalized_at`] = stamp;
    for (const t of raw[`${s}Targets`]) {
      t.status = "verified_absent"; t[s === "provider" ? "reconciliation_status" : "verification_status"] = "verified_absent"; t.locator_scrubbed_at = stamp;
      for (const f of s === "provider" ? ["provider_name", "provider_resource_id", "source_voice_id", "target_fingerprint"] : ["storage_bucket", "storage_object_key", "target_fingerprint", "source_refs"]) t[f] = null;
    }
  }
  raw.a.provider.state = "absent"; raw.a.provider.evidence = null; raw.a.storage.state = "absent"; raw.a.storage.evidence = [];
  return raw;
}
function databasePost(pre) {
  const after = clone(pre); const byIdentity = Object.fromEntries(TABLES.map(t => [t, []]));
  const counts = { deleted: 0, anonymized: 0, retained: 0 };
  for (const t of TABLES) for (const row of pre.a.database.evidence[t]) {
    if (t.startsWith("account_deletion_")) { counts.retained++; byIdentity[t].push(clone(row)); }
    else if (t === "quota_events") {
      counts.anonymized++; const q = clone(row); q.owner_id = null; q.user_id = null; q.identifier_scrubbed_at = finalized;
      for (const f of ["subject_id", "target_resource_id", "idempotency_key", "dedupe_key", "request_fingerprint", "provider_request_id"]) q[f] = null;
      byIdentity[t].push(q);
    } else counts.deleted++;
  }
  Object.assign(after.request, { db_cleanup_status: "succeeded", db_sub_finalized_at: finalized, last_attempted_at: finalized, db_observed_row_count: counts.deleted + counts.anonymized + counts.retained, db_deleted_row_count: counts.deleted, db_anonymized_row_count: counts.anonymized, db_retained_row_count: counts.retained });
  for (const t of TABLES.filter(t => !t.startsWith("account_deletion_"))) after.a.database.evidence[t] = [];
  byIdentity.account_deletion_requests = [clone(after.request)]; after.byIdentity = byIdentity;
  const child = { status: "succeeded", progress: { marker: "terminal", terminal: true, retryable: false, manualReviewRequired: false }, safeCounts: { dbObservedRowCount: after.request.db_observed_row_count, dbDeletedRowCount: counts.deleted, dbAnonymizedRowCount: counts.anonymized, dbRetainedRowCount: counts.retained } };
  return { after, child };
}
function fakeReader(state) { return { inspect: async () => clone(inspection), read: async () => clone(state.value) }; }
async function withSnapshot(raw, stage, fn) {
  const directory = createInvocationPrivateRun(context); const state = { value: raw }; const reader = fakeReader(state);
  try {
    const spec = plannedInvocation(raw, context, stage);
    const collected = await collectSelfTestInvocationSnapshot(directory, spec, reader);
    const snapshot = readInvocationSnapshot(directory, collected.path, "self_test");
    await fn({ directory, state, reader, spec, snapshot, snapshotPath: collected.path, safe: collected.safe });
  } finally { cleanupPrivateRunDirectory(directory); }
}
for (const n of [0, 1, 4]) test(`actual weak_words ${n}: exact snapshot without fixed total/B minimum`, async () => {
  await withSnapshot(actual(n), "provider", ({ safe }) => { assert.equal(safe.counts.a.weak_words, n); assert.equal(safe.counts.b.weak_words, 0); assert.ok(!JSON.stringify(safe).includes(context.a.userId)); });
});
for (const [label, mutate] of [
  ["greater than four", r => r.a.database.evidence.weak_words.push({ ...r.a.database.evidence.weak_words[0], id: id(900) })],
  ["wrong owner", r => r.a.database.evidence.weak_words[0].owner_id = context.b.userId],
  ["wrong Take", r => r.a.database.evidence.weak_words[0].take_id = r.b.database.evidence.takes[0].id],
  ["duplicate", r => r.a.database.evidence.weak_words[1].id = r.a.database.evidence.weak_words[0].id],
  ["total-only match / wrong relation", r => r.a.database.evidence.script_audios[0].script_id = r.b.database.evidence.scripts[0].id],
  ["unknown", r => r.a.provider.state = "unknown"]
]) test(`reject ${label}`, () => { const r = actual(); mutate(r); assert.throws(() => validateActualState(r, context)); });
for (const [observed, expected] of [["absent", "present"], ["present", "absent"], ["unknown", "absent"]]) test(`presence ${observed} expected ${expected} rejects`, () => assert.throws(() => requirePresence({ state: observed }, expected)));
for (const kind of ["network failure", "permission failure", "unexpected response"]) test(`${kind} becomes unknown, never absent`, async () => { const result = await observeReadOnly(async () => { throw new Error(kind); }); assert.equal(result.state, "unknown"); assert.throws(() => requirePresence(result, "absent")); });
for (const [label, mutate] of [
  ["Production", i => i.environment.environment = "production"], ["ref", i => i.environment.projectRef = "x".repeat(20)],
  ["migration", i => i.migrations.applied.pop()], ["pending migration", i => i.migrations.pending.push("0028")],
  ["source worktree", i => i.git.trackedClean = false]
]) test(`${label} fail-close`, () => { const i = clone(inspection); mutate(i); assert.throws(() => assertInvocationEnvironment(i.environment, i.migrations, i.git)); });
for (const field of ["snapshotDigest", "request", "stage", "action", "maxCalls", "target", "fixtureA", "commit"]) test(`Human authorization ${field} mismatch rejects`, async () => {
  await withSnapshot(actual(), "provider", async ({ directory, snapshotPath, snapshot }) => {
    const confirmed = await confirmSelfTestInvocation(directory, snapshotPath);
    const record = JSON.parse(readFileSync(confirmed.path)); record.binding[field] = field === "maxCalls" ? 2 : "substituted"; writeFileSync(confirmed.path, JSON.stringify(record));
    assert.throws(() => readInvocationAuthorization(directory, confirmed.path, snapshot, "confirmed"));
  });
});
test("consume-once race and no live authority from self-test", async () => {
  await withSnapshot(actual(), "provider", async ({ directory, snapshotPath, snapshot }) => {
    await assert.rejects(confirmLiveInvocationFromTty(directory, snapshotPath));
    await assert.rejects(collectLiveInvocationSnapshot(directory, snapshot.spec));
    const auth = await confirmSelfTestInvocation(directory, snapshotPath);
    await assert.rejects(confirmSelfTestInvocation(directory, snapshotPath));
    const outcomes = await Promise.allSettled([1, 2].map(async () => consumeInvocationAuthorization(directory, auth.path, snapshot)));
    assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
    assert.equal((await runG5d4AuthorizedStep({ runDirectory: directory, snapshotPath, confirmedAuthorizationPath: auth.path })).childSpawnCount, 0);
  });
});
test("same count different row set after authorization rejects before dispatch", async () => {
  await withSnapshot(actual(), "provider", async ({ directory, snapshotPath, state, reader }) => {
    const auth = await confirmSelfTestInvocation(directory, snapshotPath); state.value.a.database.evidence.weak_words[0].id = id(901);
    let calls = 0;
    const result = await runG5d4InvocationSelfTestOnly({ runDirectory: directory, snapshotPath, confirmedAuthorizationPath: auth.path }, reader, async () => { calls++; });
    assert.equal(result.verdict, "REJECT"); assert.equal(calls, 0);
  });
});
for (const n of [0, 1, 4]) test(`Database post variable D/A/R with ${n} weak words`, () => {
  const pre = priorTerminal(actual(n)); const { after, child } = databasePost(pre);
  assert.equal(verifyInvocationPost({ context, actual: pre, spec: plannedInvocation(pre, context, "database") }, after, child).verdict, "PASS");
});
for (const [label, mutate] of [
  ["anonymized identity", a => a.byIdentity.quota_events[0].id = id(999)],
  ["retained identity", a => a.byIdentity.account_deletion_provider_targets[0].id = id(999)],
  ["anonymized identifier", a => a.byIdentity.quota_events[0].subject_id = id(999)],
  ["unexpected residual", a => a.a.database.evidence.weak_words.push({ id: id(999), owner_id: context.a.userId, created_at: stamp })],
  ["counts mismatch", a => a.request.db_deleted_row_count++],
  ["B changed", a => a.b.storage.evidence[0].version = "changed"]
]) test(`Database rejects ${label}`, () => {
  const pre = priorTerminal(actual()); const { after, child } = databasePost(pre); mutate(after);
  assert.throws(() => verifyInvocationPost({ context, actual: pre, spec: plannedInvocation(pre, context, "database") }, after, child));
});
function externalPost(pre, stage) {
  const post = clone(pre); const target = post[`${stage}Targets`][0]; target.status = stage === "provider" ? "deleted" : "delete_requested"; target.delete_attempt_count = 1; target.delete_outcome = "succeeded";
  if (stage === "provider") { post.a.provider.state = "absent"; post.a.provider.evidence = null; }
  else { post.a.storage.evidence = post.a.storage.evidence.filter(x => x.key !== target.storage_object_key); }
  return post;
}
const progressChild = { status: "blocked", progress: { marker: "progressed", terminal: false, retryable: true, manualReviewRequired: false } };
for (const stage of ["provider", "storage"]) test(`A post ${stage} absent PASS with B unchanged`, async () => {
  const pre = actual();
  if (stage === "storage") { const p = priorTerminal(clone(pre)); pre.request.provider_cleanup_status = p.request.provider_cleanup_status; pre.request.provider_sub_finalized_at = stamp; pre.providerTargets[0] = p.providerTargets[0]; pre.a.database.evidence.account_deletion_provider_targets = pre.providerTargets; pre.a.provider = p.a.provider; }
  await withSnapshot(pre, stage, async ({ directory, snapshotPath, state, reader }) => {
    const auth = await confirmSelfTestInvocation(directory, snapshotPath);
    const result = await runG5d4InvocationSelfTestOnly({ runDirectory: directory, snapshotPath, confirmedAuthorizationPath: auth.path }, reader, async () => { state.value = externalPost(pre, stage); return { exitCode: 2, stdout: JSON.stringify(progressChild), stderr: "" }; });
    assert.equal(result.verdict, "PASS"); assert.equal(result.invocationCount, 1); assert.equal(result.bUnchanged, true);
  });
});
for (const scenario of ["response_loss", "malformed_output", "post_unknown", "B_changed"]) test(`${scenario}: immediate post-read then mandatory STOP without retry`, async () => {
  await withSnapshot(actual(), "provider", async ({ directory, snapshotPath, state, reader }) => {
    const auth = await confirmSelfTestInvocation(directory, snapshotPath); let reads = 0; let calls = 0;
    const measured = { ...reader, read: async input => { reads++; return reader.read(input); } };
    const result = await runG5d4InvocationSelfTestOnly({ runDirectory: directory, snapshotPath, confirmedAuthorizationPath: auth.path }, measured, async () => {
      calls++; state.value = externalPost(state.value, "provider");
      if (scenario === "response_loss") throw new Error("lost");
      if (scenario === "post_unknown") state.value.a.provider.state = "unknown";
      if (scenario === "B_changed") state.value.b.auth.evidence.confirmed = false;
      return { exitCode: 2, stdout: scenario === "malformed_output" ? "lost" : JSON.stringify(progressChild), stderr: "" };
    });
    assert.equal(result.verdict, "REJECT"); assert.equal(calls, 1); assert.equal(reads, 2);
    assert.equal(result.retryCount, 0); assert.equal(result.chainingCount, 0);
  });
});
test("Auth exact-user absence and Completion prior terminals/replay", () => {
  const pre = priorTerminal(actual()); const { after } = databasePost(pre);
  const authBefore = clone(after);
  Object.assign(after.request, { auth_cleanup_status: "succeeded", auth_sub_finalized_at: finalized, user_id: null, owner_id: null, auth_delete_target_user_id: null, auth_verification_result: null, auth_verified_absent_at: finalized });
  after.a.database.evidence.account_deletion_requests = [];
  after.a.database.evidence.account_deletion_provider_targets = [];
  after.a.database.evidence.account_deletion_storage_targets = [];
  for (const t of [...after.providerTargets, ...after.storageTargets]) { t.user_id = null; t.owner_id = null; }
  after.a.auth.state = "absent"; after.a.auth.evidence = null;
  const child = { status: "succeeded", progress: { marker: "terminal", terminal: true, retryable: false, manualReviewRequired: false } };
  const authSnapshot = { context, actual: authBefore, spec: plannedInvocation(authBefore, context, "auth") };
  assert.equal(verifyInvocationPost(authSnapshot, after, child).verdict, "PASS");
  const wrong = clone(after); wrong.a.auth.identity = context.b.userId; assert.throws(() => verifyInvocationPost(authSnapshot, wrong, child));
  const compSnapshot = { context, actual: clone(after), spec: plannedInvocation(after, context, "completion") };
  after.request.status = "completed"; after.request.completed_at = finalized;
  assert.equal(verifyInvocationPost(compSnapshot, after, child).verdict, "PASS");
  const replay = { context, actual: clone(after), spec: plannedInvocation(after, context, "completion") };
  assert.equal(verifyInvocationPost(replay, after, child).verdict, "PASS");
  after.request.completed_at = stamp; assert.throws(() => verifyInvocationPost(replay, after, child));
  after.request.storage_sub_finalized_at = null; assert.throws(() => plannedInvocation(after, context, "completion"));
});
test("proof-only external guards reject wrong target/action and second dispatch", async () => {
  const raw = actual(); const snapshot = { context, actual: raw, spec: plannedInvocation(raw, context, "provider") }; let calls = 0;
  const guarded = guardInvocationExternal({ deleteVoice: async () => { calls++; }, reconcileVoiceAbsence: async () => { calls++; } }, snapshot);
  await assert.rejects(guarded.deleteVoice({ providerResourceId: context.b.providerId }));
  await assert.rejects(guarded.reconcileVoiceAbsence({ providerResourceId: context.a.providerId }));
  await guarded.deleteVoice({ providerResourceId: context.a.providerId });
  await assert.rejects(guarded.deleteVoice({ providerResourceId: context.a.providerId })); assert.equal(calls, 1);
});
test("Database decorator forwards original three-argument contract once, no row-set RPC input", async () => {
  const raw = priorTerminal(actual()); const snapshot = { context, actual: raw, spec: plannedInvocation(raw, context, "database") }; const received = [];
  const repository = guardInvocationRepository({ finalizeDatabaseStage: async input => received.push(input) }, snapshot);
  const input = { deletionRequestId: context.requestId, userId: context.a.userId, inventoryVersion: INVENTORY_VERSION };
  await repository.finalizeDatabaseStage(input); await assert.rejects(repository.finalizeDatabaseStage(input));
  assert.deepEqual(received, [input]);
});
test("historical evidence stays historical: manifest-only run cannot enter current live path", async () => {
  const result = await runG5d4AuthorizedStep({ runDirectory: "/historical", confirmedAuthorizationPath: "/historical/auth", microStep: "database_cleanup" });
  assert.equal(result.childSpawnCount, 0);
  const source = readFileSync(new URL("./g5d4-invocation-evidence.mjs", import.meta.url), "utf8");
  assert.ok(!source.includes("observedRows !== 22"));
});

test("class-based Provider adapter preserves method receiver and only exact allowed capabilities", async () => {
  class Adapter {
    count = 0;
    async deleteVoice() { this.count++; }
    async reconcileVoiceAbsence() { throw new Error("unapproved"); }
    async diagnose() { throw new Error("not exposed"); }
  }
  const raw = actual(); const adapter = new Adapter();
  const guarded = guardInvocationExternal(adapter, { context, actual: raw, spec: plannedInvocation(raw, context, "provider") });
  assert.equal(guarded.diagnose, undefined);
  await guarded.deleteVoice({ providerResourceId: context.a.providerId }); assert.equal(adapter.count, 1);
});
for (const stage of ["provider", "storage"]) test(`${stage} seal, verify and finalize remain separate invocations`, () => {
  const pre = actual();
  if (stage === "storage") {
    const prior = priorTerminal(clone(pre)); pre.request.provider_cleanup_status = "succeeded"; pre.request.provider_sub_finalized_at = stamp;
    pre.a.provider = prior.a.provider; pre.providerTargets = prior.providerTargets; pre.a.database.evidence.account_deletion_provider_targets = pre.providerTargets;
  }
  const sealed = clone(pre); pre.request[`${stage}_snapshot_status`] = "pending"; pre.request[`${stage}_snapshot_target_count`] = 0;
  pre[`${stage}Targets`] = []; pre.a.database.evidence[`account_deletion_${stage}_targets`] = [];
  const sealSpec = plannedInvocation(pre, context, stage); assert.equal(sealSpec.action, "seal");
  assert.equal(verifyInvocationPost({ context, actual: pre, spec: sealSpec }, sealed, { ...progressChild, progress: { ...progressChild.progress, marker: "seal_only" } }).verdict, "PASS");
  const deleted = externalPost(sealed, stage); const spec = plannedInvocation(deleted, context, stage); assert.equal(spec.action, "verify");
  const verified = clone(deleted); verified[`${stage}Targets`][0].status = "verified_absent";
  verified[`${stage}Targets`][0][stage === "provider" ? "reconciliation_status" : "verification_status"] = "verified_absent";
  assert.equal(verifyInvocationPost({ context, actual: deleted, spec }, verified, { ...progressChild, progress: { ...progressChild.progress, marker: "target_verified" } }).verdict, "PASS");
  if (stage === "provider") assert.equal(plannedInvocation(verified, context, stage).action, "finalize");
  else assert.equal(plannedInvocation(verified, context, stage).action, "delete");
});
test("additional actual quota changes D/A/R without fixed acceptance total", () => {
  const pre = priorTerminal(actual(0)); pre.a.database.evidence.quota_events.push({ ...pre.a.database.evidence.quota_events[0], id: id(990) });
  const { after, child } = databasePost(pre);
  assert.equal(verifyDatabasePost(pre, after, child).anonymized, 2);
});

// Source-isolated transport tests: no real factory credentials, network or live capability.
let transportModule;
async function isolatedTransport() {
  if (transportModule) return transportModule;
  let source = readFileSync(new URL("./g5d4-live-read-only-adapters.mjs", import.meta.url), "utf8");
  source = source.replace('const ROOT = resolve(new URL("..", import.meta.url).pathname);', `const ROOT = ${JSON.stringify(new URL("..", import.meta.url).pathname)};`)
    .replaceAll('"zod"', JSON.stringify(import.meta.resolve("zod")))
    .replaceAll('"dotenv"', JSON.stringify(import.meta.resolve("dotenv")))
    .replaceAll('"./g5d4-proof-contract.mjs"', JSON.stringify(new URL("./g5d4-proof-contract.mjs", import.meta.url).href));
  source = source.replace(/function credentials\(\) \{[\s\S]*?\n\}/, 'function credentials() { return {service:"synthetic", provider:"synthetic", management:"synthetic"}; }');
  source = source.replace(/async function request\(url, headers, body\) \{[\s\S]*?\n\}/, `async function request(url, headers, body) {
    let data;
    if(url.endsWith('/database/query/read-only')) {
      queries.push(body.query);
      if(body.query.includes('schema_migrations')) data=${JSON.stringify(G5D4_REQUIRED_MIGRATIONS.map(version => ({ version })))};
      else if(body.query.includes('storage.objects')) data=[];
      else data=[{owned: Object.fromEntries(${JSON.stringify(TABLES)}.map(t => [t, t === 'account_deletion_requests' ? [{id:${JSON.stringify(context.requestId)}}] : []]))}];
    } else data={id:${JSON.stringify(G5D4_CANONICAL_STAGING.projectRef)},name:'native-minute-staging',region:'ap-northeast-1',status:'ACTIVE_HEALTHY'};
    return {json:async()=>data};
  }`);
  source += `\nexport const queries=[]; export const responses={provider:{status:404,body:{detail:{type:'not_found',code:'voice_not_found'}}},auth:{status:404,body:{code:'user_not_found'}}};
    const fetch=async url=>{const r=responses[url.includes('elevenlabs')?'provider':'auth']; if(r.throw) throw new Error('synthetic network'); if(r.timeout) throw new DOMException('synthetic timeout','TimeoutError'); return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>{if(r.jsonError) throw new SyntaxError('synthetic malformed JSON'); return r.body;}};};
    export {INVOCATION_FIELDS, invocationRowsQuery};`;
  transportModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  return transportModule;
}
test("every new invocation SQL projection matches canonical source column inventory", async () => {
  const module = await isolatedTransport(); const types = readFileSync(new URL("../types/database.ts", import.meta.url), "utf8");
  for (const [table, fields] of Object.entries(module.INVOCATION_FIELDS)) {
    const start = types.indexOf(`      ${table}: {\n        Row: {`); assert.ok(start >= 0, table);
    const row = types.slice(start, types.indexOf("        Insert:", start));
    for (const field of fields) assert.ok(new RegExp(`\\b${field}:`).test(row), `${table}.${field}`);
  }
  const query = module.invocationRowsQuery(context.a.userId, Object.fromEntries(TABLES.map(t => [t, [id(1)]])));
  assert.ok(query.includes("left join public.takes")); assert.ok(query.includes("t.id in ("));
  assert.throws(() => module.invocationRowsQuery("SQL injection"));
});
for (const kind of ["provider", "auth"]) for (const scenario of ["strict_absent", "generic_404", "permission", "network", "unexpected_success"]) test(`actual ${kind} transport ${scenario}`, async () => {
  const module = await isolatedTransport();
  const response = module.responses[kind]; const original = clone(response);
  try {
    if (scenario === "generic_404") response.body = {};
    if (scenario === "permission") response.status = 403;
    if (scenario === "network") response.throw = true;
    if (scenario === "unexpected_success") { response.status = 200; response.body = {}; }
    const state = await module.createLiveReadOnlyAdapters().invocation.read({ context });
    assert.equal(state.a[kind].state, scenario === "strict_absent" ? "absent" : "unknown");
    assert.ok(module.queries.every(q => q.startsWith("select ")));
  } finally { module.responses[kind] = original; }
});

// Run the real shared product adapter against the same synthetic responses as
// the existing source-isolated proof transport. No live factory is armed here.
let productAdapterModule;
async function isolatedProductAdapter() {
  if (!productAdapterModule) {
    const { default: ts } = await import("typescript");
    const source = readFileSync(new URL("../providers/voice-deletion/elevenlabs.ts", import.meta.url), "utf8")
      .replace('import "server-only";', ''); // Test runtime only; production marker stays intact.
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    productAdapterModule = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  }
  return productAdapterModule;
}
const exactNotFound = { detail: { type: "not_found", code: "voice_not_found" } };
const presentVoice = { voice_id: context.a.providerId, category: "cloned", created_at_unix: 1788220800, is_owner: true };
const absenceMatrix = [
  ...[400, 404].map(status => ({ name: `${status} exact not-found`, status, body: exactNotFound, expected: "absent" })),
  ...[400, 404].flatMap(status => [
    { name: "generic", body: { error: "synthetic rejection" } },
    { name: "wrong code", body: { detail: { type: "not_found", code: "wrong" } } },
    { name: "wrong type", body: { detail: { type: "wrong", code: "voice_not_found" } } },
    { name: "missing detail", body: {} },
    { name: "nonobject detail", body: { detail: "not_found" } },
    { name: "whitespace type", body: { detail: { type: " not_found", code: "voice_not_found" } } },
    { name: "whitespace code", body: { detail: { type: "not_found", code: "voice_not_found " } } },
    { name: "invalid JSON", body: null, jsonError: true }
  ].map(value => ({ ...value, name: `${status} ${value.name}`, status, expected: "unknown" }))),
  ...[401, 403, 409, 418, 422, 429, 500, 503, 200, 201, 302].map(status => ({ name: `${status} exact tokens cannot grant absence`, status, body: exactNotFound, expected: "unknown" })),
  { name: "network failure", status: 404, body: exactNotFound, throw: true, expected: "unknown" },
  { name: "timeout", status: 404, body: exactNotFound, timeout: true, expected: "unknown" },
  { name: "matching voice", status: 200, body: presentVoice, expected: "present" },
  { name: "wrong voice identity", status: 200, body: { ...presentVoice, voice_id: context.b.providerId }, expected: "unknown" },
  { name: "extraneous metadata preserves present", status: 200, body: { ...presentVoice, extra: "synthetic metadata" }, expected: "present" },
  { name: "missing voice identity", status: 200, body: { category: "cloned" }, expected: "unknown" }
];
for (const entry of absenceMatrix) test(`Provider product/proof semantic parity: ${entry.name}`, async () => {
  const proof = await isolatedTransport(); const original = clone(proof.responses.provider);
  try {
    Object.keys(proof.responses.provider).forEach(key => delete proof.responses.provider[key]);
    Object.assign(proof.responses.provider, clone(entry));
    const { createElevenLabsVoiceDeletionProviderAdapter } = await isolatedProductAdapter();
    let calls = 0;
    const fetchImpl = async (url, init) => {
      calls++;
      assert.equal(url, `https://api.elevenlabs.io/v1/voices/${context.a.providerId}`);
      assert.equal(init.method, "GET");
      if (entry.throw) throw new Error("synthetic network");
      if (entry.timeout) return new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("synthetic timeout")), { once: true }));
      return { status: entry.status, json: async () => { if (entry.jsonError) throw new SyntaxError("synthetic JSON"); return clone(entry.body); } };
    };
    const adapter = createElevenLabsVoiceDeletionProviderAdapter({ env: { ELEVENLABS_API_KEY: "synthetic" }, fetchImpl, timeoutMs: 10 });
    const result = await adapter.reconcileVoiceAbsenceWithSafeEvidence({ providerResourceId: context.a.providerId });
    const productState = result.result.kind === "verified_absent" ? "absent" : result.result.kind === "present" ? "present" : "unknown";
    const proofState = (await proof.createLiveReadOnlyAdapters().invocation.read({ context })).a.provider.state;
    assert.equal(productState, entry.expected);
    assert.equal(proofState, entry.expected);
    assert.equal(productState, proofState);
    assert.equal(calls, 1);
    if (entry.timeout) assert.equal(result.result.kind, "timeout");
    if (entry.expected === "absent") {
      assert.equal(result.evidence.mapperBranch, "strict_voice_not_found");
      assert.equal(result.evidence.httpStatusCategory, "not_found");
    }
  } finally {
    Object.keys(proof.responses.provider).forEach(key => delete proof.responses.provider[key]);
    Object.assign(proof.responses.provider, original);
  }
});

test("Provider 400 acceptance does not broaden Auth absence", async () => {
  const proof = await isolatedTransport(); const original = clone(proof.responses.auth);
  try {
    Object.assign(proof.responses.auth, { status: 400, body: { code: "user_not_found" } });
    const observed = await proof.createLiveReadOnlyAdapters().invocation.read({ context });
    assert.equal(observed.a.auth.state, "unknown");
  } finally { Object.assign(proof.responses.auth, original); }
});

test("new Provider signal acceptance cannot promote a saved historical UNKNOWN post", async () => {
  await withSnapshot(actual(), "provider", async ({ directory, snapshot }) => {
    const after = clone(snapshot.actual);
    Object.assign(after.providerTargets[0], { status: "deleted", delete_outcome: "succeeded", delete_attempt_count: 1 });
    Object.assign(after.a.provider, { state: "unknown", evidence: null });
    const draft = { snapshotDigest: snapshot.digest, collectedAt: stamp, actual: after };
    const post = { ...draft, digest: hmacSha256Hex(readAliasKey(directory), "invocation-post-evidence", draft) };
    const path = writePrivateProofArtifact(directory, "historical-unknown-post.json", post);
    const bytes = readFileSync(path);
    const proof = await isolatedTransport(); const original = clone(proof.responses.provider);
    try {
      Object.assign(proof.responses.provider, { status: 400, body: exactNotFound });
      assert.equal((await proof.createLiveReadOnlyAdapters().invocation.read({ context })).a.provider.state, "absent");
      const saved = readPrivateJson(directory, path);
      assert.throws(() => verifyInvocationPost(snapshot, saved.actual, {
        status: "blocked", progress: { marker: "progressed", terminal: false, manualReviewRequired: false }
      }), /unknown resource state/);
      assert.equal(saved.digest, post.digest);
      assert.deepEqual(readFileSync(path), bytes);
    } finally { Object.assign(proof.responses.provider, original); }
  });
});

test("inconsistent owned/exact request reads reject snapshot authority", () => {
  const raw = actual(); raw.request = { ...raw.request, status: "processing" };
  assert.throws(() => validateActualState(raw, context));
});

// Exercise the real B transport projection through private snapshots and the
// wrapper, with synthetic HTTP responses and the existing fake DB/Storage only.
function bResponses() {
  return {
    auth: { status: 200, body: { id: context.b.userId, email: "b-control@example.invalid",
      identities: [{ user_id: context.b.userId, provider: "email", identity_id: id(800) }],
      email_confirmed_at: stamp, banned_until: null } },
    provider: { status: 200, body: { voice_id: context.b.providerId, category: "cloned", created_at_unix: 1788220800,
      name: "Private B control voice", settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, speed: 1, use_speaker_boost: true } } }
  };
}
async function collectBResponses(responses) {
  const module = await isolatedTransport(); const saved = { ...module.responses };
  try {
    Object.assign(module.responses, responses);
    const observed = await module.createLiveReadOnlyAdapters().invocation.read({ context });
    assert.ok(module.queries.every(q => q.startsWith("select ")));
    return { auth: observed.b.auth, provider: observed.b.provider };
  } finally { Object.assign(module.responses, saved); }
}

// Same module-owned current-identity entry as live; only HTTP is source-isolated.
for (const [label, mutate, accepted] of [
  ["omitted ban", r => { delete r.body.banned_until; }, true],
  ["null ban", () => {}, true],
  ["expired ban", r => { r.body.banned_until = "2000-01-01T09:00:00+09:00"; }, true],
  ["active ban", r => { r.body.banned_until = "2999-01-01T00:00:00Z"; }, false],
  ["invalid ban", r => { r.body.banned_until = "invalid"; }, false],
  ["explicit undefined ban", r => { r.body.banned_until = undefined; }, false],
  ["wrong exact user", r => { r.body.id = context.a.userId; }, false],
  ["wrong identity owner", r => { r.body.identities[0].user_id = context.a.userId; }, false],
  ["ambiguous identity", r => { r.body.identities.push(clone(r.body.identities[0])); }, false],
  ["unconfirmed", r => { r.body.email_confirmed_at = null; }, false],
  ["malformed confirmation", r => { r.body.email_confirmed_at = "invalid"; }, false],
  ["malformed contact", r => { r.body.email = "invalid"; }, false],
  ["malformed identity", r => { r.body.identities[0].identity_id = "invalid"; }, false],
  ["deleted", r => { r.body.deleted_at = stamp; }, false],
  ["wrong identity provider", r => { r.body.identities[0].provider = "other"; }, false],
  ["HTTP 201", r => { r.status = 201; }, false],
  ["HTTP 401", r => { r.status = 401; }, false],
  ["HTTP 403", r => { r.status = 403; }, false],
  ["canonical absent", r => { r.status = 404; r.body = { code: "user_not_found" }; }, false],
  ["generic 404", r => { r.status = 404; r.body = {}; }, false],
  ["network failure", r => { r.throw = true; }, false],
  ["timeout", r => { r.timeout = true; }, false],
  ["malformed JSON", r => { r.jsonError = true; }, false]
]) test(`current recording identity Auth transport ${label}`, async () => {
  const module = await isolatedTransport(); const original = module.responses.auth;
  const response = bResponses().auth; mutate(response); module.responses.auth = response;
  const before = module.queries.length;
  try {
    const read = () => module.createLiveReadOnlyAdapters().reader.readCurrentRecordingIdentity({ fixtureRole: "fixture_b", userId: context.b.userId });
    if (accepted) {
      const result = await read();
      assert.equal(result.userId, context.b.userId); assert.equal(result.fixtureRole, "fixture_b");
      assert.equal(result.auth.state, "present");
      assert.deepEqual(Object.keys(result).sort(), ["auth", "fixtureRole", "userId"]);
      assert.equal(result.auth.evidence.bannedUntil, label === "expired ban" ? "2000-01-01T00:00:00.000Z" : null);
    } else await assert.rejects(read);
    // Gate SELECT only; no baseline/product/Storage reads and no Provider request.
    assert.deepEqual(module.queries.slice(before), ["select version from supabase_migrations.schema_migrations order by version"]);
  } finally { module.responses.auth = original; }
});

const banA = "2099-01-01T00:00:00.000Z";
const banB = "2099-01-02T00:00:00.000Z";
const bMaterialChanges = [
  ["Auth omitted ban to banned", r => { r.auth.body.banned_until = banA; }, r => { delete r.auth.body.banned_until; }],
  ["Auth banned to omitted ban", r => { delete r.auth.body.banned_until; }, r => { r.auth.body.banned_until = banA; }],
  ["Auth unbanned to banned", r => { r.auth.body.banned_until = banA; }, r => { r.auth.body.banned_until = null; }],
  ["Auth banned to unbanned", r => { r.auth.body.banned_until = null; }, r => { r.auth.body.banned_until = banA; }],
  ["Auth banned-until changes", r => { r.auth.body.banned_until = banB; }, r => { r.auth.body.banned_until = banA; }],
  ["Auth submillisecond ban changes", r => { r.auth.body.banned_until = "2099-01-01T00:00:00.000002Z"; }, r => { r.auth.body.banned_until = "2099-01-01T00:00:00.000001Z"; }],
  ["Provider name changes", r => { r.provider.body.name = "Changed private voice"; }],
  ...Object.entries({ stability: 0.7, similarity_boost: 0.6, style: 0.3, speed: 1.1, use_speaker_boost: false })
    .map(([key, value]) => [`Provider ${key} changes`, r => { r.provider.body.settings[key] = value; }])
];
for (const [label, change, prepare = () => {}] of bMaterialChanges) {
  test(`B control ${label}: post-action changed REJECT`, async () => {
    const responses = bResponses(); prepare(responses);
    const pre = actual(); Object.assign(pre.b, await collectBResponses(responses));
    await withSnapshot(pre, "provider", async ({ directory, snapshotPath, reader, state }) => {
      const authorization = await confirmSelfTestInvocation(directory, snapshotPath);
      let calls = 0;
      const result = await runG5d4InvocationSelfTestOnly({ runDirectory: directory, snapshotPath, confirmedAuthorizationPath: authorization.path }, reader, async () => {
        calls++; state.value = externalPost(pre, "provider"); change(responses);
        Object.assign(state.value.b, await collectBResponses(responses));
        if (label === "Auth banned to omitted ban") assert.equal(state.value.b.auth.evidence.bannedUntil, null);
        assert.deepEqual(state.value.b.database, pre.b.database);
        assert.deepEqual(state.value.b.storage, pre.b.storage);
        assert.deepEqual(state.value.b[label.startsWith("Auth") ? "provider" : "auth"], pre.b[label.startsWith("Auth") ? "provider" : "auth"]);
        return { exitCode: 2, stdout: JSON.stringify(progressChild), stderr: "" };
      });
      assert.equal(result.verdict, "REJECT"); assert.equal(result.bUnchanged, false);
      assert.equal(result.status, "STOP"); assert.equal(result.invocationCount, 1); assert.equal(calls, 1);
      assert.equal(result.retryCount, 0); assert.equal(result.chainingCount, 0);
    });
  });
  test(`B control ${label}: approved snapshot drift rejects before dispatch`, async () => {
    const responses = bResponses(); prepare(responses);
    const pre = actual(); Object.assign(pre.b, await collectBResponses(responses));
    await withSnapshot(pre, "provider", async ({ directory, snapshotPath, snapshot, safe, state, reader }) => {
      const authorization = await confirmSelfTestInvocation(directory, snapshotPath);
      change(responses); Object.assign(state.value.b, await collectBResponses(responses));
      if (label === "Auth banned to omitted ban") assert.equal(state.value.b.auth.evidence.bannedUntil, null);
      const { digest, ...draft } = snapshot;
      assert.equal(hmacSha256Hex(readAliasKey(directory), "actual-invocation-snapshot", draft), digest);
      draft.actual = clone(state.value);
      assert.notEqual(hmacSha256Hex(readAliasKey(directory), "actual-invocation-snapshot", draft), digest);
      const serialized = JSON.stringify(safe);
      for (const secret of ["b-control@example.invalid", "Private B control voice", context.b.userId, context.b.providerId, "bannedUntil", "settings"]) assert.ok(!serialized.includes(secret));
      let calls = 0;
      const result = await runG5d4InvocationSelfTestOnly({ runDirectory: directory, snapshotPath, confirmedAuthorizationPath: authorization.path }, reader, async () => { calls++; });
      assert.equal(calls, 0); assert.equal(result.invocationCount, 0);
      assert.equal(result.verdict, "REJECT"); assert.equal(result.bUnchanged, false); assert.equal(result.status, "STOP");
    });
  });
}
for (const [label, mutate, prepare = () => {}] of [
  ["all four categories unchanged", () => {}],
  ["optional Auth ban omitted", () => {}, r => { delete r.auth.body.banned_until; }],
  ["optional Auth ban omitted to null", r => { r.auth.body.banned_until = null; }, r => { delete r.auth.body.banned_until; }],
  ["optional Auth ban null to omitted", r => { delete r.auth.body.banned_until; }],
  ["unchanged banned Auth state", () => {}, r => { r.auth.body.banned_until = banA; }],
  ["semantic settings with different key order", r => { r.provider.body.settings = Object.fromEntries(Object.entries(r.provider.body.settings).reverse()); }],
  ["equivalent Auth timestamps", r => { r.auth.body.email_confirmed_at = "2026-09-01T09:00:00+09:00"; r.auth.body.banned_until = "2099-01-01T09:00:00.000000+09:00"; }, r => { r.auth.body.banned_until = banA; }],
  ["unrelated volatile metadata", r => {
    Object.assign(r.auth.body, { last_sign_in_at: banA, updated_at: banB, user_metadata: { request_id: "unrelated" } });
    Object.assign(r.provider.body, { request_id: "unrelated", updated_at: banB, workspace: { internal: "unrelated" }, pagination: { next: "unrelated" } });
    r.provider.body.settings.request_metadata = { transient: true };
  }]
]) test(`B control ${label}: A expected deletion does not false-fail B`, async () => {
  const responses = bResponses(); prepare(responses);
  const pre = actual(); Object.assign(pre.b, await collectBResponses(responses));
  await withSnapshot(pre, "provider", async ({ directory, snapshotPath, snapshot, state, reader }) => {
    const authorization = await confirmSelfTestInvocation(directory, snapshotPath);
    // Equivalent canonical state also remains usable after authorization.
    mutate(responses); Object.assign(state.value.b, await collectBResponses(responses));
    assert.deepEqual(state.value.b, snapshot.actual.b);
    if (label.startsWith("optional Auth ban")) assert.equal(state.value.b.auth.evidence.bannedUntil, null);
    const { digest, ...draft } = snapshot;
    draft.actual = clone(state.value);
    assert.equal(hmacSha256Hex(readAliasKey(directory), "actual-invocation-snapshot", draft), digest);
    const result = await runG5d4InvocationSelfTestOnly({ runDirectory: directory, snapshotPath, confirmedAuthorizationPath: authorization.path }, reader, async () => {
      state.value = externalPost(pre, "provider"); Object.assign(state.value.b, await collectBResponses(responses));
      return { exitCode: 2, stdout: JSON.stringify(progressChild), stderr: "" };
    });
    assert.equal(result.verdict, "PASS"); assert.equal(result.bUnchanged, true);
    assert.equal(result.invocationCount, 1); assert.equal(result.status, "STOP");
  });
});

for (const kind of ["auth", "provider"]) for (const [label, breakResponse] of [
  ["network", r => { r.throw = true; }],
  ["permission", r => { r.status = 403; }],
  ["generic not-found", r => { r.status = 404; r.body = {}; }],
  ["null response", r => { r.body = null; }],
  ["malformed response", r => { r.body = {}; }],
  ...(kind === "auth" ? [
    ["explicit undefined ban state", r => { r.body.banned_until = undefined; }],
    ["timeout", r => { r.timeout = true; }],
    ["malformed JSON", r => { r.jsonError = true; }],
    ...[201, 202, 204, 206, 301, 401, 500].map(status => [`unexpected HTTP ${status}`, r => { r.status = status; }]),
    ["missing user object", r => { r.body = undefined; }],
    ["wrapped user object", r => { r.body = { user: r.body }; }],
    ["user ID mismatch", r => { r.body.id = context.a.userId; }],
    ["ambiguous identity", r => { r.body.identities.push(clone(r.body.identities[0])); }],
    ["identity owner mismatch", r => { r.body.identities[0].user_id = context.a.userId; }],
    ["invalid contact", r => { r.body.email = "invalid"; }],
    ["invalid ban timestamp", r => { r.body.banned_until = "not-a-time"; }],
    ["numeric ban timestamp", r => { r.body.banned_until = 0; }],
    ["timezone-less ban timestamp", r => { r.body.banned_until = "2099-01-01T00:00:00"; }],
    ["malformed identity", r => { r.body.identities[0].identity_id = "invalid"; }],
    ["invalid confirmation timestamp", r => { r.body.email_confirmed_at = "invalid"; }]
  ] : [
    ["missing name", r => { delete r.body.name; }],
    ["null settings", r => { r.body.settings = null; }],
    ["missing settings", r => { delete r.body.settings; }],
    ["partial settings", r => { delete r.body.settings.speed; }],
    ["malformed settings", r => { r.body.settings.stability = "0.5"; }],
    ["nonfinite settings", r => { r.body.settings.speed = Infinity; }],
    ["ambiguous verification", r => { r.body.voice_verification = { requires_verification: true }; }]
  ])
]) test(`B control ${kind} ${label}: unknown rejects snapshot and post-proof`, async () => {
  const responses = bResponses(); const pre = actual(); Object.assign(pre.b, await collectBResponses(responses));
  await withSnapshot(pre, "provider", async ({ directory, snapshotPath, state, reader }) => {
    const authorization = await confirmSelfTestInvocation(directory, snapshotPath);
    // Optional omission must never rescue an otherwise invalid Auth response.
    if (kind === "auth") delete responses.auth.body.banned_until;
    breakResponse(responses[kind]); const unknown = await collectBResponses(responses);
    assert.deepEqual(unknown[kind], { state: "unknown", identity: kind === "auth" ? context.b.userId : context.b.providerId, evidence: null });
    const invalid = clone(pre); Object.assign(invalid.b, unknown);
    await assert.rejects(withSnapshot(invalid, "provider", () => { assert.fail("unknown snapshot accepted"); }));
    const result = await runG5d4InvocationSelfTestOnly({ runDirectory: directory, snapshotPath, confirmedAuthorizationPath: authorization.path }, reader, async () => {
      state.value = externalPost(pre, "provider"); Object.assign(state.value.b, unknown);
      return { exitCode: 2, stdout: JSON.stringify(progressChild), stderr: "" };
    });
    assert.equal(result.verdict, "REJECT"); assert.equal(result.bUnchanged, false);
    assert.equal(result.invocationCount, 1); assert.equal(result.status, "STOP");
  });
});
