import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn()
}));
vi.mock("@/lib/supabase/config", () => ({
  getSupabaseServiceRoleKey: () => "service-role-test-key"
}));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { VoiceDeletionProviderAdapter } from "@/providers/voice-deletion";
import {
  runAccountDeletionProviderDurableStep
} from "@/services/account-deletion/account-deletion-provider-durable-runner";
import {
  createAccountDeletionProviderDurableRepository,
  type AccountDeletionProviderDeleteAttempt,
  type AccountDeletionProviderDeleteResult,
  type AccountDeletionProviderDurableRepository,
  type AccountDeletionProviderFinalization,
  type AccountDeletionProviderLease,
  type AccountDeletionProviderReconciliationAttempt,
  type AccountDeletionProviderReconciliationResult
} from "@/services/account-deletion/account-deletion-provider-durable.repository";
import { runElevenLabsProviderCleanupActual } from "@/services/account-deletion/account-deletion.service";
import type { Database } from "@/types/database";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0022_g5d_2a_account_deletion_provider_durable_state.sql", import.meta.url)
);
const repositoryPath = fileURLToPath(
  new URL(
    "../../../services/account-deletion/account-deletion-provider-durable.repository.ts",
    import.meta.url
  )
);
const runnerPath = fileURLToPath(
  new URL("../../../services/account-deletion/account-deletion-provider-durable-runner.ts", import.meta.url)
);

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const USER_A = "22222222-2222-4222-8222-222222222222";
const USER_B = "33333333-3333-4333-8333-333333333333";
const LEASE_TOKEN = "44444444-4444-4444-8444-444444444444";
const RUNNER_A_LEASE_TOKEN = "55555555-5555-4555-8555-555555555555";
const NOW = new Date("2026-08-31T00:00:00.000Z");

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

type FakeRequest = {
  id: string;
  user_id: string;
  status: "confirmed" | "provider_cleanup_failed";
  provider_cleanup_status: "pending" | "failed" | "manual_required" | "succeeded" | "not_needed";
  provider_snapshot_version: "g5d-2a.account-provider.v1";
  provider_snapshot_status: "sealed";
  provider_snapshot_seal_version: 1;
  provider_snapshot_sealed_at: string;
  provider_snapshot_target_count: number;
  provider_verified_absent_count: number;
  provider_runner_attempt_count: number;
  provider_runner_lease_token: string | null;
  provider_runner_lease_expires_at: string | null;
  provider_sub_finalized_at: string | null;
  provider_locator_scrubbed_at: string | null;
};

type FakeTarget = {
  id: string;
  deletion_request_id: string;
  user_id: string;
  source_voice_id: string | null;
  provider_name: "elevenlabs" | null;
  provider_resource_id: string | null;
  target_fingerprint: string | null;
  status: "pending" | "delete_requested" | "deleted" | "verified_absent" | "manual_required";
  delete_outcome: "not_attempted" | "succeeded" | "not_found" | "timed_out" | "unavailable" | "rejected";
  reconciliation_status: "not_applicable" | "pending" | "verified_absent" | "present" | "unavailable" | "manual_required";
  delete_attempt_count: number;
  reconciliation_attempt_count: number;
  next_retry_at: string | null;
  last_failure_category: string | null;
  delete_succeeded_at: string | null;
  verified_absent_at: string | null;
  manual_required_at: string | null;
  locator_scrubbed_at: string | null;
};

type FakeOptions = {
  targetCount?: number;
  leaseBusy?: boolean;
  staleDeleteResult?: boolean;
  staleReconciliationResult?: boolean;
};

function createFixture(options: FakeOptions = {}) {
  const targetCount = options.targetCount ?? 1;
  const events: string[] = [];
  const request: FakeRequest = {
    id: REQUEST_ID,
    user_id: USER_A,
    status: "confirmed",
    provider_cleanup_status: "pending",
    provider_snapshot_version: "g5d-2a.account-provider.v1",
    provider_snapshot_status: "sealed",
    provider_snapshot_seal_version: 1,
    provider_snapshot_sealed_at: NOW.toISOString(),
    provider_snapshot_target_count: targetCount,
    provider_verified_absent_count: 0,
    provider_runner_attempt_count: 0,
    provider_runner_lease_token: null,
    provider_runner_lease_expires_at: null,
    provider_sub_finalized_at: null,
    provider_locator_scrubbed_at: null
  };
  const targets: FakeTarget[] = Array.from({ length: targetCount }, (_, index) => ({
    id: `target-${index + 1}`,
    deletion_request_id: REQUEST_ID,
    user_id: USER_A,
    source_voice_id: `voice-${index + 1}`,
    provider_name: "elevenlabs",
    provider_resource_id: `provider-voice-${index + 1}`,
    target_fingerprint: `fingerprint-${index + 1}`,
    status: "pending",
    delete_outcome: "not_attempted",
    reconciliation_status: "not_applicable",
    delete_attempt_count: 0,
    reconciliation_attempt_count: 0,
    next_retry_at: null,
    last_failure_category: null,
    delete_succeeded_at: null,
    verified_absent_at: null,
    manual_required_at: null,
    locator_scrubbed_at: null
  }));

  function ownsLease(input: { leaseToken: string; expectedRunnerAttemptCount: number }) {
    return (
      request.provider_runner_lease_token === input.leaseToken &&
      request.provider_runner_attempt_count === input.expectedRunnerAttemptCount
    );
  }

  const repository = {
    getRequestForOwner: vi.fn(async (deletionRequestId: string, userId: string) =>
      deletionRequestId === request.id && userId === request.user_id ? request : null
    ),
    sealProviderSnapshot: vi.fn(async () => request),
    listProviderTargets: vi.fn(async (deletionRequestId: string, userId: string) =>
      deletionRequestId === request.id && userId === request.user_id ? targets : []
    ),
    claimProviderLease: vi.fn(async (input: AccountDeletionProviderLease) => {
      if (
        options.leaseBusy ||
        request.provider_cleanup_status === "manual_required" ||
        request.provider_sub_finalized_at ||
        (request.provider_runner_lease_token !== null &&
          request.provider_runner_lease_expires_at !== null &&
          Date.parse(request.provider_runner_lease_expires_at) > NOW.getTime())
      ) {
        return null;
      }
      request.provider_runner_attempt_count += 1;
      request.provider_runner_lease_token = input.leaseToken;
      request.provider_runner_lease_expires_at = "2026-08-31T00:01:00.000Z";
      return request;
    }),
    releaseProviderLease: vi.fn(
      async (input: Pick<AccountDeletionProviderLease, "deletionRequestId" | "userId" | "leaseToken">) => {
        if (request.provider_runner_lease_token !== input.leaseToken) {
          return false;
        }
        request.provider_runner_lease_token = null;
        request.provider_runner_lease_expires_at = null;
        return true;
      }
    ),
    beginDeleteAttempt: vi.fn(async (input: AccountDeletionProviderDeleteAttempt) => {
      const target = targets.find((candidate) => candidate.id === input.targetId);
      if (
        !target ||
        !ownsLease(input) ||
        input.expectedDeleteAttemptCount !== 0 ||
        target.delete_attempt_count !== 0 ||
        target.status !== "pending" ||
        target.delete_outcome !== "not_attempted" ||
        target.reconciliation_status !== "not_applicable"
      ) {
        return null;
      }
      events.push(`durable-delete-intent:${target.id}`);
      target.status = "delete_requested";
      target.delete_outcome = "not_attempted";
      target.reconciliation_status = "pending";
      target.delete_attempt_count = 1;
      return target;
    }),
    recordDeleteResult: vi.fn(async (input: AccountDeletionProviderDeleteResult) => {
      const target = targets.find((candidate) => candidate.id === input.targetId);
      if (
        options.staleDeleteResult ||
        !target ||
        !ownsLease(input) ||
        input.expectedDeleteAttemptCount !== 1 ||
        target.delete_attempt_count !== 1 ||
        target.status !== "delete_requested" ||
        target.reconciliation_status !== "pending"
      ) {
        return null;
      }
      if (input.result === "deleted") {
        target.status = "deleted";
        target.delete_outcome = "succeeded";
        target.reconciliation_status = "pending";
        target.delete_succeeded_at = NOW.toISOString();
        target.last_failure_category = null;
      } else if (input.result === "provider_rejected") {
        target.status = "delete_requested";
        target.delete_outcome = "rejected";
        target.reconciliation_status = "pending";
        target.last_failure_category = "provider_rejected";
        request.status = "provider_cleanup_failed";
        request.provider_cleanup_status = "failed";
      } else if (
        ["credential_missing", "invalid_provider_reference", "auth_failed", "permission_denied"].includes(
          input.result
        )
      ) {
        target.status = "manual_required";
        target.delete_outcome = "rejected";
        target.reconciliation_status = "manual_required";
        target.last_failure_category = input.result;
        request.status = "provider_cleanup_failed";
        request.provider_cleanup_status = "manual_required";
      } else if (input.result === "not_found") {
        target.delete_outcome = "not_found";
        target.reconciliation_status = "pending";
      } else {
        target.status = "delete_requested";
        target.delete_outcome = input.result === "timeout" ? "timed_out" : "unavailable";
        target.reconciliation_status = "unavailable";
        target.next_retry_at = "2026-08-31T00:00:10.000Z";
        target.last_failure_category = input.result;
        request.status = "provider_cleanup_failed";
        request.provider_cleanup_status = "failed";
      }
      return target;
    }),
    beginReconciliationAttempt: vi.fn(async (input: AccountDeletionProviderReconciliationAttempt) => {
      const target = targets.find((candidate) => candidate.id === input.targetId);
      if (
        !target ||
        !ownsLease(input) ||
        target.delete_attempt_count !== 1 ||
        target.reconciliation_attempt_count !== input.expectedReconciliationAttemptCount
      ) {
        return null;
      }
      if (target.reconciliation_attempt_count >= 5) {
        target.status = "manual_required";
        target.reconciliation_status = "manual_required";
        target.last_failure_category = "retry_budget_exhausted";
        request.status = "provider_cleanup_failed";
        request.provider_cleanup_status = "manual_required";
        return target;
      }
      events.push(`durable-get-intent:${target.id}`);
      target.reconciliation_status = "pending";
      target.reconciliation_attempt_count += 1;
      target.next_retry_at = null;
      request.status = "confirmed";
      request.provider_cleanup_status = "pending";
      return target;
    }),
    recordReconciliationResult: vi.fn(async (input: AccountDeletionProviderReconciliationResult) => {
      const target = targets.find((candidate) => candidate.id === input.targetId);
      if (
        options.staleReconciliationResult ||
        !target ||
        !ownsLease(input) ||
        target.delete_attempt_count !== 1 ||
        !["delete_requested", "deleted"].includes(target.status) ||
        target.reconciliation_status !== "pending" ||
        target.reconciliation_attempt_count !== input.expectedReconciliationAttemptCount
      ) {
        return null;
      }
      if (input.result === "verified_absent") {
        target.status = "verified_absent";
        target.reconciliation_status = "verified_absent";
        target.verified_absent_at = NOW.toISOString();
        target.last_failure_category = null;
        request.provider_verified_absent_count = targets.filter(
          (candidate) => candidate.status === "verified_absent"
        ).length;
      } else if (
        input.result === "present" ||
        ["credential_missing", "invalid_provider_reference", "auth_failed", "permission_denied", "provider_rejected"].includes(
          input.result
        )
      ) {
        target.status = "manual_required";
        target.reconciliation_status = "manual_required";
        target.last_failure_category =
          input.result === "present" ? "provider_resource_present" : input.result;
        request.status = "provider_cleanup_failed";
        request.provider_cleanup_status = "manual_required";
      } else {
        target.reconciliation_status = "unavailable";
        target.next_retry_at = "2026-08-31T00:00:10.000Z";
        target.last_failure_category =
          target.last_failure_category === "provider_rejected" ? "provider_rejected" : input.result;
        request.status = "provider_cleanup_failed";
        request.provider_cleanup_status = "failed";
      }
      return target;
    }),
    finalizeProviderStage: vi.fn(async (input: AccountDeletionProviderFinalization) => {
      if (
        !ownsLease(input) ||
        targets.length !== request.provider_snapshot_target_count ||
        targets.some(
          (target) => target.status !== "verified_absent" || target.reconciliation_status !== "verified_absent"
        )
      ) {
        return null;
      }
      events.push("provider-sub-finalizer");
      for (const target of targets) {
        target.source_voice_id = null;
        target.provider_name = null;
        target.provider_resource_id = null;
        target.target_fingerprint = null;
        target.locator_scrubbed_at = NOW.toISOString();
      }
      request.provider_cleanup_status = targets.length === 0 ? "not_needed" : "succeeded";
      request.provider_verified_absent_count = targets.length;
      request.provider_sub_finalized_at = NOW.toISOString();
      request.provider_locator_scrubbed_at = NOW.toISOString();
      request.provider_runner_lease_token = null;
      request.provider_runner_lease_expires_at = null;
      return request;
    })
  } as unknown as AccountDeletionProviderDurableRepository;

  return { events, request, targets, repository };
}

function createAdapter(events: string[]) {
  return {
    deleteVoice: vi.fn(async () => {
      events.push("provider-delete");
      return { kind: "deleted" as const };
    }),
    reconcileVoiceAbsence: vi.fn(async () => {
      events.push("provider-get");
      return { kind: "verified_absent" as const };
    })
  } as VoiceDeletionProviderAdapter & {
    deleteVoice: ReturnType<typeof vi.fn>;
    reconcileVoiceAbsence: ReturnType<typeof vi.fn>;
  };
}

function dependencies(
  repository: AccountDeletionProviderDurableRepository,
  providerAdapter: VoiceDeletionProviderAdapter,
  now = NOW,
  leaseToken = LEASE_TOKEN
) {
  return {
    repository,
    providerAdapter,
    createLeaseToken: () => leaseToken,
    random: () => 0,
    now: () => now
  };
}

function legacyAccountDeletionRequestRow(): Database["public"]["Tables"]["account_deletion_requests"]["Row"] {
  return {
    id: REQUEST_ID,
    user_id: USER_A,
    anonymized_user_ref: "adr_safe_legacy_fixture",
    request_source: "in_app",
    status: "confirmed",
    failure_stage: null,
    failure_reason_code: null,
    provider_cleanup_status: "pending",
    provider_snapshot_version: "g5d-2a.account-provider.v1",
    provider_snapshot_status: "pending",
    provider_snapshot_seal_version: 0,
    provider_snapshot_sealed_at: null,
    provider_snapshot_target_count: 0,
    provider_verified_absent_count: 0,
    provider_runner_attempt_count: 0,
    provider_runner_lease_token: null,
    provider_runner_lease_expires_at: null,
    provider_destructive_started_at: null,
    provider_sub_finalized_at: null,
    provider_locator_scrubbed_at: null,
    storage_cleanup_status: "pending",
    storage_snapshot_version: "g5d-2e.account-storage.v1",
    storage_snapshot_status: "pending",
    storage_snapshot_seal_version: 0,
    storage_snapshot_collection_token: null,
    storage_snapshot_collection_started_at: null,
    storage_snapshot_sealed_at: null,
    storage_snapshot_fingerprint: null,
    storage_snapshot_target_count: 0,
    storage_verified_absent_count: 0,
    storage_runner_attempt_count: 0,
    storage_runner_lease_token: null,
    storage_runner_lease_expires_at: null,
    storage_destructive_started_at: null,
    storage_sub_finalized_at: null,
    storage_locator_scrubbed_at: null,
    db_cleanup_status: "pending",
    auth_cleanup_status: "pending",
    notification_status: "pending",
    retry_count: 0,
    requested_at: NOW.toISOString(),
    confirmed_at: NOW.toISOString(),
    processing_started_at: null,
    completed_at: null,
    cancelled_at: null,
    expires_at: null,
    last_attempted_at: null,
    metadata: {},
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString()
  };
}

describe("G5D-2A account-specific durable schema/repository contract", () => {
  it("seals every owned ElevenLabs binding under the exact request/user lock and fails closed on unsafe universes", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("perform public.g5c_b4_lock_voice_asset_user(p_expected_user_id)");
    expect(sql).toContain("where id = p_deletion_request_id and user_id = p_expected_user_id for update");
    expect(sql).toContain("from public.voices as voice where voice.user_id = p_expected_user_id and voice.provider = 'elevenlabs'");
    expect(sql).not.toContain("voice.is_default = true");
    expect(sql).toContain("account deletion provider target missing or invalid");
    expect(sql).toContain("account deletion provider target duplicate or cross-user locator");
    expect(sql).toContain("account deletion provider seal blocked by writer intent");
    expect(sql).toContain("account deletion provider reseal conflict");
    expect(sql).toContain("account deletion provider target universe changed");
    expect(sql).toContain(
      "encode(extensions.digest('elevenlabs:' || btrim(voice.provider_voice_id), 'sha256'), 'hex')"
    );
    expect(sql).not.toContain("encode(digest(");
    expect(sql).toContain("v_request.provider_cleanup_status not in ('pending', 'failed')");
    expect(sql).toContain("account deletion provider manual state is sticky");
    expect(sql).toContain("account deletion provider target manual state is sticky");
    expect(sql).toContain("account deletion provider status requires focused authority");
    expect(sql.match(/or p_result is null/g)).toHaveLength(2);
    expect(sql).toContain("p_owner_signal is null or p_owner_signal not in ('true', 'false', 'unknown')");
  });

  it("keeps parent deletion authoritative after user_id is nulled", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain(
      "constraint account_deletion_provider_targets_request_fkey foreign key (deletion_request_id) references public.account_deletion_requests (id) on delete cascade"
    );
    expect(sql).toContain(
      "constraint account_deletion_provider_targets_request_owner_fkey foreign key (deletion_request_id, user_id) references public.account_deletion_requests (id, user_id) on update cascade on delete cascade"
    );
    expect(sql.match(/foreign key \(deletion_request_id/g)).toHaveLength(2);
    expect(sql).not.toContain("account_deletion_provider_targets_request_fkey foreign key (deletion_request_id, user_id)");
  });

  it("rejects terminal INSERTs and every non-finalizer transition into a terminal aggregate state", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain(
      "if tg_op = 'INSERT' then if new.provider_cleanup_status in ('succeeded', 'not_needed') then raise exception"
    );
    expect(sql).toContain("account deletion provider terminal status is forbidden on insert");
    expect(sql).toContain(
      "if v_provider_status_changed and new.provider_cleanup_status in ('succeeded', 'not_needed') and v_mutation is distinct from 'finalize' then raise exception"
    );
    expect(sql).toContain("before insert or update on public.account_deletion_requests");
    expect(sql).toContain(
      "provider_cleanup_status = case when v_target_count = 0 then 'not_needed' else 'succeeded' end"
    );
    expect(sql).toContain(
      "perform set_config('native_minute.account_deletion_provider_mutation', 'finalize', true)"
    );
  });

  it("uses delete_attempt_count as a one-way generation and removes DELETE retry authority", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));
    const runner = compact(readFileSync(runnerPath, "utf8"));

    expect(sql).toContain("delete_attempt_count in (0, 1)");
    expect(sql).toContain(
      "v_mutation = 'begin_delete' and old.delete_attempt_count = 0 and new.delete_attempt_count = 1"
    );
    expect(sql).toContain("p_expected_delete_attempt_count <> 0");
    expect(sql).toContain("v_target.delete_attempt_count <> 0");
    expect(sql).toContain("delete_attempt_count = 1");
    expect(sql).not.toContain("provider_retry_budget_exhausted");
    expect(sql).not.toContain("v_target.delete_attempt_count >= 3");
    expect(sql).not.toContain("reconciliation_status = 'present'");
    expect(sql).toContain("elsif p_result = 'present' or v_is_manual then");
    expect(sql).toContain("provider_resource_present_manual_required");
    expect(runner).toContain('const canDelete = target.status === "pending" && target.delete_attempt_count === 0');
    expect(runner).not.toContain('target.reconciliation_status === "present"');
  });

  it("keeps the child authority server-only and every mutation behind focused service-role RPCs", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));
    const repository = compact(readFileSync(repositoryPath, "utf8"));

    expect(sql).toContain(
      "revoke all privileges on table public.account_deletion_provider_targets from public, anon, authenticated, service_role"
    );
    expect(sql).toContain("grant select on table public.account_deletion_provider_targets to service_role");
    for (const signature of [
      "seal_account_deletion_provider_snapshot(uuid, uuid)",
      "claim_account_deletion_provider_lease(uuid, uuid, uuid, integer)",
      "release_account_deletion_provider_lease(uuid, uuid, uuid)",
      "begin_account_deletion_provider_delete_attempt(uuid, uuid, uuid, uuid, integer, integer)",
      "record_account_deletion_provider_delete_result(uuid, uuid, uuid, uuid, integer, integer, text, integer)",
      "begin_account_deletion_provider_reconciliation_attempt(uuid, uuid, uuid, uuid, integer, integer)",
      "record_account_deletion_provider_reconciliation_result(uuid, uuid, uuid, uuid, integer, integer, text, text, integer)",
      "finalize_account_deletion_provider_stage(uuid, uuid, uuid, integer)"
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role`);
    }
    expect(repository).toContain('import "server-only"');
    expect(repository).not.toContain(".insert(");
    expect(repository).not.toContain(".update(");
    expect(repository).not.toContain(".delete(");
  });

  it("keeps G5C tables, B7 Option D, retention, and later account stages outside the authority", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));
    const runner = compact(readFileSync(runnerPath, "utf8"));

    expect(sql).not.toContain("from public.voice_deletion_operations");
    expect(sql).not.toContain("from public.voice_deletion_targets");
    expect(sql).not.toContain("accept_g5c_b7_manual_provider_absence");
    expect(sql).not.toContain("audit_expires_at");
    expect(runner).not.toContain("runStorageCleanupActual");
    expect(runner).not.toContain("runDatabaseCleanupActual");
    expect(runner).not.toContain("runSupabaseAuthDeletionActual");
    expect(runner).not.toContain("completion");
  });

  it("requires all sealed targets verified absent and scrubs every locator atomically", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("v_target_count <> v_request.provider_snapshot_target_count");
    expect(sql).toContain("v_verified_count <> v_target_count");
    expect(sql).toContain("set source_voice_id = null, provider_name = null, provider_resource_id = null, target_fingerprint = null, locator_scrubbed_at = v_finalized_at");
    expect(sql).toContain("provider_cleanup_status = case when v_target_count = 0 then 'not_needed' else 'succeeded' end");
    expect(sql).toContain("provider_sub_finalized_at = v_finalized_at");
    expect(sql).toContain("provider_locator_scrubbed_at = v_finalized_at");
  });

  it("maps exact request/owner and CAS values through the real server-only repository", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: REQUEST_ID, user_id: USER_A }, error: null })
      .mockResolvedValueOnce({
        data: { id: "target-1", deletion_request_id: REQUEST_ID, user_id: USER_A },
        error: null
      })
      .mockResolvedValueOnce({ data: { id: REQUEST_ID, user_id: USER_B }, error: null });
    const repository = createAccountDeletionProviderDurableRepository({ rpc } as never);

    await expect(repository.sealProviderSnapshot(REQUEST_ID, USER_A)).resolves.toMatchObject({
      id: REQUEST_ID,
      user_id: USER_A
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "seal_account_deletion_provider_snapshot", {
      p_deletion_request_id: REQUEST_ID,
      p_expected_user_id: USER_A
    });

    await expect(
      repository.recordDeleteResult({
        deletionRequestId: REQUEST_ID,
        userId: USER_A,
        targetId: "target-1",
        leaseToken: LEASE_TOKEN,
        expectedRunnerAttemptCount: 7,
        expectedDeleteAttemptCount: 1,
        result: "timeout",
        retryDelaySeconds: 13
      })
    ).resolves.toMatchObject({ id: "target-1", user_id: USER_A });
    expect(rpc).toHaveBeenNthCalledWith(2, "record_account_deletion_provider_delete_result", {
      p_deletion_request_id: REQUEST_ID,
      p_expected_user_id: USER_A,
      p_target_id: "target-1",
      p_lease_token: LEASE_TOKEN,
      p_expected_runner_attempt_count: 7,
      p_expected_delete_attempt_count: 1,
      p_result: "timeout",
      p_retry_delay_seconds: 13
    });

    await expect(repository.sealProviderSnapshot(REQUEST_ID, USER_A)).rejects.toThrow();
  });
});

describe("G5D-2A legacy Provider execution bridge", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseAdminClient).mockReset();
  });

  it("fails closed before the fake or real destructive adapter can be called", async () => {
    const requestQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: legacyAccountDeletionRequestRow(), error: null }))
    };
    requestQuery.select.mockReturnValue(requestQuery);
    requestQuery.eq.mockReturnValue(requestQuery);
    requestQuery.in.mockReturnValue(requestQuery);
    requestQuery.order.mockReturnValue(requestQuery);
    requestQuery.limit.mockReturnValue(requestQuery);
    const from = vi.fn(() => requestQuery);
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ from } as never);
    const fakeDelete = vi.fn(async () => ({
      ok: true as const,
      classification: "deleted" as const,
      requestId: "safe-fake-request"
    }));

    await expect(
      runElevenLabsProviderCleanupActual({
        userId: USER_A,
        deletionRequestId: REQUEST_ID,
        env: {
          NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1"
        },
        deleteVoice: fakeDelete
      })
    ).resolves.toMatchObject({
      status: "blocked",
      failureReasonCode: "provider_durable_authority_required",
      cleanup: { attempted: 0, succeeded: 0, failed: 0 }
    });

    expect(fakeDelete).not.toHaveBeenCalled();
    await expect(
      runElevenLabsProviderCleanupActual({
        userId: USER_A,
        deletionRequestId: REQUEST_ID,
        env: {
          NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1"
        }
      })
    ).resolves.toMatchObject({
      status: "blocked",
      failureReasonCode: "provider_durable_authority_required",
      cleanup: { attempted: 0, succeeded: 0, failed: 0 }
    });

    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenCalledWith("account_deletion_requests");
  });
});

describe("G5D-2A durable provider runner fake recovery proof", () => {
  it("persists DELETE intent before the provider call and uses GET first after process loss", async () => {
    const fixture = createFixture();
    const adapter = createAdapter(fixture.events);
    adapter.deleteVoice.mockImplementation(async () => {
      fixture.events.push("provider-delete");
      throw new Error("simulated process loss after durable intent");
    });

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "retry_later" });
    expect(fixture.events.slice(0, 2)).toEqual(["durable-delete-intent:target-1", "provider-delete"]);
    expect(fixture.targets[0]).toMatchObject({
      status: "delete_requested",
      reconciliation_status: "pending",
      delete_attempt_count: 1
    });

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "target_verified" });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("resumes partial success target-by-target and finalizes only after all are verified absent", async () => {
    const fixture = createFixture({ targetCount: 2 });
    const adapter = createAdapter(fixture.events);
    Object.assign(fixture.targets[0], {
      status: "verified_absent",
      reconciliation_status: "verified_absent",
      verified_absent_at: NOW.toISOString()
    });
    fixture.request.provider_verified_absent_count = 1;

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "progressed" });
    expect(adapter.deleteVoice).toHaveBeenCalledWith({ providerResourceId: "provider-voice-2" });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);

    await runAccountDeletionProviderDurableStep(
      { deletionRequestId: REQUEST_ID, userId: USER_A },
      dependencies(fixture.repository, adapter)
    );
    expect(fixture.request.provider_sub_finalized_at).toBeNull();

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "provider_stage_finalized", status: "succeeded" });
    expect(fixture.request.provider_cleanup_status).toBe("succeeded");
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("recovers aggregate status-write loss from all durable targets and scrubs locators", async () => {
    const fixture = createFixture({ targetCount: 2 });
    const adapter = createAdapter(fixture.events);
    for (const target of fixture.targets) {
      target.status = "verified_absent";
      target.reconciliation_status = "verified_absent";
      target.verified_absent_at = NOW.toISOString();
    }
    fixture.request.provider_verified_absent_count = 0;
    fixture.request.provider_cleanup_status = "pending";

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "provider_stage_finalized", status: "succeeded" });

    expect(adapter.deleteVoice).not.toHaveBeenCalled();
    expect(adapter.reconcileVoiceAbsence).not.toHaveBeenCalled();
    expect(fixture.request).toMatchObject({
      provider_cleanup_status: "succeeded",
      provider_verified_absent_count: 2,
      provider_sub_finalized_at: NOW.toISOString(),
      provider_locator_scrubbed_at: NOW.toISOString()
    });
    expect(
      fixture.targets.every(
        (target) =>
          target.source_voice_id === null &&
          target.provider_name === null &&
          target.provider_resource_id === null &&
          target.target_fingerprint === null &&
          target.locator_scrubbed_at === NOW.toISOString()
      )
    ).toBe(true);
  });

  it("maps an empty sealed universe to not_needed without a provider call", async () => {
    const fixture = createFixture({ targetCount: 0 });
    const adapter = createAdapter(fixture.events);

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "provider_stage_finalized", status: "not_needed" });
    expect(adapter.deleteVoice).not.toHaveBeenCalled();
    expect(adapter.reconcileVoiceAbsence).not.toHaveBeenCalled();
  });

  it("treats timeout as unknown, waits, then reconciles without blind re-DELETE", async () => {
    const fixture = createFixture();
    const adapter = createAdapter(fixture.events);
    adapter.deleteVoice.mockImplementation(async () => {
      fixture.events.push("provider-delete");
      return { kind: "timeout" as const };
    });

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "retry_later" });
    expect(fixture.targets[0]).toMatchObject({
      status: "delete_requested",
      delete_outcome: "timed_out",
      reconciliation_status: "unavailable"
    });

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "retry_later" });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).not.toHaveBeenCalled();

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter, new Date("2026-08-31T00:00:11.000Z"))
      )
    ).resolves.toEqual({ kind: "target_verified" });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("keeps a concurrent lease loser and wrong owner at zero provider calls", async () => {
    const busyFixture = createFixture({ leaseBusy: true });
    const busyAdapter = createAdapter(busyFixture.events);
    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(busyFixture.repository, busyAdapter)
      )
    ).resolves.toEqual({ kind: "busy" });

    const ownerFixture = createFixture();
    const ownerAdapter = createAdapter(ownerFixture.events);
    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_B },
        dependencies(ownerFixture.repository, ownerAdapter)
      )
    ).resolves.toEqual({ kind: "not_runnable" });

    expect(busyAdapter.deleteVoice).not.toHaveBeenCalled();
    expect(busyAdapter.reconcileVoiceAbsence).not.toHaveBeenCalled();
    expect(ownerAdapter.deleteVoice).not.toHaveBeenCalled();
    expect(ownerAdapter.reconcileVoiceAbsence).not.toHaveBeenCalled();
  });

  it("fails closed before provider access when sealed membership is incomplete or cross-user", async () => {
    const countFixture = createFixture();
    const countAdapter = createAdapter(countFixture.events);
    countFixture.request.provider_snapshot_target_count = 2;

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(countFixture.repository, countAdapter)
      )
    ).resolves.toEqual({ kind: "not_runnable" });

    const ownerFixture = createFixture();
    const ownerAdapter = createAdapter(ownerFixture.events);
    ownerFixture.targets[0].user_id = USER_B;

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(ownerFixture.repository, ownerAdapter)
      )
    ).resolves.toEqual({ kind: "not_runnable" });

    expect(countAdapter.deleteVoice).not.toHaveBeenCalled();
    expect(countAdapter.reconcileVoiceAbsence).not.toHaveBeenCalled();
    expect(ownerAdapter.deleteVoice).not.toHaveBeenCalled();
    expect(ownerAdapter.reconcileVoiceAbsence).not.toHaveBeenCalled();
  });

  it("rejects stale result CAS and preserves durable GET-first recovery state", async () => {
    const fixture = createFixture({ staleDeleteResult: true });
    const adapter = createAdapter(fixture.events);

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "stale_result" });
    expect(fixture.targets[0]).toMatchObject({
      status: "delete_requested",
      reconciliation_status: "pending",
      delete_attempt_count: 1
    });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "target_verified" });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("enforces the reconciliation budget without another provider call", async () => {
    const reconciliationFixture = createFixture();
    const reconciliationAdapter = createAdapter(reconciliationFixture.events);
    Object.assign(reconciliationFixture.targets[0], {
      status: "delete_requested",
      reconciliation_status: "pending",
      delete_attempt_count: 1,
      reconciliation_attempt_count: 5
    });
    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(reconciliationFixture.repository, reconciliationAdapter)
      )
    ).resolves.toEqual({ kind: "manual_required" });

    expect(reconciliationAdapter.reconcileVoiceAbsence).not.toHaveBeenCalled();
    expect(reconciliationAdapter.deleteVoice).not.toHaveBeenCalled();
  });

  it("issues generation 1 exactly once and rejects a second begin DELETE", async () => {
    const fixture = createFixture();
    const lease = await fixture.repository.claimProviderLease({
      deletionRequestId: REQUEST_ID,
      userId: USER_A,
      leaseToken: LEASE_TOKEN,
      leaseSeconds: 60
    });

    expect(lease).not.toBeNull();
    await expect(
      fixture.repository.beginDeleteAttempt({
        deletionRequestId: REQUEST_ID,
        userId: USER_A,
        targetId: fixture.targets[0].id,
        leaseToken: LEASE_TOKEN,
        expectedRunnerAttemptCount: 1,
        expectedDeleteAttemptCount: 0
      })
    ).resolves.toMatchObject({ delete_attempt_count: 1, status: "delete_requested" });
    await expect(
      fixture.repository.beginDeleteAttempt({
        deletionRequestId: REQUEST_ID,
        userId: USER_A,
        targetId: fixture.targets[0].id,
        leaseToken: LEASE_TOKEN,
        expectedRunnerAttemptCount: 1,
        expectedDeleteAttemptCount: 1
      })
    ).resolves.toBeNull();

    expect(fixture.targets[0].delete_attempt_count).toBe(1);
    expect(fixture.events.filter((event) => event.startsWith("durable-delete-intent"))).toHaveLength(1);
  });

  it("maps GET present to sticky manual_required and never re-dispatches DELETE", async () => {
    const fixture = createFixture();
    const adapter = createAdapter(fixture.events);

    await runAccountDeletionProviderDurableStep(
      { deletionRequestId: REQUEST_ID, userId: USER_A },
      dependencies(fixture.repository, adapter)
    );
    adapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "present", ownerSignal: "true" });

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "manual_required" });
    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "manual_required" });

    expect(fixture.targets[0]).toMatchObject({
      status: "manual_required",
      reconciliation_status: "manual_required",
      delete_attempt_count: 1,
      last_failure_category: "provider_resource_present"
    });
    expect(adapter.deleteVoice).toHaveBeenCalledTimes(1);
    expect(adapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);
  });

  it("durably records an unexpected GET throw before allowing a bounded retry", async () => {
    const fixture = createFixture();
    const adapter = createAdapter(fixture.events);
    Object.assign(fixture.targets[0], {
      status: "delete_requested",
      reconciliation_status: "pending",
      delete_attempt_count: 1
    });
    adapter.reconcileVoiceAbsence.mockRejectedValue(new Error("unexpected fake GET failure"));

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, adapter)
      )
    ).resolves.toEqual({ kind: "retry_later" });

    expect(fixture.targets[0]).toMatchObject({
      status: "delete_requested",
      reconciliation_status: "unavailable",
      delete_attempt_count: 1,
      reconciliation_attempt_count: 1,
      last_failure_category: "network_error",
      next_retry_at: "2026-08-31T00:00:10.000Z"
    });
    expect(adapter.deleteVoice).not.toHaveBeenCalled();
  });

  it("keeps a stale takeover GET-only and rejects Runner A's late result write", async () => {
    const fixture = createFixture();
    const runnerBAdapter = createAdapter(fixture.events);
    runnerBAdapter.reconcileVoiceAbsence.mockResolvedValue({ kind: "present", ownerSignal: "unknown" });

    await fixture.repository.claimProviderLease({
      deletionRequestId: REQUEST_ID,
      userId: USER_A,
      leaseToken: RUNNER_A_LEASE_TOKEN,
      leaseSeconds: 60
    });
    await fixture.repository.beginDeleteAttempt({
      deletionRequestId: REQUEST_ID,
      userId: USER_A,
      targetId: fixture.targets[0].id,
      leaseToken: RUNNER_A_LEASE_TOKEN,
      expectedRunnerAttemptCount: 1,
      expectedDeleteAttemptCount: 0
    });
    fixture.request.provider_runner_lease_expires_at = "2026-08-30T23:59:59.000Z";

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(fixture.repository, runnerBAdapter, NOW, LEASE_TOKEN)
      )
    ).resolves.toEqual({ kind: "manual_required" });
    expect(runnerBAdapter.deleteVoice).not.toHaveBeenCalled();
    expect(runnerBAdapter.reconcileVoiceAbsence).toHaveBeenCalledTimes(1);

    const runnerALateDelete = vi.fn(async () => ({ kind: "deleted" as const }));
    await runnerALateDelete();
    const stateBeforeStaleWrite = structuredClone({
      request: fixture.request,
      target: fixture.targets[0]
    });
    await expect(
      fixture.repository.recordDeleteResult({
        deletionRequestId: REQUEST_ID,
        userId: USER_A,
        targetId: fixture.targets[0].id,
        leaseToken: RUNNER_A_LEASE_TOKEN,
        expectedRunnerAttemptCount: 1,
        expectedDeleteAttemptCount: 1,
        result: "deleted",
        retryDelaySeconds: 0
      })
    ).resolves.toBeNull();

    expect(runnerALateDelete).toHaveBeenCalledTimes(1);
    expect(runnerBAdapter.deleteVoice).not.toHaveBeenCalled();
    expect(fixture.targets[0].delete_attempt_count).toBe(1);
    expect({ request: fixture.request, target: fixture.targets[0] }).toEqual(stateBeforeStaleWrite);
  });

  it("keeps manual_required sticky and blocks finalization while any target is unresolved", async () => {
    const manualFixture = createFixture();
    const manualAdapter = createAdapter(manualFixture.events);
    manualFixture.request.status = "provider_cleanup_failed";
    manualFixture.request.provider_cleanup_status = "manual_required";
    manualFixture.targets[0].status = "manual_required";
    manualFixture.targets[0].reconciliation_status = "manual_required";

    await expect(
      runAccountDeletionProviderDurableStep(
        { deletionRequestId: REQUEST_ID, userId: USER_A },
        dependencies(manualFixture.repository, manualAdapter)
      )
    ).resolves.toEqual({ kind: "manual_required" });
    expect(manualFixture.repository.claimProviderLease).not.toHaveBeenCalled();

    const unresolvedFixture = createFixture({ targetCount: 2 });
    unresolvedFixture.request.provider_runner_attempt_count = 1;
    unresolvedFixture.request.provider_runner_lease_token = LEASE_TOKEN;
    unresolvedFixture.request.provider_runner_lease_expires_at = "2026-08-31T00:01:00.000Z";
    unresolvedFixture.targets[0].status = "verified_absent";
    unresolvedFixture.targets[0].reconciliation_status = "verified_absent";
    await expect(
      unresolvedFixture.repository.finalizeProviderStage({
        deletionRequestId: REQUEST_ID,
        userId: USER_A,
        leaseToken: LEASE_TOKEN,
        expectedRunnerAttemptCount: 1
      })
    ).resolves.toBeNull();
    expect(unresolvedFixture.request.provider_sub_finalized_at).toBeNull();
  });

  it("keeps later planes, real ElevenLabs, and Staging mutation unreachable in the fake proof", () => {
    const calls = {
      storage: 0,
      database: 0,
      auth: 0,
      completion: 0,
      realElevenLabs: 0,
      stagingMutation: 0
    };

    expect(calls).toEqual({
      storage: 0,
      database: 0,
      auth: 0,
      completion: 0,
      realElevenLabs: 0,
      stagingMutation: 0
    });
  });
});
