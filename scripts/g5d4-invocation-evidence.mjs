// Current invocation evidence only. Historical fixture manifests are never read.
import { z } from "zod";
import {
  G5D4_A_PREP_TABLE_CONTRACT, G5D4_CANONICAL_STAGING, G5D4_REQUIRED_MIGRATIONS,
  G5D4_STORAGE_BUCKETS, G5D4_WRITER_INTENT_KINDS, canonicalJson, hmacSha256Hex,
  g5d4EnvironmentInspectionSchema, g5d4MigrationInspectionSchema, g5d4GitInspectionSchema
} from "./g5d4-proof-contract.mjs";

export const INVOCATION_VERSION = "g5d4.actual-invocation.v1";
export const INVENTORY_VERSION = "g5d-2h.account-db.v1";
export const TABLES = G5D4_A_PREP_TABLE_CONTRACT.map(({ table }) => table);
export const STAGES = ["provider", "storage", "database", "auth", "completion"];
const uuid = z.string().uuid();
const locator = z.object({ bucket: z.enum(G5D4_STORAGE_BUCKETS), key: z.string().min(1).max(1024) }).strict();
const party = z.object({ userId: uuid, providerId: z.string().regex(/^[A-Za-z0-9]{20}$/), storage: z.array(locator).length(4) }).strict();
export const invocationContextSchema = z.object({
  version: z.literal(INVOCATION_VERSION), purpose: z.enum(["live", "self_test"]),
  a: party, b: party, requestId: uuid, requestRef: z.string().regex(/^adr_[0-9a-f]{32}$/)
}).strict().superRefine((value, ctx) => {
  if (value.a.userId === value.b.userId || value.a.providerId === value.b.providerId) ctx.addIssue({ code: "custom", message: "A/B identity separation" });
  for (const p of [value.a, value.b]) {
    if (new Set(p.storage.map(x => x.bucket)).size !== 4 || p.storage.some(x => !x.key.startsWith(`${p.userId}/`) || x.key.split("/").some(y => !y || y === "." || y === ".."))) {
      ctx.addIssue({ code: "custom", message: "exact owned four Storage classes" });
    }
  }
});
export const invocationSpecSchema = z.object({
  stage: z.enum(STAGES), action: z.enum(["seal", "delete", "verify", "finalize", "auth_step", "complete", "replay"]),
  targetId: uuid, maxCalls: z.literal(1)
}).strict();
export function evidenceAssert(ok, label) { if (!ok) throw new Error(`invocation evidence rejected: ${label}`); }
export function exactEvidence(a, b, label) { evidenceAssert(canonicalJson(a) === canonicalJson(b), label); }
export function requirePresence(observed, expected) {
  evidenceAssert(observed && ["present", "absent"].includes(observed.state), "unknown resource state");
  if (expected) evidenceAssert(observed.state === expected, "resource presence mismatch");
  return observed;
}
export async function observeReadOnly(read) {
  try { const value = await read(); requirePresence(value); return value; }
  catch { return { state: "unknown", evidence: null }; }
}
export function assertInvocationEnvironment(environment, migrations, git, commit) {
  const e = g5d4EnvironmentInspectionSchema.parse(environment);
  const m = g5d4MigrationInspectionSchema.parse(migrations);
  const g = g5d4GitInspectionSchema.parse(git);
  exactEvidence(e, { ...G5D4_CANONICAL_STAGING, productionGuard: false, destructiveGuard: false }, "Canonical Staging guards");
  exactEvidence(m, { applied: [...G5D4_REQUIRED_MIGRATIONS], pending: [] }, "migration history");
  evidenceAssert(g.trackedClean && (!commit || g.commit === commit), "execution source commit/worktree");
}
const one = (rows, label) => { evidenceAssert(Array.isArray(rows) && rows.length === 1, label); return rows[0]; };
const time = value => typeof value === "string" && Number.isFinite(Date.parse(value));
export function stageTerminal(request, stage) {
  const prefix = stage === "database" ? "db" : stage;
  return ["succeeded", "not_needed"].includes(request[`${prefix}_cleanup_status`]) && time(request[`${prefix}_sub_finalized_at`]);
}
function validateRows(tables, userId, { identityOnly = false } = {}) {
  exactEvidence(Object.keys(tables).sort(), [...TABLES].sort(), "table universe");
  for (const [table, rows] of Object.entries(tables)) {
    evidenceAssert(Array.isArray(rows) && rows.length < 64, "bounded complete table evidence");
    evidenceAssert(new Set(rows.map(r => r.id)).size === rows.length, "duplicate row identity");
    for (const row of rows) {
      uuid.parse(row.id); evidenceAssert(time(row.created_at), "row timestamp");
      evidenceAssert(identityOnly || row.owner_id === userId, "row owner");
      if (identityOnly) continue;
      for (const [field, parent] of Object.entries({ script_id: "scripts", take_id: "takes", voice_id: "voices", source_voice_id: "voices", consent_id: "voice_consents", script_audio_id: "script_audios", operation_id: "voice_deletion_operations", deletion_request_id: "account_deletion_requests" })) {
        if (row[field] != null) evidenceAssert(tables[parent].some(p => p.id === row[field]), `exact ${field} relation`);
      }
      if (["weak_words", "coach_feedback"].includes(table)) evidenceAssert(typeof row.take_id === "string" && tables.takes.some(t => t.id === row.take_id), "exact Take relation");
      if (["takes", "script_audios"].includes(table)) evidenceAssert(typeof row.script_id === "string" && tables.scripts.some(s => s.id === row.script_id), "exact script relation");
    }
  }
  if (!identityOnly) for (const take of tables.takes) evidenceAssert(tables.weak_words.filter(w => w.take_id === take.id).length <= 4, "weak_words maximum per exact Take");
}
function validateProductPresent(t, p) {
  // Per-resource relations, never acceptance by summed row counts.
  for (const table of ["profiles", "scripts", "script_audios", "takes", "coach_feedback", "voices", "voice_consents"]) one(t[table], `${table} current product resource`);
  exactEvidence(t.voice_asset_write_intents.map(x => x.kind).sort(), [...G5D4_WRITER_INTENT_KINDS].sort(), "five writer kinds");
  evidenceAssert(t.voice_asset_write_intents.every(x => x.status === "completed"), "completed writers");
  exactEvidence(t.processing_consents.map(x => x.consent_type).sort(), ["pronunciation_processing", "voice_cloning"], "processing consents");
  for (const c of t.processing_consents) {
    evidenceAssert(c.status === "active" && c.withdrawn_at === null && c.consent_version === "2026-08-22.v1" && time(c.accepted_at), "active consent");
    exactEvidence([c.purpose_id, c.purpose_version], [c.consent_type, "v1"], "consent purpose");
    const pronunciation = c.consent_type === "pronunciation_processing";
    exactEvidence(c.provider_set, pronunciation ? ["openai", "azure"] : ["elevenlabs"], "consent providers");
    exactEvidence(c.data_categories, pronunciation ? ["recorded_audio", "transcript", "pronunciation_result"] : ["voice_sample", "consent_recording", "cloned_voice", "reference_audio"], "consent data categories");
  }
  exactEvidence([t.voices[0].provider, t.voices[0].provider_voice_id], ["elevenlabs", p.providerId], "Provider voice relation");
  const object = bucket => one(p.storage.filter(x => x.bucket === bucket), "Storage class").key;
  exactEvidence(t.takes[0].audio_path, `storage://recordings/${object("recordings")}`, "Take recording relation");
  exactEvidence([t.script_audios[0].stored_asset?.storageBucket, t.script_audios[0].stored_asset?.storageObjectKey], ["script-audios", object("script-audios")], "script audio relation");
  exactEvidence(t.voices[0].sample_audio_path, `storage://voice-samples/${object("voice-samples")}`, "sample relation");
  for (const [kind, bucket] of [["recording_upload", "recordings"], ["voice_sample_upload", "voice-samples"], ["voice_consent_upload", "voice-consents"]]) {
    const writer = one(t.voice_asset_write_intents.filter(x => x.kind === kind), "writer locator");
    exactEvidence([writer.storage_bucket, writer.storage_object_key], [bucket, object(bucket)], "writer Storage relation");
    if (kind === "recording_upload") exactEvidence(writer.script_id, t.scripts[0].id, "recording writer script");
  }
}
function validateParty(state, p, productPresent) {
  requirePresence(state.database, "present");
  validateRows(state.database.evidence, p.userId);
  if (productPresent) validateProductPresent(state.database.evidence, p);
  requirePresence(state.provider); exactEvidence(state.provider.identity, p.providerId, "Provider identity");
  requirePresence(state.auth); exactEvidence(state.auth.identity, p.userId, "Auth identity");
  requirePresence(state.storage);
  const objects = state.storage.evidence;
  evidenceAssert(Array.isArray(objects), "known Storage inventory");
  exactEvidence(state.storage.state, objects.length ? "present" : "absent", "Storage inventory presence");
  evidenceAssert(new Set(objects.map(x => `${x.bucket}/${x.key}`)).size === objects.length, "duplicate Storage object");
  for (const x of objects) evidenceAssert(p.storage.some(y => y.bucket === x.bucket && y.key === x.key) && x.key.startsWith(`${p.userId}/`), "owned Storage universe");
}
export function validateActualState(raw, context, { post = false } = {}) {
  const c = invocationContextSchema.parse(context);
  const r = raw.request;
  evidenceAssert(r && r.id === c.requestId && r.anonymized_user_ref === c.requestRef, "exact request");
  evidenceAssert(r.user_id === c.a.userId || r.user_id === null && (stageTerminal(r, "auth") || r.auth_delete_target_user_id === c.a.userId && [0, 1].includes(r.auth_delete_generation)), "exact request owner");
  evidenceAssert(time(r.confirmed_at) && r.db_inventory_version === INVENTORY_VERSION, "request inventory/confirmation");
  evidenceAssert(["confirmed", "processing", "provider_cleanup_failed", "storage_cleanup_failed", "db_cleanup_failed", "auth_cleanup_failed", "completed"].includes(r.status), "known current request state");
  for (const prefix of ["provider", "storage", "db", "auth"]) evidenceAssert(["pending", "not_needed", "succeeded", "failed"].includes(r[`${prefix}_cleanup_status`]), "known cleanup state; manual STOP");
  validateParty(raw.a, c.a, !stageTerminal(r, "database"));
  validateParty(raw.b, c.b, true);
  evidenceAssert(raw.b.database.evidence.account_deletion_requests.length === 0 && raw.b.database.evidence.account_deletion_provider_targets.length === 0 && raw.b.database.evidence.account_deletion_storage_targets.length === 0, "B has no deletion request or targets");
  requirePresence(raw.b.auth, "present"); requirePresence(raw.b.provider, "present");
  exactEvidence(raw.b.storage.evidence.map(x => `${x.bucket}/${x.key}`).sort(), c.b.storage.map(x => `${x.bucket}/${x.key}`).sort(), "B four actual objects");
  const ownedRequests = raw.a.database.evidence.account_deletion_requests;
  evidenceAssert(ownedRequests.length === (r.user_id === null ? 0 : 1) && ownedRequests.every(x => x.id === r.id), "no conflicting request");
  if (r.user_id !== null) exactEvidence(ownedRequests[0], r, "owned/exact request reads agree");
  for (const stage of ["provider", "storage"]) {
    const targets = raw[`${stage}Targets`];
    if (r.user_id !== null) exactEvidence(raw.a.database.evidence[`account_deletion_${stage}_targets`], targets, "owned/exact target reads agree");
    evidenceAssert(Array.isArray(targets) && targets.length < 64 && new Set(targets.map(x => x.id)).size === targets.length, "exact durable target universe");
    for (const target of targets) {
      uuid.parse(target.id); evidenceAssert(target.deletion_request_id === r.id && target.user_id === r.user_id, "durable target request/owner");
      if (target.status !== "verified_absent") {
        if (stage === "provider") exactEvidence([target.provider_name, target.provider_resource_id], ["elevenlabs", c.a.providerId], "Provider durable locator");
        else evidenceAssert(c.a.storage.some(x => x.bucket === target.storage_bucket && x.key === target.storage_object_key), "Storage durable locator");
      }
    }
    if (r[`${stage}_snapshot_status`] === "sealed") {
      evidenceAssert(targets.length === r[`${stage}_snapshot_target_count`], "persisted target count");
      evidenceAssert(targets.length === (stage === "provider" ? 1 : c.a.storage.length), "exact current resource target universe");
      if (!stageTerminal(r, stage)) {
        const locators = targets.map(t => stage === "provider" ? t.provider_resource_id : `${t.storage_bucket}/${t.storage_object_key}`).sort();
        exactEvidence(locators, stage === "provider" ? [c.a.providerId] : c.a.storage.map(x => `${x.bucket}/${x.key}`).sort(), "exact durable resource relations");
      }
    }
    else evidenceAssert(r[`${stage}_snapshot_status`] === "pending" && targets.length === 0, "known pending snapshot");
    if (stageTerminal(r, stage)) {
      evidenceAssert(targets.every(t => t.status === "verified_absent" && t[stage === "provider" ? "reconciliation_status" : "verification_status"] === "verified_absent"), "terminal targets");
      if (stage === "provider") requirePresence(raw.a.provider, "absent"); else requirePresence(raw.a.storage, "absent");
    }
  }
  if (!stageTerminal(r, "provider")) {
    const t = raw.providerTargets[0];
    if (!t || t.status === "pending") requirePresence(raw.a.provider, "present");
    else if (["deleted", "verified_absent"].includes(t.status)) requirePresence(raw.a.provider, "absent");
  }
  if (!stageTerminal(r, "storage")) {
    for (const object of c.a.storage) {
      const target = raw.storageTargets.find(t => t.storage_bucket === object.bucket && t.storage_object_key === object.key);
      const present = raw.a.storage.evidence.some(x => x.bucket === object.bucket && x.key === object.key);
      if (!target || target.status === "pending") evidenceAssert(present, "pending exact Storage resource present");
      else if (target.status === "verified_absent") evidenceAssert(!present, "verified Storage resource absent");
    }
  }
  if (stageTerminal(r, "auth")) requirePresence(raw.a.auth, "absent");
  else if (!post) requirePresence(raw.a.auth); // Auth response-loss reconciliation may observe absence before finalization.
  if (stageTerminal(r, "database")) {
    for (const table of TABLES.filter(x => !x.startsWith("account_deletion_"))) evidenceAssert(raw.a.database.evidence[table].length === 0, "unexpected residual owned rows");
  }
  return raw;
}
export function plannedInvocation(raw, context, stage) {
  evidenceAssert(STAGES.includes(stage), "stage");
  const r = raw.request;
  for (const prior of STAGES.slice(0, STAGES.indexOf(stage))) evidenceAssert(stageTerminal(r, prior), "prior-stage terminal authority");
  let action; let targetId = context.requestId;
  if (stage === "completion") action = r.status === "completed" && time(r.completed_at) ? "replay" : "complete";
  else if (stageTerminal(r, stage)) action = "replay";
  else if (stage === "database") action = "finalize";
  else if (stage === "auth") action = "auth_step";
  else if (r[`${stage}_snapshot_status`] === "pending") action = "seal";
  else {
    const targets = [...raw[`${stage}Targets`]].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    evidenceAssert(!targets.some(x => x.status === "manual_required"), "manual target STOP");
    const target = targets.find(x => x.status !== "verified_absent");
    if (!target) action = "finalize";
    else {
      evidenceAssert(!target.next_retry_at || Date.parse(target.next_retry_at) <= Date.now(), "target backoff");
      targetId = target.id;
      if (target.status === "pending" && target.delete_attempt_count === 0) {
        action = "delete";
        if (stage === "provider") requirePresence(raw.a.provider, "present");
        else evidenceAssert(raw.a.storage.evidence.some(x => x.bucket === target.storage_bucket && x.key === target.storage_object_key), "approved delete object present");
      } else if (stage === "provider" && ["deleted", "delete_requested"].includes(target.status) || stage === "storage" && target.status === "delete_requested" && target.delete_attempt_count === 1) action = "verify";
      else evidenceAssert(false, "ambiguous target requires read-only reconciliation");
    }
  }
  return invocationSpecSchema.parse({ stage, action, targetId, maxCalls: 1 });
}
export function stableActualState(raw) {
  // read times are not state; arrays from SQL are ordered by identity.
  return JSON.parse(JSON.stringify(raw, (key, value) => ["readAt", "collectedAt", "byIdentity"].includes(key) ? undefined : value));
}
export function invocationSafeSummary(snapshot, key) {
  const alias = (domain, value) => `g5d4_v1${hmacSha256Hex(key, domain, value)}`;
  return { version: INVOCATION_VERSION, purpose: snapshot.context.purpose,
    staging: "canonical_staging", collectedAt: snapshot.collectedAt, commit: snapshot.git.commit,
    fixtureA: alias("invocation-user", snapshot.context.a.userId), fixtureB: alias("invocation-user", snapshot.context.b.userId),
    request: alias("invocation-request", snapshot.context.requestId), target: alias("invocation-target", snapshot.spec.targetId),
    stage: snapshot.spec.stage, action: snapshot.spec.action, maxCalls: snapshot.spec.maxCalls,
    snapshotDigest: snapshot.digest,
    counts: Object.fromEntries(["a", "b"].map(p => [p, Object.fromEntries(TABLES.map(t => [t, snapshot.actual[p].database.evidence[t].length]))])) };
}
export function assertFreshInvocation(snapshot, now = Date.now()) {
  const age = now - Date.parse(snapshot.collectedAt);
  evidenceAssert(Number.isFinite(age) && age >= 0 && age <= 300000, "snapshot freshness");
}
function disposition(table, row, before, at) {
  if (["account_deletion_requests", "account_deletion_provider_targets", "account_deletion_storage_targets"].includes(table)) return "retained";
  if (["quota_events", "voice_deletion_operations"].includes(table)) {
    const expires = table === "quota_events" ? row.retention_expires_at : row.audit_expires_at;
    evidenceAssert(time(expires), "retention timestamp");
    return Date.parse(expires) <= at ? "deleted" : "anonymized";
  }
  if (table === "voice_deletion_targets") {
    const parent = one(before.a.database.evidence.voice_deletion_operations.filter(x => x.id === row.operation_id), "voice audit parent");
    return disposition("voice_deletion_operations", parent, before, at);
  }
  return "deleted";
}
export function verifyDatabasePost(before, after, child) {
  const r = after.request;
  evidenceAssert(stageTerminal(r, "database") && r.db_inventory_version === INVENTORY_VERSION && r.last_attempted_at === r.db_sub_finalized_at, "Database persisted terminal");
  const counts = { deleted: 0, anonymized: 0, retained: 0 };
  const rowsAfter = after.byIdentity;
  validateRows(rowsAfter, null, { identityOnly: true });
  for (const table of TABLES) {
    const preRows = before.a.database.evidence[table];
    evidenceAssert(rowsAfter[table].every(x => preRows.some(y => y.id === x.id)), "post identity substitution");
    for (const row of preRows) {
      const action = disposition(table, row, before, Date.parse(r.db_sub_finalized_at)); counts[action]++;
      const post = rowsAfter[table].find(x => x.id === row.id);
      if (action === "deleted") evidenceAssert(!post, "pre row DELETE");
      else {
        evidenceAssert(post && post.created_at === row.created_at, "retained/anonymized row identity");
        evidenceAssert(post.owner_id === (action === "retained" ? row.owner_id : null), "row disposition owner");
        for (const relation of ["deletion_request_id", "operation_id"]) if (relation in row) exactEvidence(post[relation], row[relation], "retained row relation");
        if (action === "retained") exactEvidence(post, after.a.database.evidence[table].find(x => x.id === row.id), "identity read/owned read agreement");
        if (table === "voice_deletion_operations") {
          evidenceAssert(post.status === "completed", "retained voice audit terminal");
          exactEvidence([post.completed_at, post.audit_expires_at], [row.completed_at, row.audit_expires_at], "voice audit retention");
        }
        if (table === "quota_events") {
          evidenceAssert(post.identifier_scrubbed_at === r.db_sub_finalized_at, "quota scrub timestamp");
          for (const f of ["subject_id", "target_resource_id", "idempotency_key", "dedupe_key", "request_fingerprint", "provider_request_id"]) evidenceAssert(post[f] === null, "quota identifiers scrubbed");
          exactEvidence(post.metadata, {}, "quota metadata scrubbed");
          for (const f of ["event_type", "category", "billing_status", "retention_expires_at"]) exactEvidence(post[f], row[f], "quota retained classification");
        }
        if (table.endsWith("_targets")) {
          evidenceAssert(post.status === "verified_absent" && time(post.locator_scrubbed_at), "retained target scrubbed");
          for (const f of table === "account_deletion_provider_targets" ? ["provider_name", "provider_resource_id", "source_voice_id", "target_fingerprint"] : table === "account_deletion_storage_targets" ? ["storage_bucket", "storage_object_key", "target_fingerprint", "source_refs"] : ["provider_name", "provider_resource_id", "storage_bucket", "storage_object_key", "source_row_id", "target_fingerprint"]) evidenceAssert(post[f] === null, "retained target locators");
        }
      }
    }
  }
  const expected = [counts.deleted + counts.anonymized + counts.retained, counts.deleted, counts.anonymized, counts.retained];
  exactEvidence([r.db_observed_row_count, r.db_deleted_row_count, r.db_anonymized_row_count, r.db_retained_row_count], expected, "persisted variable D/A/R");
  exactEvidence([child.safeCounts?.dbObservedRowCount, child.safeCounts?.dbDeletedRowCount, child.safeCounts?.dbAnonymizedRowCount, child.safeCounts?.dbRetainedRowCount], expected, "RPC returned D/A/R via canonical operator");
  for (const table of TABLES) {
    const retained = before.a.database.evidence[table].filter(x => disposition(table, x, before, Date.parse(r.db_sub_finalized_at)) === "retained").map(x => x.id).sort();
    exactEvidence(after.a.database.evidence[table].map(x => x.id).sort(), retained, "current owner search and residual check");
  }
  return counts;
}
export function verifyInvocationPost(snapshot, after, child) {
  validateActualState(after, snapshot.context, { post: true });
  exactEvidence(stableActualState(after.b), stableActualState(snapshot.actual.b), "B pre/post unchanged");
  evidenceAssert(child && ["succeeded", "already_satisfied", "blocked"].includes(child.status) && child.progress && child.progress.manualReviewRequired === false, "canonical response known");
  const { stage, action, targetId } = snapshot.spec;
  const r = after.request;
  const marker = action === "seal" ? "seal_only" : action === "delete" ? "progressed" : action === "verify" ? "target_verified" : "terminal";
  evidenceAssert(child.progress.marker === marker && child.progress.terminal === (marker === "terminal"), "returned action/persisted state agreement");
  if (["provider", "storage"].includes(stage)) {
    for (const table of TABLES.filter(t => !["account_deletion_requests", `account_deletion_${stage}_targets`].includes(t))) {
      exactEvidence(after.a.database.evidence[table], snapshot.actual.a.database.evidence[table], "unaffected A DB resource");
    }
    exactEvidence(after.a.auth, snapshot.actual.a.auth, "unaffected A Auth");
    exactEvidence(after.a[stage === "provider" ? "storage" : "provider"], snapshot.actual.a[stage === "provider" ? "storage" : "provider"], "unaffected A external resource");
    if (["delete", "verify"].includes(action)) {
      exactEvidence(after[`${stage}Targets`].filter(x => x.id !== targetId), snapshot.actual[`${stage}Targets`].filter(x => x.id !== targetId), "nonapproved A targets unchanged");
      const target = one(after[`${stage}Targets`].filter(x => x.id === targetId), "approved post target");
      const pre = one(snapshot.actual[`${stage}Targets`].filter(x => x.id === targetId), "approved pre target");
      if (stage === "provider") requirePresence(after.a.provider, "absent");
      else {
        evidenceAssert(!after.a.storage.evidence.some(x => x.bucket === pre.storage_bucket && x.key === pre.storage_object_key), "approved object absent");
        exactEvidence(after.a.storage.evidence, snapshot.actual.a.storage.evidence.filter(x => x.bucket !== pre.storage_bucket || x.key !== pre.storage_object_key), "nonapproved Storage objects unchanged");
      }
      if (action === "verify") evidenceAssert(target.status === "verified_absent" && target[stage === "provider" ? "reconciliation_status" : "verification_status"] === "verified_absent", "persisted target absence");
      else evidenceAssert(["deleted", "delete_requested"].includes(target.status) && target.delete_outcome === "succeeded", "persisted successful dispatch");
    } else if (action === "seal") evidenceAssert(r[`${stage}_snapshot_status`] === "sealed" && time(r[`${stage}_snapshot_sealed_at`]) && child.progress.marker === "seal_only", "seal-only persisted state");
    else evidenceAssert(stageTerminal(r, stage), "persisted stage terminal");
  } else if (stage === "database") {
    if (action === "finalize") verifyDatabasePost(snapshot.actual, after, child);
    else {
      evidenceAssert(stageTerminal(r, stage), "Database replay terminal");
      for (const f of ["db_sub_finalized_at", "db_observed_row_count", "db_deleted_row_count", "db_anonymized_row_count", "db_retained_row_count"]) exactEvidence(r[f], snapshot.actual.request[f], "Database replay evidence");
    }
  } else if (stage === "auth") {
    requirePresence(after.a.auth, "absent"); evidenceAssert(stageTerminal(r, "auth") && r.user_id === null && r.auth_delete_target_user_id === null && r.auth_verification_result === null && time(r.auth_verified_absent_at), "Auth exact-user terminal");
  } else {
    evidenceAssert(r.status === "completed" && time(r.completed_at) && STAGES.slice(0, 4).every(s => stageTerminal(r, s)), "Completion prior stages terminal");
    if (action === "replay") exactEvidence(r.completed_at, snapshot.actual.request.completed_at, "Completion replay timestamp");
  }
  return { verdict: "PASS", mandatoryStop: true, bUnchanged: true };
}
