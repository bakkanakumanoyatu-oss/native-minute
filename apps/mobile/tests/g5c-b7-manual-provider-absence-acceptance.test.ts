import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { AppError } from "@/lib/errors";
import {
  handleG5cB7ManualProviderAbsenceAcceptancePost,
  type G5cB7ManualProviderRecoveryRouteDependencies
} from "@/lib/internal/g5c-b7-manual-provider-recovery-route";
import {
  acceptStagingManualProviderAbsence,
  G5C_B7_MANUAL_PROVIDER_ABSENCE_CONFIRMATION,
  type StagingManualProviderAbsenceAcceptanceDependencies
} from "@/services/voice-deletion/staging-manual-provider-absence-acceptance";
import { createVoiceDeletionRepository } from "@/services/voice-deletion/voice-deletion.repository";
import type { Database } from "@/types/database";

type Operation = Database["public"]["Tables"]["voice_deletion_operations"]["Row"];
type Target = Database["public"]["Tables"]["voice_deletion_targets"]["Row"];

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const OPERATION_ID = "33333333-3333-4333-8333-333333333333";
const TARGET_ID = "44444444-4444-4444-8444-444444444444";
const LEASE_TOKEN = "55555555-5555-4555-8555-555555555555";
const PRIVATE_VOICE_ID = "provider-voice-private";
const PRIVATE_PATH = "voice-samples/private.wav";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0021_g5c_b7_manual_provider_absence_acceptance.sql", import.meta.url)
);
const providerMigrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0016_g5c_b2b_provider_voice_transitions.sql", import.meta.url)
);
const acceptanceServicePath = fileURLToPath(
  new URL("../../../services/voice-deletion/staging-manual-provider-absence-acceptance.ts", import.meta.url)
);
const acceptanceRoutePath = fileURLToPath(
  new URL("../../../lib/internal/g5c-b7-manual-provider-recovery-route.ts", import.meta.url)
);
const operationServicePath = fileURLToPath(
  new URL("../../../services/voice-deletion/voice-deletion-operation.service.ts", import.meta.url)
);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function request(path = "/api/internal/g5c-b7/manual-provider-recovery", body: unknown = { confirmation: G5C_B7_MANUAL_PROVIDER_ABSENCE_CONFIRMATION }) {
  return new NextRequest(`https://native-minute-staging.vercel.app${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" }
  });
}

function operation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: OPERATION_ID,
    user_id: USER_A,
    status: "manual_required",
    current_stage: "provider_cleanup",
    snapshot_status: "succeeded",
    consent_withdrawal_status: "succeeded",
    destructive_started_at: "2026-08-29T00:00:00.000Z",
    last_failure_stage: "provider_cleanup",
    last_failure_category: "provider_rejected",
    manual_reason_category: "provider_rejected",
    manual_required_at: "2026-08-29T00:01:00.000Z",
    next_retry_at: null,
    runner_attempt_count: 7,
    ...overrides
  } as Operation;
}

function target(kind: Target["target_kind"], overrides: Partial<Target> = {}): Target {
  const isProvider = kind === "provider_voice";
  return {
    id: isProvider ? TARGET_ID : `target-${kind}`,
    operation_id: OPERATION_ID,
    user_id: USER_A,
    target_kind: kind,
    target_fingerprint: `sealed-${kind}`,
    source_row_id: isProvider || kind === "voice_binding" || kind === "script_audio" ? `source-${kind}` : null,
    provider_name: isProvider ? "elevenlabs" : null,
    provider_resource_id: isProvider ? PRIVATE_VOICE_ID : null,
    storage_bucket: ["voice_sample", "voice_consent_recording", "script_audio_storage"].includes(kind) ? "voice-samples" : null,
    storage_object_key: ["voice_sample", "voice_consent_recording", "script_audio_storage"].includes(kind)
      ? PRIVATE_PATH
      : null,
    status: isProvider ? "manual_required" : "pending",
    delete_outcome: isProvider ? "succeeded" : "not_attempted",
    reconciliation_status: isProvider ? "manual_required" : "not_applicable",
    verification_status: isProvider ? "manual_required" : "pending",
    delete_attempt_count: isProvider ? 1 : 0,
    verification_attempt_count: isProvider ? 2 : 0,
    last_failure_category: isProvider ? "provider_rejected" : null,
    manual_required_at: isProvider ? "2026-08-29T00:01:00.000Z" : null,
    last_attempted_at: null,
    delete_succeeded_at: isProvider ? "2026-08-29T00:00:30.000Z" : null,
    verified_absent_at: null,
    ...overrides
  } as Target;
}

function exactIncidentTargets() {
  return [
    target("provider_voice"),
    target("voice_sample"),
    target("voice_consent_recording"),
    target("script_audio_storage"),
    target("script_audio"),
    target("voice_binding")
  ];
}

function acceptanceDependencies(
  overrides: Partial<StagingManualProviderAbsenceAcceptanceDependencies> = {}
): StagingManualProviderAbsenceAcceptanceDependencies & {
  operation: Operation;
  targets: Target[];
  getActiveOperation: ReturnType<typeof vi.fn>;
  listOperationTargets: ReturnType<typeof vi.fn>;
  claimExpiredOrAvailableLease: ReturnType<typeof vi.fn>;
  acceptG5cB7ManualProviderAbsence: ReturnType<typeof vi.fn>;
  releaseLease: ReturnType<typeof vi.fn>;
  providerGet: ReturnType<typeof vi.fn>;
  providerDelete: ReturnType<typeof vi.fn>;
} {
  const current = operation();
  const targets = exactIncidentTargets();
  const providerTarget = targets.find((entry) => entry.target_kind === "provider_voice")!;
  const getActiveOperation = vi.fn(async () => current);
  const listOperationTargets = vi.fn(async () => targets);
  const claimExpiredOrAvailableLease = vi.fn(async () => ({
    ...current,
    lease_token: LEASE_TOKEN,
    lease_expires_at: "2026-08-29T00:03:00.000Z",
    runner_attempt_count: current.runner_attempt_count + 1
  }));
  const acceptG5cB7ManualProviderAbsence = vi.fn(async () => {
    providerTarget.status = "verified_absent";
    providerTarget.reconciliation_status = "verified_absent";
    providerTarget.verification_status = "not_applicable";
    providerTarget.verified_absent_at = "2026-08-29T00:02:00.000Z";
    providerTarget.last_failure_category = "manual_provider_absence_accepted";
    providerTarget.last_attempted_at = "2026-08-29T00:02:00.000Z";
    current.status = "processing";
    current.current_stage = "provider_cleanup";
    current.last_failure_stage = null;
    current.last_failure_category = null;
    current.manual_reason_category = null;
    current.manual_required_at = null;
    current.next_retry_at = null;
    return current;
  });
  const releaseLease = vi.fn(async () => true);
  const providerGet = vi.fn();
  const providerDelete = vi.fn();

  return {
    repository: {
      getActiveOperation,
      listOperationTargets,
      claimExpiredOrAvailableLease,
      acceptG5cB7ManualProviderAbsence,
      releaseLease
    },
    createLeaseToken: () => LEASE_TOKEN,
    operation: current,
    targets,
    getActiveOperation,
    listOperationTargets,
    claimExpiredOrAvailableLease,
    acceptG5cB7ManualProviderAbsence,
    releaseLease,
    providerGet,
    providerDelete,
    ...overrides
  } as never;
}

function routeDependencies(
  overrides: Partial<G5cB7ManualProviderRecoveryRouteDependencies> = {}
): G5cB7ManualProviderRecoveryRouteDependencies & { accept: ReturnType<typeof vi.fn> } {
  const accept = vi.fn(async () => ({ state: "accepted" as const }));
  const diagnose = vi.fn(async () => ({
    classification: "UNKNOWN" as const,
    evidence: {
      adapterOutcome: "not_called" as const,
      httpStatusCategory: "not_called" as const,
      safeProviderType: "unknown" as const,
      safeProviderCode: "unknown" as const,
      mapperBranch: "incident_not_eligible" as const
    }
  }));
  return {
    isCanonicalStagingRuntime: () => true,
    hasSupabaseConfig: () => true,
    createClient: () => ({ auth: {} } as never),
    requireCurrentUser: async () => ({ id: USER_A } as never),
    ...overrides,
    diagnose: overrides.diagnose ?? diagnose,
    accept: overrides.accept ?? accept
  } as G5cB7ManualProviderRecoveryRouteDependencies & { accept: ReturnType<typeof vi.fn> };
}

describe("G5C-B7 Option D manual provider absence acceptance", () => {
  it("accepts only the exact durable incident, preserves all attempt counts, and does not call a provider", async () => {
    const dependencies = acceptanceDependencies();
    const downstreamBefore = dependencies.targets
      .filter((entry) => entry.target_kind !== "provider_voice")
      .map((entry) => ({ ...entry }));

    await expect(acceptStagingManualProviderAbsence(USER_A, dependencies)).resolves.toEqual({ state: "accepted" });

    expect(dependencies.acceptG5cB7ManualProviderAbsence).toHaveBeenCalledWith({
      operationId: OPERATION_ID,
      userId: USER_A,
      targetId: TARGET_ID,
      leaseToken: LEASE_TOKEN,
      expectedRunnerAttemptCount: 8,
      expectedVerificationAttemptCount: 2
    });
    expect(dependencies.targets.find((entry) => entry.target_kind === "provider_voice")).toMatchObject({
      status: "verified_absent",
      reconciliation_status: "verified_absent",
      verification_status: "not_applicable",
      delete_attempt_count: 1,
      delete_outcome: "succeeded",
      verification_attempt_count: 2,
      last_failure_category: "manual_provider_absence_accepted"
    });
    expect(dependencies.targets.filter((entry) => entry.target_kind !== "provider_voice")).toEqual(downstreamBefore);
    expect(dependencies.operation).toMatchObject({ status: "processing", current_stage: "provider_cleanup" });
    expect(dependencies.providerGet).not.toHaveBeenCalled();
    expect(dependencies.providerDelete).not.toHaveBeenCalled();
    expect(dependencies.releaseLease).toHaveBeenCalledWith({ operationId: OPERATION_ID, userId: USER_A, leaseToken: LEASE_TOKEN });
  });

  it.each([
    ["wrong operation state", (state: ReturnType<typeof acceptanceDependencies>) => { state.operation.status = "processing"; }],
    ["wrong phase", (state: ReturnType<typeof acceptanceDependencies>) => { state.operation.current_stage = "storage_cleanup"; }],
    ["snapshot mismatch", (state: ReturnType<typeof acceptanceDependencies>) => { state.operation.snapshot_status = "pending"; }],
    ["missing destructive start", (state: ReturnType<typeof acceptanceDependencies>) => { state.operation.destructive_started_at = null; }],
    ["pending retry", (state: ReturnType<typeof acceptanceDependencies>) => { state.operation.next_retry_at = "2026-08-29T01:00:00.000Z"; }],
    ["wrong owner", (state: ReturnType<typeof acceptanceDependencies>) => { state.operation.user_id = USER_B; }],
    ["provider target count mismatch", (state: ReturnType<typeof acceptanceDependencies>) => { state.targets.push(target("provider_voice", { id: "duplicate-provider" })); }],
    ["wrong provider", (state: ReturnType<typeof acceptanceDependencies>) => { state.targets[0].provider_name = "other"; }],
    ["delete attempts mismatch", (state: ReturnType<typeof acceptanceDependencies>) => { state.targets[0].delete_attempt_count = 2; }],
    ["delete outcome mismatch", (state: ReturnType<typeof acceptanceDependencies>) => { state.targets[0].delete_outcome = "rejected"; }],
    ["verification attempts absent", (state: ReturnType<typeof acceptanceDependencies>) => { state.targets[0].verification_attempt_count = 0; }],
    ["already verified absent", (state: ReturnType<typeof acceptanceDependencies>) => { state.targets[0].verified_absent_at = "2026-08-29T00:02:00.000Z"; }],
    ["Storage cleanup started", (state: ReturnType<typeof acceptanceDependencies>) => { state.targets[1].delete_attempt_count = 1; }],
    ["DB cleanup started", (state: ReturnType<typeof acceptanceDependencies>) => { state.targets[4].status = "verified_absent"; }],
    ["saved-model target exists", (state: ReturnType<typeof acceptanceDependencies>) => { state.targets.push(target("saved_model_audio")); }],
    ["cross-user target", (state: ReturnType<typeof acceptanceDependencies>) => { state.targets[0].user_id = USER_B; }]
  ])("fails closed without acquiring a lease when %s", async (_label, mutate) => {
    const dependencies = acceptanceDependencies();
    mutate(dependencies);

    await expect(acceptStagingManualProviderAbsence(USER_A, dependencies)).resolves.toEqual({ state: "not_eligible" });
    expect(dependencies.claimExpiredOrAvailableLease).not.toHaveBeenCalled();
    expect(dependencies.acceptG5cB7ManualProviderAbsence).not.toHaveBeenCalled();
    expect(dependencies.providerGet).not.toHaveBeenCalled();
    expect(dependencies.providerDelete).not.toHaveBeenCalled();
  });

  it("returns busy when the canonical lease cannot be claimed and makes no mutation", async () => {
    const dependencies = acceptanceDependencies();
    dependencies.repository.claimExpiredOrAvailableLease = vi.fn(async () => null);

    await expect(acceptStagingManualProviderAbsence(USER_A, dependencies)).resolves.toEqual({ state: "busy" });
    expect(dependencies.acceptG5cB7ManualProviderAbsence).not.toHaveBeenCalled();
    expect(dependencies.releaseLease).not.toHaveBeenCalled();
  });

  it("releases the lease after a stale RPC/CAS result without claiming success", async () => {
    const dependencies = acceptanceDependencies();
    dependencies.repository.acceptG5cB7ManualProviderAbsence = vi.fn(async () => null);

    await expect(acceptStagingManualProviderAbsence(USER_A, dependencies)).resolves.toEqual({ state: "not_eligible" });
    expect(dependencies.releaseLease).toHaveBeenCalledTimes(1);
  });

  it("requires canonical Staging, authentication, a closed confirmation literal, and no query/client identifiers", async () => {
    const nonStaging = routeDependencies({ isCanonicalStagingRuntime: () => false });
    const unauthenticated = routeDependencies({
      requireCurrentUser: async () => {
        throw new AppError(401, "unauthenticated");
      }
    });
    const invalidQuery = routeDependencies();
    const invalidPayload = routeDependencies();

    await expect(handleG5cB7ManualProviderAbsenceAcceptancePost(request(), nonStaging)).resolves.toMatchObject({ status: 404 });
    await expect(handleG5cB7ManualProviderAbsenceAcceptancePost(request(), unauthenticated)).resolves.toMatchObject({ status: 401 });
    await expect(
      handleG5cB7ManualProviderAbsenceAcceptancePost(
        request("/api/internal/g5c-b7/manual-provider-recovery?operationId=foreign"),
        invalidQuery
      )
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      handleG5cB7ManualProviderAbsenceAcceptancePost(
        request(undefined, { confirmation: G5C_B7_MANUAL_PROVIDER_ABSENCE_CONFIRMATION, targetId: TARGET_ID }),
        invalidPayload
      )
    ).resolves.toMatchObject({ status: 400 });
    await expect(handleG5cB7ManualProviderAbsenceAcceptancePost(request(undefined, {}), invalidPayload)).resolves.toMatchObject({ status: 400 });

    for (const dependencies of [nonStaging, unauthenticated, invalidQuery, invalidPayload]) {
      expect(dependencies.accept).not.toHaveBeenCalled();
    }
  });

  it("returns a no-store closed DTO that does not disclose durable/provider identifiers", async () => {
    const dependencies = routeDependencies();
    const response = await handleG5cB7ManualProviderAbsenceAcceptancePost(request(), dependencies);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(body).toEqual({ ok: true, data: { manualProviderAbsenceAcceptance: { state: "accepted" } } });
    const serialized = JSON.stringify(body);
    for (const sensitive of [USER_A, OPERATION_ID, TARGET_ID, PRIVATE_VOICE_ID, PRIVATE_PATH, LEASE_TOKEN]) {
      expect(serialized).not.toContain(sensitive);
    }
  });
});

describe("G5C-B7 Option D migration and regression contract", () => {
  it("adds one service-role-only, schema-neutral, forward-only acceptance RPC", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));
    const signature = "accept_g5c_b7_manual_provider_absence(uuid, uuid, uuid, uuid, integer, integer)";

    expect(sql.match(/security definer set search_path = pg_catalog, public/g)).toHaveLength(1);
    expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
    expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    expect(sql).not.toContain("create table");
    expect(sql).not.toContain("alter table");
    expect(sql).not.toContain("delete from");
    expect(sql).not.toContain("storage.objects");
    expect(sql).not.toContain("http://");
    expect(sql).not.toContain("https://");
  });

  it("guards the exact B7 incident, lease/CAS, sealed universe, consent withdrawal, and retained ownership before mutation", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    for (const guard of [
      "v_operation.status <> 'manual_required'",
      "v_operation.current_stage is distinct from 'provider_cleanup'",
      "v_operation.snapshot_status <> 'succeeded'",
      "v_operation.consent_withdrawal_status <> 'succeeded'",
      "v_operation.destructive_started_at is null",
      "v_operation.last_failure_category is distinct from 'provider_rejected'",
      "v_operation.manual_reason_category is distinct from 'provider_rejected'",
      "v_operation.next_retry_at is not null",
      "v_operation.lease_token is distinct from p_lease_token",
      "v_operation.lease_expires_at <= now()",
      "v_operation.runner_attempt_count <> p_expected_runner_attempt_count",
      "v_provider_target.delete_attempt_count <> 1",
      "v_provider_target.delete_outcome <> 'succeeded'",
      "v_provider_target.verification_attempt_count <> p_expected_verification_attempt_count",
      "v_provider_target.verification_attempt_count < 1",
      "v_provider_target.verified_absent_at is not null",
      "v_total_target_count <> 6",
      "v_storage_target_count <> 3",
      "v_database_target_count <> 2",
      "target.target_kind = 'saved_model_audio'",
      "target.status <> 'pending'",
      "public.g5c_b4_is_current_voice_cloning_consent(p_user_id, null)",
      "consent.status <> 'withdrawn'",
      "from auth.users as account",
      "and script.user_id = p_user_id"
    ]) {
      expect(sql).toContain(guard);
    }
  });

  it("records a distinct human acceptance category, keeps all counters, and only re-enters provider_cleanup", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("last_failure_category = 'manual_provider_absence_accepted'");
    expect(sql).toContain("set status = 'processing', current_stage = 'provider_cleanup'");
    expect(sql).not.toContain("delete_attempt_count = delete_attempt_count + 1");
    expect(sql).not.toContain("verification_attempt_count = verification_attempt_count + 1");
    expect(sql).not.toContain("current_stage = 'storage_cleanup'");
    expect(sql).not.toContain("finalize_voice_deletion_operation");
  });

  it("maps the exact server-derived acceptance parameters through the service-role repository RPC", async () => {
    const row = { id: OPERATION_ID, user_id: USER_A };
    const rpc = vi.fn(async () => ({ data: row, error: null }));
    const repository = createVoiceDeletionRepository({ rpc } as never);

    await repository.acceptG5cB7ManualProviderAbsence({
      operationId: OPERATION_ID,
      userId: USER_A,
      targetId: TARGET_ID,
      leaseToken: LEASE_TOKEN,
      expectedRunnerAttemptCount: 8,
      expectedVerificationAttemptCount: 2
    });

    expect(rpc).toHaveBeenCalledWith("accept_g5c_b7_manual_provider_absence", {
      p_operation_id: OPERATION_ID,
      p_user_id: USER_A,
      p_target_id: TARGET_ID,
      p_lease_token: LEASE_TOKEN,
      p_expected_runner_attempt_count: 8,
      p_expected_verification_attempt_count: 2
    });
  });

  it("keeps this POST provider-free and leaves automatic strict absence plus normal ordering unchanged", () => {
    const acceptanceService = readFileSync(acceptanceServicePath, "utf8");
    const acceptanceRoute = readFileSync(acceptanceRoutePath, "utf8");
    const providerMigration = compact(readFileSync(providerMigrationPath, "utf8"));
    const operationService = readFileSync(operationServicePath, "utf8");

    expect(acceptanceService).not.toContain("createElevenLabsVoiceDeletionProviderAdapter");
    expect(acceptanceService).not.toContain("reconcileVoiceAbsence");
    expect(acceptanceService).not.toContain("deleteVoice");
    expect(acceptanceRoute).not.toContain("advanceVoiceDeletion");
    expect(providerMigration).toContain("elsif p_result = 'present' and v_target.last_failure_category = 'provider_rejected' then");
    expect(providerMigration).toContain("and p_owner_signal <> 'false' then");
    expect(operationService).toContain("if (providerTargetsAreVerifiedAbsent(targets))");
    expect(operationService).toContain("await dependencies.runStorageStep(stepInput);");
  });
});
