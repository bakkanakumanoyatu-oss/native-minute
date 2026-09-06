// Module-owned live transport. Only the Supabase read-only SQL endpoint and
// exact GET endpoints are reachable; no SDK/admin/mutation client escapes.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import {
  G5D4_A_PREP_TABLE_CONTRACT, G5D4_CANONICAL_STAGING,
  G5D4_REQUIRED_MIGRATIONS, G5D4_STORAGE_BUCKETS, canonicalJson
} from "./g5d4-proof-contract.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const UUID = z.string().uuid();
const REF = G5D4_CANONICAL_STAGING.projectRef;
const STAGING_URL = `https://${REF}.supabase.co`;
const MANAGEMENT = "https://api.supabase.com";
const READ_SQL_PATH = `/v1/projects/${REF}/database/query/read-only`;
const fail = (message) => { throw new Error(message); };
const exact = (actual, expected, label) => {
  if (canonicalJson(actual) !== canonicalJson(expected)) fail(`${label} mismatch`);
};
const one = (rows, label) => rows.length === 1 ? rows[0] : fail(`${label} exact count mismatch`);
const instant = (value) => {
  if (value === null || value === undefined || value === "") fail("required timestamp missing");
  return z.string().datetime().parse(new Date(value).toISOString());
};
const sqlId = (value) => `'${UUID.parse(value)}'::uuid`;
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;

function credentials() {
  const file = join(ROOT, ".env.local");
  const env = { ...(existsSync(file) ? dotenv.parse(readFileSync(file)) : {}), ...process.env };
  if (env.NEXT_PUBLIC_SUPABASE_URL !== STAGING_URL || env.NODE_ENV === "production" ||
      env.VERCEL_ENV === "production" || env.NATIVE_MINUTE_PRODUCTION_GUARD &&
      !["0", "false"].includes(env.NATIVE_MINUTE_PRODUCTION_GUARD) ||
      env.NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE &&
      !["0", "false"].includes(env.NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE)) {
    fail("live read-only environment/guard mismatch");
  }
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "ELEVENLABS_API_KEY"]) {
    if (!env[name]?.trim()) fail(`HUMAN_ACTION_REQUIRED: ${name}`);
  }
  let token = env.SUPABASE_ACCESS_TOKEN;
  if (!token && process.platform === "darwin") {
    // Same service/default profile as the installed Supabase CLI. Capture only;
    // no credential value enters argv, output, documents or private manifests.
    for (const account of ["supabase", "access-token"]) {
      try {
        token = execFileSync("/usr/bin/security", ["find-generic-password", "-s", "Supabase CLI", "-a", account, "-w"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 }).trim();
      } catch { /* Try the CLI's documented fallback. */ }
      if (token) break;
    }
  }
  const fallback = join(homedir(), ".supabase", "access-token");
  if (!token && existsSync(fallback)) token = readFileSync(fallback, "utf8").trim();
  if (!/^sbp_[a-f0-9]+$/i.test(token ?? "")) fail("HUMAN_ACTION_REQUIRED: SUPABASE_ACCESS_TOKEN / Supabase CLI default profile");
  return Object.freeze({ service: env.SUPABASE_SERVICE_ROLE_KEY, provider: env.ELEVENLABS_API_KEY, management: token });
}

async function request(url, headers, body) {
  let response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST", headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error", signal: AbortSignal.timeout(20000)
    });
  } catch { fail("live read-only transport failed"); }
  if (!response.ok) fail(`live read-only transport HTTP ${response.status}`);
  return response;
}

function json(response) {
  return response.json().catch(() => fail("live read-only response shape invalid"));
}

function inspectGit() {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  return { commit: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"),
    trackedClean: git("status", "--porcelain", "--untracked-files=no") === "" };
}

// Static projections exclude script/transcript/audio bodies, provider payloads,
// consent text, lease tokens, credentials and arbitrary metadata.
const FIELDS = Object.freeze({
  profiles: [], scripts: [],
  script_audios: ["script_id", "voice_id", "storage_path", "stored_asset", "cache_key", "provider"],
  takes: ["script_id", "audio_path"], weak_words: ["take_id"], coach_feedback: ["take_id"],
  script_saved_model_audios: ["script_id", "script_audio_id"], script_saved_best_takes: ["script_id", "take_id"],
  voices: ["provider", "provider_voice_id", "consent_id", "sample_audio_path"],
  voice_consents: ["provider", "consented_at"],
  processing_consents: ["consent_type", "consent_version", "purpose_id", "purpose_version", "provider_set", "data_categories", "accepted_at", "withdrawn_at"],
  voice_deletion_operations: [], voice_deletion_targets: ["operation_id"],
  voice_asset_write_intents: ["kind", "script_id", "voice_id", "storage_bucket", "storage_object_key"],
  account_deletion_requests: ["anonymized_user_ref", "confirmed_at", "provider_snapshot_status", "storage_snapshot_status", "provider_snapshot_target_count", "storage_snapshot_target_count"],
  account_deletion_provider_targets: ["deletion_request_id", "provider_name", "provider_resource_id", "source_voice_id", "target_fingerprint", "delete_outcome", "reconciliation_status"],
  quota_events: ["event_type", "category", "billing_status", "subject_id", "target_resource_id", "completed_at", "identifier_scrubbed_at", "retention_expires_at"],
  account_deletion_storage_targets: ["deletion_request_id", "target_kind", "storage_bucket", "storage_object_key", "target_fingerprint", "delete_outcome", "verification_status"]
});

function ownerScope(table, userId) {
  const id = sqlId(userId);
  if (table === "profiles") return { owner: "t.id", where: `t.id=${id}` };
  if (table === "script_audios") return { owner: "s.user_id", join: " join public.scripts s on s.id=t.script_id", where: `s.user_id=${id}` };
  if (["weak_words", "coach_feedback"].includes(table)) return { owner: "s.user_id", join: " join public.takes s on s.id=t.take_id", where: `s.user_id=${id}` };
  return { owner: "t.user_id", where: `t.user_id=${id}` };
}

function ownedRowsQuery(userId) {
  return "select jsonb_build_object(" + G5D4_A_PREP_TABLE_CONTRACT.map(({ table }) => {
    const scope = ownerScope(table, userId);
    const fields = ["id", "created_at", "updated_at", "status", ...FIELDS[table]];
    const noUpdatedAt = ["script_audios", "takes", "weak_words", "coach_feedback", "voices", "voice_consents"].includes(table);
    const noStatus = ["profiles", "scripts", "script_audios", "weak_words", "coach_feedback", "script_saved_model_audios", "script_saved_best_takes", "voices", "voice_consents"].includes(table);
    const projection = fields.map((field) => `${sqlText(field)},${field === "updated_at" && noUpdatedAt || field === "status" && noStatus ? "null" : `t.${field}`}`).join(",");
    return `${sqlText(table)},(select coalesce(jsonb_agg(v), '[]'::jsonb) from (select jsonb_build_object(${projection},'owner_id',${scope.owner}) v from public.${table} t${scope.join ?? ""} where ${scope.where} order by t.id limit 64) bounded)`;
  }).join(",") + ") as owned";
}

function storageQuery(userId) {
  sqlId(userId);
  return `select id,bucket_id,name,owner_id,created_at,updated_at,version,metadata->>'size' as size,metadata->>'mimetype' as content_type,metadata->>'eTag' as etag from storage.objects where bucket_id in (${G5D4_STORAGE_BUCKETS.map(sqlText).join(",")}) and (split_part(name,'/',1)=${sqlText(userId)} or owner_id=${sqlText(userId)}) order by bucket_id,name limit 64`;
}

function validateOwnedRows(raw, userId) {
  exact(Object.keys(raw).sort(), Object.keys(FIELDS).sort(), "DB exact table universe");
  for (const [table, rows] of Object.entries(raw)) {
    if (!Array.isArray(rows) || rows.length >= 64) fail("DB owned row bound exceeded");
    const ids = new Set();
    for (const row of rows) {
      UUID.parse(row.id); exact(row.owner_id, userId, "DB owner");
      if (ids.has(row.id)) fail("DB duplicate identity");
      ids.add(row.id);
      instant(row.created_at);
      if (row.script_id && !raw.scripts.some((script) => script.id === row.script_id)) fail("DB script relation mismatch");
      if (row.take_id && !raw.takes.some((take) => take.id === row.take_id)) fail("DB take relation mismatch");
      if (row.voice_id && !raw.voices.some((voice) => voice.id === row.voice_id)) fail("DB voice relation mismatch");
      if (row.consent_id && !raw.voice_consents.some((consent) => consent.id === row.consent_id)) fail("DB voice consent relation mismatch");
      if (row.deletion_request_id && !raw.account_deletion_requests.some((request) => request.id === row.deletion_request_id)) fail("DB request relation mismatch");
      if (table === "quota_events" && row.identifier_scrubbed_at !== null) fail("DB quota owner state mismatch");
    }
  }
  return raw;
}

function consent(raw, userId, type) {
  const row = one(raw.processing_consents.filter((item) => item.consent_type === type), "current processing consent");
  const pronunciation = type === "pronunciation_processing";
  exact([row.owner_id, row.status, row.consent_version, row.purpose_id, row.purpose_version, row.withdrawn_at],
    [userId, "active", "2026-08-22.v1", type, "v1", null], "current processing consent");
  exact(row.provider_set, pronunciation ? ["openai", "azure"] : ["elevenlabs"], "consent providers");
  exact(row.data_categories, pronunciation ? ["recorded_audio", "transcript", "pronunciation_result"] :
    ["voice_sample", "consent_recording", "cloned_voice", "reference_audio"], "consent data categories");
  instant(row.accepted_at);
  return row;
}

function storageRows(raw, userId) {
  if (!Array.isArray(raw) || raw.length >= 64) fail("Storage owned universe bound exceeded");
  const seen = new Set();
  for (const row of raw) {
    if (!G5D4_STORAGE_BUCKETS.includes(row.bucket_id) || !row.name.startsWith(`${userId}/`) ||
        row.owner_id && row.owner_id !== userId || seen.has(`${row.bucket_id}/${row.name}`)) fail("Storage owner/duplicate mismatch");
    seen.add(`${row.bucket_id}/${row.name}`);
  }
  return raw;
}

function recordingState(raw, objects, userId, key) {
  const parts = key.split("/");
  if (parts.length !== 3 || parts[0] !== userId || !/^[0-9a-f-]{36}\.(wav|webm|m4a|mp3|ogg)$/.test(parts[2])) fail("recording locator malformed");
  const scriptId = UUID.parse(parts[1]);
  UUID.parse(parts[2].split(".")[0]);
  const script = one(raw.scripts, "recording script");
  exact([script.id, script.owner_id], [scriptId, userId], "recording script owner");
  const required = consent(raw, userId, "pronunciation_processing");
  const writer = one(raw.voice_asset_write_intents.filter((row) => row.kind === "recording_upload"), "recording writer intent");
  exact([writer.owner_id, writer.script_id, writer.status, writer.storage_bucket, writer.storage_object_key],
    [userId, scriptId, "completed", "recordings", key], "recording writer intent");
  const object = one(objects.filter((row) => row.bucket_id === "recordings"), "recording Storage object");
  exact(object.name, key, "recording Storage locator");
  if (raw.takes.length > 1 || raw.takes.some((row) => row.owner_id !== userId || row.script_id !== scriptId || row.audio_path !== `storage://recordings/${key}`)) fail("recording take relation mismatch");
  return { scriptId, consentId: required.id, consentType: required.consent_type, consentStatus: required.status,
    consentVersion: required.consent_version, writerIntentId: writer.id, writerKind: writer.kind,
    writerStatus: writer.status, writerOwnerId: userId, writerScriptId: scriptId,
    writerBucket: "recordings", writerKey: key, storageObjectId: UUID.parse(object.id) };
}

function bindingStorage(raw, objects, input) {
  const { userId, bucket, key, fixtureRole } = input;
  const target = one(objects.filter((row) => row.bucket_id === bucket && row.name === key), "Storage target");
  let recording = null;
  if (bucket === "recordings") recording = recordingState(raw, objects, userId, key);
  else if (bucket === "script-audios") {
    const audio = one(raw.script_audios, "script audio");
    exact([audio.stored_asset?.storageBucket, audio.stored_asset?.storageObjectKey], [bucket, key], "script audio locator");
    if (!raw.scripts.some((row) => row.id === audio.script_id)) fail("script audio owner relation mismatch");
  } else {
    const kind = bucket === "voice-samples" ? "voice_sample_upload" : "voice_consent_upload";
    const writer = one(raw.voice_asset_write_intents.filter((row) => row.kind === kind), "voice material writer");
    exact([writer.status, writer.storage_bucket, writer.storage_object_key], ["completed", bucket, key], "voice material locator");
    consent(raw, userId, "voice_cloning");
    if (bucket === "voice-samples" && raw.voices.length) {
      exact(one(raw.voices, "sample voice").sample_audio_path, `storage://voice-samples/${key}`, "voice sample relation");
    }
  }
  if (!target) fail("Storage target missing");
  return { fixtureRole, userId, bucket, key, present: true, count: 1,
    dbLocator: { userId, bucket, key, count: 1 }, recordingState: recording };
}

function databaseSnapshot(raw, objects, userId, rawRequestId) {
  const requests = raw.account_deletion_requests;
  if (requests.length > 1 || requests.length === 1 && requests[0].id !== rawRequestId) fail("request identity/conflict mismatch");
  const request = requests[0];
  const providers = raw.account_deletion_provider_targets.length;
  const storage = raw.account_deletion_storage_targets.length;
  let sealed = false;
  if (request) {
    exact(request.status, "confirmed", "request state"); instant(request.confirmed_at);
    sealed = request.provider_snapshot_status === "sealed" && request.storage_snapshot_status === "sealed";
    exact([request.provider_snapshot_target_count, request.storage_snapshot_target_count], [providers, storage], "durable target counts");
    if (!sealed && (providers || storage || request.provider_snapshot_status !== "pending" || request.storage_snapshot_status !== "pending")) fail("durable target state mismatch");
    if (sealed) {
      const voice = one(raw.voices, "sealed voice");
      const target = one(raw.account_deletion_provider_targets, "sealed Provider target");
      exact([target.deletion_request_id, target.source_voice_id, target.provider_name, target.provider_resource_id, target.status, target.delete_outcome],
        [request.id, voice.id, voice.provider, voice.provider_voice_id, "pending", "not_attempted"], "sealed Provider relation");
      exact(raw.account_deletion_storage_targets.map((row) => `${row.storage_bucket}/${row.storage_object_key}`).sort(),
        objects.map((row) => `${row.bucket_id}/${row.name}`).sort(), "sealed Storage universe");
      for (const row of raw.account_deletion_storage_targets) {
        exact([row.deletion_request_id, row.status, row.delete_outcome], [request.id, "pending", "not_attempted"], "sealed Storage state");
      }
    }
  } else if (providers || storage) fail("orphan durable targets");
  return {
    userId,
    tables: G5D4_A_PREP_TABLE_CONTRACT.map(({ table, category }) => ({ table, category,
      rows: raw[table].map((row) => ({ id: row.id, ownerId: row.owner_id, createdAt: instant(row.created_at),
        updatedAt: row.updated_at === null ? null : instant(row.updated_at), status: row.status,
        relations: Object.entries(row).filter(([name, value]) => value !== null && name !== "id" && name !== "owner_id" &&
          (name.endsWith("_id") || ["storage_bucket", "storage_object_key", "audio_path", "storage_path", "kind", "consent_version", "category", "billing_status"].includes(name)))
          .map(([kind, value]) => ({ kind, targetId: String(value) })) })) })),
    processingConsents: ["voice_cloning", "pronunciation_processing"].map((type) => {
      const row = consent(raw, userId, type);
      return { consentType: type, status: row.status, consentVersion: row.consent_version };
    }),
    writerIntents: raw.voice_asset_write_intents.map((row) => ({ kind: row.kind, status: row.status })),
    request: { count: requests.length, id: request?.id ?? null, state: request?.status ?? "absent", conflictCount: 0,
      durableTargetState: sealed ? "sealed" : "absent", providerTargetCount: providers, storageTargetCount: storage }
  };
}

export function createLiveReadOnlyAdapters() {
  if (arguments.length !== 0) fail("live adapters accept no caller injection");
  let secrets;
  let serviceHeaders;
  let managementHeaders;
  // Private, never exported or accepted as an argument. Its callers supply
  // only static SELECTs built below. Server executes as supabase_read_only_user.
  const select = async (query) => json(await request(`${MANAGEMENT}${READ_SQL_PATH}`, managementHeaders, { query }));
  let environment;
  let migrations;
  const gate = async () => {
    // Recheck mutable process/config guards on every target-read entry.
    secrets = credentials();
    serviceHeaders = { apikey: secrets.service, Authorization: `Bearer ${secrets.service}` };
    managementHeaders = { Authorization: `Bearer ${secrets.management}`, "Content-Type": "application/json" };
    const project = await json(await request(`${MANAGEMENT}/v1/projects/${REF}`, managementHeaders));
    exact([project.id, project.name, project.region, project.status],
      [REF, "native-minute-staging", "ap-northeast-1", "ACTIVE_HEALTHY"], "Canonical Staging project");
    const history = await select("select version from supabase_migrations.schema_migrations order by version");
    exact(history.map((row) => row.version), [...G5D4_REQUIRED_MIGRATIONS], "remote migration history");
    const local = readdirSync(join(ROOT, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort().map((name) => name.slice(0, 4));
    exact(local, [...G5D4_REQUIRED_MIGRATIONS], "local migration history");
    environment = { environment: "canonical_staging", projectLabel: project.name, projectRef: REF, productionGuard: false, destructiveGuard: false };
    migrations = { applied: history.map((row) => row.version), pending: [] };
  };
  const owned = async (userId) => validateOwnedRows(one(await select(ownedRowsQuery(userId)), "DB snapshot").owned, userId);
  const objects = async (userId) => storageRows(await select(storageQuery(userId)), userId);
  const storageTarget = (input) => {
    if (!G5D4_STORAGE_BUCKETS.includes(input.bucket)) fail("Storage bucket mismatch");
    const parts = input.key.split("/");
    UUID.parse(parts[0]);
    if (parts.some((part) => !part || part === "." || part === ".." || !/^[a-zA-Z0-9_.-]+$/.test(part))) fail("Storage locator malformed");
    return parts[0];
  };
  const info = async (input) => {
    await gate();
    const userId = storageTarget(input);
    const row = one((await objects(userId)).filter((item) => item.bucket_id === input.bucket && item.name === input.key), "Storage info");
    return { bucket: input.bucket, key: input.key, present: true, size: z.coerce.number().int().nonnegative().parse(row.size),
      contentType: row.content_type, version: row.version, stableMetadata: { createdAt: instant(row.created_at),
        updatedAt: row.updated_at === null ? null : instant(row.updated_at), etag: row.etag },
      transport: { signedUrl: null, headers: {}, readAt: new Date().toISOString() } };
  };
  const provider = async ({ resourceId }) => {
    await gate();
    if (!/^[A-Za-z0-9]{20}$/.test(resourceId)) fail("Provider resource shape invalid");
    const row = await json(await request(`https://api.elevenlabs.io/v1/voices/${resourceId}`, { "xi-api-key": secrets.provider }));
    exact(row.voice_id, resourceId, "Provider identity");
    exact(row.category, "cloned", "dedicated cloned Provider voice");
    if (!Number.isSafeInteger(row.created_at_unix) || row.created_at_unix <= 0) fail("Provider creation metadata missing");
    if (row.voice_verification?.requires_verification === true) fail("Provider resource unavailable");
    return { resourceId, present: true, state: "ready", createdAt: instant(row.created_at_unix * 1000), updatedAt: null,
      deletionRelevantStatus: "eligible", telemetry: { requestId: null, rateLimitRemaining: null, readAt: new Date().toISOString() } };
  };
  const auth = async ({ userId }) => {
    await gate(); UUID.parse(userId);
    const row = await json(await request(`${STAGING_URL}/auth/v1/admin/users/${userId}`, serviceHeaders));
    exact(row.id, userId, "Auth identity");
    const identity = one(row.identities ?? [], "Auth identity binding");
    exact([identity.user_id, identity.provider, row.app_metadata?.provider], [userId, "email", "email"], "Auth email identity");
    if (row.deleted_at || row.banned_until && Date.parse(row.banned_until) > Date.now()) fail("Auth unavailable");
    return { present: true, userId, identityBinding: UUID.parse(identity.identity_id ?? identity.id),
      contact: z.string().email().parse(row.email), provider: "email", confirmedAt: row.email_confirmed_at ? instant(row.email_confirmed_at) : null,
      deletionStatus: "eligible", transport: { requestId: null, readAt: new Date().toISOString() } };
  };
  const reader = Object.freeze({
    readIdentityBaseline: async ({ fixtureRole, userId }) => {
      UUID.parse(userId); await gate();
      const identity = await auth({ userId }); const raw = await owned(userId);
      if ((await objects(userId)).length !== 0) fail("fresh identity has orphan Storage objects");
      return { fixtureRole, userId, auth: { userId, present: identity.present, confirmed: identity.confirmedAt !== null },
        profile: { userId, count: raw.profiles.length }, baseline: G5D4_A_PREP_TABLE_CONTRACT.filter(({ table }) => table !== "profiles").map(({ table }) => ({ table, count: raw[table].length })) };
    },
    readProviderBinding: async ({ fixtureRole, userId, resourceId }) => {
      UUID.parse(userId); await gate(); const raw = await owned(userId); const voice = one(raw.voices, "Provider DB voice");
      exact([voice.provider, voice.provider_voice_id], ["elevenlabs", resourceId], "Provider DB relation");
      consent(raw, userId, "voice_cloning");
      const state = await provider({ resourceId });
      return { fixtureRole, userId, resourceId, present: state.present, count: 1, dbBinding: { userId, resourceId, count: 1 } };
    },
    readStorageBinding: async (input) => {
      exact(storageTarget(input), input.userId, "Storage binding owner"); await gate();
      return bindingStorage(await owned(input.userId), await objects(input.userId), input);
    },
    readDeletionRequest: async (input) => {
      UUID.parse(input.userId); UUID.parse(input.fixtureBUserId); await gate();
      const a = await owned(input.userId); const b = await owned(input.fixtureBUserId);
      const request = one(a.account_deletion_requests, "deletion request");
      exact([request.id, request.anonymized_user_ref, request.status], [input.deletionRequestId, input.deletionRequestRef, "confirmed"], "deletion request authority");
      instant(request.confirmed_at);
      return { ...input, count: 1, state: request.status, conflictCount: 0, fixtureBRequestCount: b.account_deletion_requests.length };
    }
  });
  const adapters = Object.freeze({
    db: Object.freeze({ select: async ({ rawUserId, rawRequestId }) => {
      await gate(); const raw = await owned(rawUserId); const stored = await objects(rawUserId);
      for (const object of stored) bindingStorage(raw, stored, { userId: rawUserId, bucket: object.bucket_id, key: object.name });
      return databaseSnapshot(raw, stored, rawUserId, rawRequestId);
    } }),
    storage: Object.freeze({ read: info, info,
      list: async ({ rawUserId }) => { await gate(); return (await objects(rawUserId)).map((row) => ({ bucket: row.bucket_id, key: row.name })); },
      download: async (input) => {
        await info(input);
        const response = await request(`${STAGING_URL}/storage/v1/object/authenticated/${input.bucket}/${input.key.split("/").map(encodeURIComponent).join("/")}`, serviceHeaders);
        return Buffer.from(await response.arrayBuffer());
      } }),
    auth: Object.freeze({ get: auth }), provider: Object.freeze({ get: provider }),
    environment: Object.freeze({ inspectProject: async () => { await gate(); return environment; }, inspectMigrations: async () => { await gate(); return migrations; } }),
    git: Object.freeze({ inspect: async () => inspectGit() })
  });
  return Object.freeze({ adapters, reader, smoke: async () => {
    await gate();
    const permission = one(await select("select has_table_privilege(current_user,'public.voice_asset_write_intents','SELECT') as writer_select, current_user as reader_role"), "DB reader permission");
    if (permission.writer_select !== true || permission.reader_role !== "supabase_read_only_user") fail("HUMAN_ACTION_REQUIRED: read-only DB SELECT public.voice_asset_write_intents");
    // Compile the exact projections and exercise SELECT permission with no
    // target row access. This neither assumes nor creates a fixture identity.
    const emptyId = "00000000-0000-4000-8000-000000000000";
    const projection = ownedRowsQuery(emptyId).replaceAll(/where [^)]*? order by t.id/g, "where false order by t.id");
    const empty = one(await select(projection), "empty DB projection").owned;
    exact(Object.keys(empty).sort(), Object.keys(FIELDS).sort(), "empty DB table universe");
    if (!Object.values(empty).every((rows) => Array.isArray(rows) && rows.length === 0)) fail("empty DB projection mismatch");
    const storageProjection = storageQuery(emptyId).replace(/ where .* order by /, " where false order by ");
    exact(await select(storageProjection), [], "empty Storage projection");
    await json(await request(`${STAGING_URL}/auth/v1/settings`, serviceHeaders));
    const buckets = await json(await request(`${STAGING_URL}/storage/v1/bucket`, serviceHeaders));
    for (const bucket of G5D4_STORAGE_BUCKETS) if (!buckets.some((row) => row.id === bucket && row.public === false)) fail("Storage private bucket mismatch");
    return { environment, migrations, database: "PASS", auth: "PASS", storage: "PASS",
      provider: "PROVIDER_LIVE_READINESS_DEFERRED_UNTIL_FIXTURE_EXISTS", fixturePass: false, mutations: 0 };
  } });
}
