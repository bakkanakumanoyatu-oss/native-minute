import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyAccountDeletionAuthDeleteResponse,
  classifyAccountDeletionAuthGetResponse,
  type AccountDeletionAuthAdapter,
  type AccountDeletionAuthDeleteResult,
  type AccountDeletionAuthGetResult
} from "@/services/account-deletion/account-deletion-auth-adapter";
import {
  ACCOUNT_DELETION_AUTH_INTENT_VERSION,
  createAccountDeletionAuthDurableRepository,
  type AccountDeletionAuthCurrentVerificationResult,
  type AccountDeletionAuthDispatchOutcome,
  type AccountDeletionAuthDurableRepository,
  type AccountDeletionAuthRequestRow,
  type AccountDeletionAuthVerificationResult
} from "@/services/account-deletion/account-deletion-auth-durable.repository";
import { runAccountDeletionAuthDurableStep } from "@/services/account-deletion/account-deletion-auth-durable-runner";

const REQUEST_A = "11111111-1111-4111-8111-111111111111";
const REQUEST_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = "2026-09-03T00:00:00.000Z";
const EXPECTED_MIGRATION_SHA256 = "4c9a34ddb0ded45e02edd345fb0dcebd171cb5aaa5866b5c9ea5b9146e312b81";
const migrationPath = fileURLToPath(new URL(
  "../../../supabase/migrations/0026_g5d_2m_auth_deletion_durable_recovery_foundation.sql",
  import.meta.url
));
const databaseTypesPath = fileURLToPath(new URL("../../../types/database.ts", import.meta.url));

function requestFixture(overrides: Partial<AccountDeletionAuthRequestRow> = {}): AccountDeletionAuthRequestRow {
  return {
    id: REQUEST_A,
    user_id: USER_A,
    anonymized_user_ref: "adr_11111111111111111111111111111111",
    status: "confirmed",
    failure_stage: null,
    failure_reason_code: null,
    provider_cleanup_status: "not_needed",
    provider_snapshot_version: "g5d-2a.account-provider.v1",
    provider_snapshot_status: "sealed",
    provider_snapshot_seal_version: 1,
    provider_snapshot_sealed_at: NOW,
    provider_snapshot_target_count: 0,
    provider_verified_absent_count: 0,
    provider_runner_lease_token: null,
    provider_runner_lease_expires_at: null,
    provider_sub_finalized_at: NOW,
    provider_locator_scrubbed_at: NOW,
    storage_cleanup_status: "not_needed",
    storage_snapshot_version: "g5d-2e.account-storage.v1",
    storage_snapshot_status: "sealed",
    storage_snapshot_seal_version: 1,
    storage_snapshot_sealed_at: NOW,
    storage_snapshot_fingerprint: null,
    storage_snapshot_target_count: 0,
    storage_verified_absent_count: 0,
    storage_runner_lease_token: null,
    storage_runner_lease_expires_at: null,
    storage_sub_finalized_at: NOW,
    storage_locator_scrubbed_at: NOW,
    db_cleanup_status: "not_needed",
    db_inventory_version: "g5d-2h.account-db.v1",
    db_observed_row_count: 1,
    db_deleted_row_count: 0,
    db_anonymized_row_count: 0,
    db_retained_row_count: 1,
    db_sub_finalized_at: NOW,
    auth_cleanup_status: "pending",
    auth_intent_version: null,
    auth_delete_target_user_id: null,
    auth_delete_generation: 0,
    auth_delete_requested_at: null,
    auth_verification_attempt_count: 0,
    auth_verification_result: null,
    auth_verification_result_attempt_count: null,
    auth_verified_absent_at: null,
    auth_sub_finalized_at: null,
    retry_count: 0,
    last_attempted_at: NOW,
    metadata: {},
    ...overrides
  };
}

function sealedFixture(overrides: Partial<AccountDeletionAuthRequestRow> = {}) {
  return requestFixture({
    auth_intent_version: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
    auth_delete_target_user_id: USER_A,
    auth_delete_requested_at: NOW,
    ...overrides
  });
}

function clone(row: AccountDeletionAuthRequestRow) {
  return structuredClone(row);
}

function fakeRepository(initial: AccountDeletionAuthRequestRow) {
  let row = clone(initial);
  const calls = {
    lookup: 0,
    seal: 0,
    beginVerification: 0,
    recordVerification: 0,
    authorize: 0,
    dispatchOutcome: 0,
    finalize: 0
  };

  const repository: AccountDeletionAuthDurableRepository = {
    async getRequestByAuthority(ref) {
      calls.lookup += 1;
      return ref === row.id || ref === row.anonymized_user_ref ? clone(row) : null;
    },
    async sealAuthIntent(input) {
      calls.seal += 1;
      if (input.deletionRequestId !== row.id || input.expectedUserId !== row.user_id || row.user_id === null) return null;
      if (row.auth_intent_version === null) {
        row.auth_intent_version = ACCOUNT_DELETION_AUTH_INTENT_VERSION;
        row.auth_delete_target_user_id = row.user_id;
        row.auth_delete_requested_at = NOW;
      }
      return clone(row);
    },
    async beginVerificationAttempt(input) {
      calls.beginVerification += 1;
      if (
        input.deletionRequestId !== row.id ||
        input.expectedTargetUserId !== row.auth_delete_target_user_id ||
        input.expectedVerificationAttemptCount !== row.auth_verification_attempt_count ||
        row.auth_cleanup_status === "manual_required" || row.auth_sub_finalized_at
      ) return null;
      row.status = "confirmed";
      row.auth_cleanup_status = "pending";
      row.failure_stage = null;
      row.failure_reason_code = null;
      row.auth_verification_attempt_count += 1;
      row.auth_verification_result = null;
      row.auth_verification_result_attempt_count = null;
      return clone(row);
    },
    async recordVerificationResult(input) {
      calls.recordVerification += 1;
      if (
        input.deletionRequestId !== row.id ||
        input.expectedTargetUserId !== row.auth_delete_target_user_id ||
        input.expectedVerificationAttemptCount !== row.auth_verification_attempt_count ||
        row.auth_verification_result !== null ||
        row.auth_verification_result_attempt_count !== null
      ) return null;
      const manual = (reason: string) => {
        row.status = "auth_cleanup_failed";
        row.auth_cleanup_status = "manual_required";
        row.failure_stage = "auth_cleanup";
        row.failure_reason_code = reason;
      };
      const failed = (reason: string) => {
        row.status = "auth_cleanup_failed";
        row.auth_cleanup_status = "failed";
        row.failure_stage = "auth_cleanup";
        row.failure_reason_code = reason;
      };
      const result = input.result as AccountDeletionAuthVerificationResult;
      const currentResult: AccountDeletionAuthCurrentVerificationResult = result === "verified_absent"
        ? "absent"
        : result === "present"
          ? "present"
          : "unknown";
      row.auth_verification_result = currentResult;
      row.auth_verification_result_attempt_count = input.expectedVerificationAttemptCount;
      if (result === "verified_absent") {
        row.auth_verified_absent_at = NOW;
        if (row.user_id === null) {
          row.status = "confirmed";
          row.auth_cleanup_status = "pending";
          row.failure_stage = null;
          row.failure_reason_code = null;
        } else manual("auth_owner_not_null_after_verified_absence");
      } else if (result === "present" && row.auth_delete_generation === 0) {
        row.status = "confirmed";
        row.auth_cleanup_status = "pending";
        row.failure_stage = null;
        row.failure_reason_code = null;
      } else if (result === "present") {
        manual("auth_user_present_after_dispatch_manual_required");
      } else if (["permission_denied", "malformed", "mismatched_user"].includes(result)) {
        manual(result === "permission_denied"
          ? "auth_get_permission_denied"
          : result === "mismatched_user"
            ? "auth_get_user_mismatch"
            : "auth_get_protocol_error");
      } else {
        failed(result === "rate_limited"
          ? "auth_get_rate_limited"
          : result === "timeout"
            ? "auth_get_timeout"
            : result === "network_error"
              ? "auth_get_network_error"
              : "auth_get_unavailable");
      }
      return clone(row);
    },
    async authorizeDeleteDispatch(input) {
      calls.authorize += 1;
      if (
        input.deletionRequestId !== row.id ||
        input.expectedTargetUserId !== row.auth_delete_target_user_id ||
        input.expectedVerificationAttemptCount !== row.auth_verification_attempt_count ||
        row.auth_verification_result_attempt_count !== input.expectedVerificationAttemptCount ||
        row.auth_verification_result !== "present" ||
        row.auth_delete_generation !== 0 || row.auth_cleanup_status !== "pending"
      ) return null;
      row.auth_delete_generation = 1;
      row.auth_verification_result = null;
      row.auth_verification_result_attempt_count = null;
      return clone(row);
    },
    async recordDispatchOutcome(input) {
      calls.dispatchOutcome += 1;
      if (input.deletionRequestId !== row.id || input.expectedTargetUserId !== row.auth_delete_target_user_id) return null;
      const outcome = input.result as AccountDeletionAuthDispatchOutcome;
      const manual = outcome === "permission_denied";
      row.status = "auth_cleanup_failed";
      row.auth_cleanup_status = manual ? "manual_required" : "failed";
      row.failure_stage = "auth_cleanup";
      row.failure_reason_code = outcome === "permission_denied"
        ? "auth_delete_permission_denied"
        : outcome === "rate_limited"
          ? "auth_delete_rate_limited_outcome_unknown"
          : outcome === "timeout"
            ? "auth_delete_timeout_outcome_unknown"
            : outcome === "network_error"
              ? "auth_delete_network_error_outcome_unknown"
              : outcome === "malformed"
                ? "auth_delete_malformed_outcome_unknown"
                : "auth_delete_unavailable_outcome_unknown";
      return clone(row);
    },
    async finalizeAuthStage(input) {
      calls.finalize += 1;
      if (
        input.deletionRequestId !== row.id || row.user_id !== null ||
        row.auth_delete_generation !== input.expectedDeleteGeneration ||
        row.auth_verification_attempt_count !== input.expectedVerificationAttemptCount ||
        row.auth_verification_result !== "absent" ||
        row.auth_verification_result_attempt_count !== input.expectedVerificationAttemptCount ||
        !row.auth_verified_absent_at || row.auth_cleanup_status !== "pending"
      ) return null;
      row.status = "confirmed";
      row.auth_cleanup_status = input.expectedDeleteGeneration === 0 ? "not_needed" : "succeeded";
      row.auth_delete_target_user_id = null;
      row.auth_verification_result = null;
      row.auth_verification_result_attempt_count = null;
      row.auth_sub_finalized_at = NOW;
      row.failure_stage = null;
      row.failure_reason_code = null;
      return clone(row);
    }
  };

  return {
    repository,
    calls,
    row: () => clone(row),
    setOwnerNull: () => { row.user_id = null; },
    replace: (next: AccountDeletionAuthRequestRow) => { row = clone(next); }
  };
}

function fakeAdapter(input: {
  gets: AccountDeletionAuthGetResult[];
  deletion?: AccountDeletionAuthDeleteResult | "response_loss";
  onDelete?: () => void;
}) {
  const calls = { gets: 0, deletes: 0, order: [] as Array<"GET" | "DELETE"> };
  const adapter: AccountDeletionAuthAdapter = {
    async getUserById() {
      calls.order.push("GET");
      const next = input.gets[calls.gets] ?? input.gets.at(-1) ?? { kind: "unavailable" as const };
      calls.gets += 1;
      return next;
    },
    async deleteUser() {
      calls.order.push("DELETE");
      calls.deletes += 1;
      input.onDelete?.();
      if (input.deletion === "response_loss") throw new Error("hidden response loss");
      return input.deletion ?? { kind: "observed" };
    }
  };
  return { adapter, calls };
}

describe("G5D-2M strict Auth SDK adapter contract", () => {
  it("accepts only exact 404/user_not_found plus null as absence and exact 200 identity as present", () => {
    expect(classifyAccountDeletionAuthGetResponse(USER_A, {
      data: { user: null }, error: { status: 404, code: "user_not_found" }
    })).toEqual({ kind: "verified_absent" });
    expect(classifyAccountDeletionAuthGetResponse(USER_A, {
      data: { user: null }, error: null
    })).toEqual({ kind: "malformed" });
    expect(classifyAccountDeletionAuthGetResponse(USER_A, {
      data: { user: null }, error: { status: 500, code: "user_not_found" }
    })).toEqual({ kind: "unavailable" });
    expect(classifyAccountDeletionAuthGetResponse(USER_A, {
      data: { user: null }, error: { status: 404, code: "other" }
    })).toEqual({ kind: "malformed" });
    expect(classifyAccountDeletionAuthGetResponse(USER_A, {
      data: { user: null }, error: { status: "404", code: "user_not_found" }
    })).toEqual({ kind: "malformed" });
    expect(classifyAccountDeletionAuthGetResponse(USER_A, {
      data: { user: { id: USER_A } }, error: null
    })).toEqual({ kind: "present" });
    expect(classifyAccountDeletionAuthGetResponse(USER_A, {
      data: { user: { id: USER_B } }, error: null
    })).toEqual({ kind: "mismatched_user" });
    expect(classifyAccountDeletionAuthGetResponse(USER_A, {
      data: { user: { id: USER_A } }, error: { status: 403, code: "forbidden" }
    })).toEqual({ kind: "permission_denied" });
    expect(classifyAccountDeletionAuthGetResponse(USER_A, {
      data: { user: null }, error: { status: 429, code: "rate_limited" }
    })).toEqual({ kind: "rate_limited" });
  });

  it("never treats a DELETE response as terminal evidence", () => {
    expect(classifyAccountDeletionAuthDeleteResponse(USER_A, {
      data: { user: { id: USER_A } }, error: null
    })).toEqual({ kind: "observed" });
    expect(classifyAccountDeletionAuthDeleteResponse(USER_A, {
      data: { user: null }, error: { status: 404, code: "user_not_found" }
    })).toEqual({ kind: "not_found" });
    expect(classifyAccountDeletionAuthDeleteResponse(USER_A, {
      data: { user: null }, error: { status: 403, code: "forbidden" }
    })).toEqual({ kind: "permission_denied" });
    expect(classifyAccountDeletionAuthDeleteResponse(USER_A, {
      data: { user: null }, error: { status: 503, code: "unavailable" }
    })).toEqual({ kind: "unavailable" });
    expect(classifyAccountDeletionAuthDeleteResponse(USER_A, {
      data: { user: { id: USER_B } }, error: null
    })).toEqual({ kind: "malformed" });

    const rogueMarker = "DELETE_MALFORMED_SQLSTATE_XX999_FAKE_SECRET";
    const classified = classifyAccountDeletionAuthDeleteResponse(USER_A, {
      data: { impossible: true },
      detail: rogueMarker,
      error: null
    });
    expect(classified).toEqual({ kind: "malformed" });
    expect(JSON.stringify(classified)).not.toContain(rogueMarker);
  });
});

describe("G5D-2M durable Auth one-step runner", () => {
  it.each([
    ["provider", { provider_cleanup_status: "pending", provider_sub_finalized_at: null }],
    ["storage", { storage_cleanup_status: "pending", storage_sub_finalized_at: null }],
    ["database", { db_cleanup_status: "pending", db_sub_finalized_at: null }]
  ] as const)("blocks %s nonterminal before intent or DELETE", async (_label, overrides) => {
    const store = fakeRepository(requestFixture(overrides));
    const auth = fakeAdapter({ gets: [{ kind: "present" }] });
    const result = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: store.repository, authAdapter: auth.adapter }
    );
    expect(result.status).toBe("blocked");
    expect(store.calls.seal).toBe(0);
    expect(auth.calls.gets).toBe(0);
    expect(auth.calls.deletes).toBe(0);
  });

  it("seals the persisted owner, rejects caller substitution, and is idempotent", async () => {
    const mismatch = fakeRepository(requestFixture());
    const auth = fakeAdapter({ gets: [{ kind: "present" }] });
    const blocked = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_B },
      { repository: mismatch.repository, authAdapter: auth.adapter }
    );
    expect(blocked.safeReasonCode).toBe("auth_intent_owner_mismatch");
    expect(mismatch.calls.seal).toBe(0);

    const store = fakeRepository(requestFixture());
    await store.repository.sealAuthIntent({
      deletionRequestId: REQUEST_A,
      expectedUserId: USER_A,
      intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION
    });
    const replay = await store.repository.sealAuthIntent({
      deletionRequestId: REQUEST_A,
      expectedUserId: USER_A,
      intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION
    });
    expect(replay?.auth_delete_target_user_id).toBe(USER_A);
    expect(replay?.auth_delete_generation).toBe(0);
    expect(store.calls.seal).toBe(2);

    const ownerNull = fakeRepository(requestFixture({ user_id: null }));
    const nullResult = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A },
      { repository: ownerNull.repository, authAdapter: auth.adapter }
    );
    expect(nullResult.safeReasonCode).toBe("auth_intent_owner_unavailable");
    expect(ownerNull.calls.seal).toBe(0);
  });

  it.each([
    ["unavailable", "failed"],
    ["network_error", "failed"],
    ["timeout", "failed"],
    ["malformed", "manual_required"],
    ["mismatched_user", "manual_required"],
    ["permission_denied", "manual_required"],
    ["rate_limited", "failed"]
  ] as const)("GET %s never dispatches DELETE", async (kind, expectedStatus) => {
    const store = fakeRepository(sealedFixture());
    const auth = fakeAdapter({ gets: [{ kind }] as AccountDeletionAuthGetResult[] });
    const result = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: store.repository, authAdapter: auth.adapter }
    );
    expect(result.status).toBe(expectedStatus);
    expect(result.safeCounts.authGetCalls).toBe(1);
    expect(result.safeCounts.authDeleteDispatches).toBe(0);
    expect(auth.calls.deletes).toBe(0);
    expect(store.row().auth_verification_attempt_count).toBe(1);
  });

  it("exact initial absence is not_needed only with retained owner-null authority", async () => {
    const store = fakeRepository(sealedFixture({ user_id: null }));
    const auth = fakeAdapter({ gets: [{ kind: "verified_absent" }] });
    const result = await runAccountDeletionAuthDurableStep(
      { requestRef: "adr_11111111111111111111111111111111" },
      { repository: store.repository, authAdapter: auth.adapter }
    );
    expect(result.status).toBe("not_needed");
    expect(result.safeProgress).toMatchObject({ terminal: true, verifiedAbsent: true, authSubFinalized: true });
    expect(result.safeCounts).toMatchObject({ authGetCalls: 1, authDeleteDispatches: 0, completionCalls: 0 });
    expect(store.row()).toMatchObject({
      user_id: null,
      auth_cleanup_status: "not_needed",
      auth_delete_generation: 0,
      auth_delete_target_user_id: null
    });
  });

  it("owner-nonnull exact absence fails closed and retains the target", async () => {
    const store = fakeRepository(sealedFixture());
    const auth = fakeAdapter({ gets: [{ kind: "verified_absent" }] });
    const result = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: store.repository, authAdapter: auth.adapter }
    );
    expect(result.status).toBe("manual_required");
    expect(store.row()).toMatchObject({
      user_id: USER_A,
      auth_delete_target_user_id: USER_A,
      auth_sub_finalized_at: null
    });
    expect(auth.calls.deletes).toBe(0);
  });

  it.each(["observed", "not_found"] as const)("DELETE %s still requires a second GET", async (deleteKind) => {
    const store = fakeRepository(requestFixture());
    const auth = fakeAdapter({
      gets: [{ kind: "present" }, { kind: "verified_absent" }],
      deletion: { kind: deleteKind },
      onDelete: store.setOwnerNull
    });
    const result = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: store.repository, authAdapter: auth.adapter }
    );
    expect(result.status).toBe("succeeded");
    expect(result.safeCounts).toMatchObject({
      authGetCalls: 2,
      authDeleteDispatches: 1,
      authAttempted: 1,
      destructiveOperationsAttempted: 1,
      completionCalls: 0
    });
    expect(auth.calls.deletes).toBe(1);
    expect(store.row()).toMatchObject({
      user_id: null,
      auth_cleanup_status: "succeeded",
      auth_delete_generation: 1,
      auth_delete_target_user_id: null,
      status: "confirmed"
    });
  });

  it.each([
    ["permission_denied", "manual_required"],
    ["rate_limited", "failed"],
    ["unavailable", "failed"],
    ["network_error", "failed"],
    ["timeout", "failed"],
    ["malformed", "failed"]
  ] as const)("maps DELETE %s without a verification shortcut", async (kind, expectedStatus) => {
    const store = fakeRepository(requestFixture());
    const auth = fakeAdapter({ gets: [{ kind: "present" }], deletion: { kind } as AccountDeletionAuthDeleteResult });
    const result = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: store.repository, authAdapter: auth.adapter }
    );
    expect(result.status).toBe(expectedStatus);
    expect(result.safeCounts).toMatchObject({ authGetCalls: 1, authDeleteDispatches: 1, authAttempted: 1 });
    expect(store.row()).toMatchObject({ auth_delete_generation: 1, auth_sub_finalized_at: null });
    if (kind === "malformed") {
      expect(result.safeProgress.marker).toBe("retry_later");
      expect(result.safeReasonCode).toBe("auth_delete_malformed_outcome_unknown");
    }
  });

  it("keeps malformed DELETE recoverable and resolves only through the next GET-first invocation", async () => {
    const absentStore = fakeRepository(requestFixture());
    const malformedAfterDelete = fakeAdapter({
      gets: [{ kind: "present" }],
      deletion: { kind: "malformed" },
      onDelete: absentStore.setOwnerNull
    });
    const unknown = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: absentStore.repository, authAdapter: malformedAfterDelete.adapter }
    );
    expect(unknown).toMatchObject({
      status: "failed",
      safeReasonCode: "auth_delete_malformed_outcome_unknown",
      safeProgress: { marker: "retry_later", terminal: false },
      safeCounts: { authGetCalls: 1, authDeleteDispatches: 1, completionCalls: 0 }
    });
    expect(malformedAfterDelete.calls.order).toEqual(["GET", "DELETE"]);
    expect(absentStore.row()).toMatchObject({
      auth_cleanup_status: "failed",
      auth_delete_generation: 1,
      auth_delete_target_user_id: USER_A,
      auth_sub_finalized_at: null
    });

    const absentRecovery = fakeAdapter({ gets: [{ kind: "verified_absent" }] });
    const recovered = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A },
      { repository: absentStore.repository, authAdapter: absentRecovery.adapter }
    );
    expect(recovered.status).toBe("succeeded");
    expect(recovered.safeCounts.authDeleteDispatches).toBe(0);
    expect(absentRecovery.calls.order).toEqual(["GET"]);

    const presentStore = fakeRepository(requestFixture());
    const secondMalformed = fakeAdapter({ gets: [{ kind: "present" }], deletion: { kind: "malformed" } });
    await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: presentStore.repository, authAdapter: secondMalformed.adapter }
    );
    const presentRecovery = fakeAdapter({ gets: [{ kind: "present" }] });
    const manual = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: presentStore.repository, authAdapter: presentRecovery.adapter }
    );
    expect(manual).toMatchObject({
      status: "manual_required",
      safeReasonCode: "auth_user_present_after_dispatch_manual_required",
      safeProgress: { marker: "manual_required", terminal: false },
      safeCounts: { authGetCalls: 1, authDeleteDispatches: 0 }
    });
    expect(presentRecovery.calls.order).toEqual(["GET"]);
  });

  it("persists generation 1 through response loss and recovers absent GET-first without redispatch", async () => {
    const store = fakeRepository(requestFixture());
    const firstAuth = fakeAdapter({
      gets: [{ kind: "present" }],
      deletion: "response_loss",
      onDelete: store.setOwnerNull
    });
    const first = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: store.repository, authAdapter: firstAuth.adapter }
    );
    expect(first.status).toBe("failed");
    expect(first.safeCounts.authDeleteDispatches).toBe(1);
    expect(store.row()).toMatchObject({
      auth_delete_generation: 1,
      auth_delete_target_user_id: USER_A,
      auth_verification_result: null,
      auth_verification_result_attempt_count: null,
      auth_sub_finalized_at: null
    });

    const recoveryAuth = fakeAdapter({ gets: [{ kind: "verified_absent" }] });
    const recovered = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A },
      { repository: store.repository, authAdapter: recoveryAuth.adapter }
    );
    expect(recovered.status).toBe("succeeded");
    expect(recovered.safeCounts).toMatchObject({ authGetCalls: 1, authDeleteDispatches: 0, authAttempted: 0 });
    expect(recoveryAuth.calls.deletes).toBe(0);
    expect(store.row().auth_verification_attempt_count).toBe(2);
  });

  it("generation 1 plus present is sticky manual and never redispatches", async () => {
    const store = fakeRepository(sealedFixture({
      auth_delete_generation: 1,
      auth_verification_attempt_count: 1,
      status: "auth_cleanup_failed",
      auth_cleanup_status: "failed",
      failure_stage: "auth_cleanup",
      failure_reason_code: "auth_delete_network_error_outcome_unknown"
    }));
    const auth = fakeAdapter({ gets: [{ kind: "present" }] });
    const result = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: store.repository, authAdapter: auth.adapter }
    );
    expect(result.status).toBe("manual_required");
    expect(result.safeCounts.authDeleteDispatches).toBe(0);
    expect(auth.calls.deletes).toBe(0);

    const replay = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: store.repository, authAdapter: auth.adapter }
    );
    expect(replay.status).toBe("manual_required");
    expect(auth.calls.gets).toBe(1);
    expect(auth.calls.deletes).toBe(0);
  });

  it("binds dispatch to the exact persisted current-attempt PRESENT result and consumes it", async () => {
    const dispatchInput = (expectedVerificationAttemptCount: number) => ({
      deletionRequestId: REQUEST_A,
      expectedTargetUserId: USER_A,
      intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
      expectedVerificationAttemptCount
    } as const);

    const noResult = fakeRepository(sealedFixture());
    await noResult.repository.beginVerificationAttempt({
      ...dispatchInput(0),
      expectedVerificationAttemptCount: 0
    });
    expect(await noResult.repository.authorizeDeleteDispatch(dispatchInput(1))).toBeNull();
    expect(noResult.row()).toMatchObject({
      auth_delete_generation: 0,
      auth_verification_attempt_count: 1,
      auth_verification_result: null,
      auth_verification_result_attempt_count: null
    });

    const unknown = fakeRepository(sealedFixture());
    await unknown.repository.beginVerificationAttempt({
      ...dispatchInput(0),
      expectedVerificationAttemptCount: 0
    });
    await unknown.repository.recordVerificationResult({
      ...dispatchInput(1),
      result: "network_error"
    });
    expect(await unknown.repository.authorizeDeleteDispatch(dispatchInput(1))).toBeNull();
    expect(unknown.row()).toMatchObject({ auth_delete_generation: 0, auth_verification_result: "unknown" });

    const absent = fakeRepository(sealedFixture({ user_id: null }));
    await absent.repository.beginVerificationAttempt({
      ...dispatchInput(0),
      expectedVerificationAttemptCount: 0
    });
    await absent.repository.recordVerificationResult({
      ...dispatchInput(1),
      result: "verified_absent"
    });
    expect(await absent.repository.authorizeDeleteDispatch(dispatchInput(1))).toBeNull();
    expect(absent.row()).toMatchObject({ auth_delete_generation: 0, auth_verification_result: "absent" });

    const stale = fakeRepository(sealedFixture());
    await stale.repository.beginVerificationAttempt({
      ...dispatchInput(0),
      expectedVerificationAttemptCount: 0
    });
    await stale.repository.recordVerificationResult({
      ...dispatchInput(1),
      result: "present"
    });
    await stale.repository.beginVerificationAttempt(dispatchInput(1));
    expect(await stale.repository.authorizeDeleteDispatch(dispatchInput(1))).toBeNull();
    expect(stale.row()).toMatchObject({
      auth_delete_generation: 0,
      auth_verification_attempt_count: 2,
      auth_verification_result: null,
      auth_verification_result_attempt_count: null
    });

    await stale.repository.recordVerificationResult({
      ...dispatchInput(2),
      result: "present"
    });
    const winner = await stale.repository.authorizeDeleteDispatch(dispatchInput(2));
    expect(winner).toMatchObject({
      auth_delete_generation: 1,
      auth_verification_result: null,
      auth_verification_result_attempt_count: null
    });
    expect(await stale.repository.authorizeDeleteDispatch(dispatchInput(2))).toBeNull();
  });

  it("CAS authorizes exactly once and a stale concurrent loser cannot DELETE", async () => {
    const store = fakeRepository(sealedFixture({
      auth_verification_attempt_count: 1,
      auth_verification_result: "present",
      auth_verification_result_attempt_count: 1
    }));
    const input = {
      deletionRequestId: REQUEST_A,
      expectedTargetUserId: USER_A,
      intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
      expectedVerificationAttemptCount: 1
    } as const;
    const [first, second] = await Promise.all([
      store.repository.authorizeDeleteDispatch(input),
      store.repository.authorizeDeleteDispatch(input)
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(store.row().auth_delete_generation).toBe(1);
  });

  it("post-owner-null lookup is request-authority based, terminal replay never restores target, and User B is isolated", async () => {
    const terminal = sealedFixture({
      user_id: null,
      auth_delete_generation: 1,
      auth_verification_attempt_count: 2,
      auth_verified_absent_at: NOW,
      auth_sub_finalized_at: NOW,
      auth_delete_target_user_id: null,
      auth_cleanup_status: "succeeded"
    });
    const store = fakeRepository(terminal);
    const auth = fakeAdapter({ gets: [{ kind: "present" }] });
    const replay = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A },
      { repository: store.repository, authAdapter: auth.adapter }
    );
    expect(replay.status).toBe("succeeded");
    expect(replay.safeCounts).toMatchObject({ authGetCalls: 0, authDeleteDispatches: 0, completionCalls: 0 });
    expect(store.row().auth_delete_target_user_id).toBeNull();

    const crossUser = await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_B, expectedUserId: USER_B },
      { repository: store.repository, authAdapter: auth.adapter }
    );
    expect(crossUser.safeReasonCode).toBe("auth_request_not_found");
    expect(auth.calls.gets).toBe(0);
    expect(auth.calls.deletes).toBe(0);
  });

  it("safe output never contains target, raw Auth payload, or request authority", async () => {
    const store = fakeRepository(sealedFixture());
    const auth = fakeAdapter({ gets: [{ kind: "mismatched_user" }] });
    const output = JSON.stringify(await runAccountDeletionAuthDurableStep(
      { requestRef: REQUEST_A, expectedUserId: USER_A },
      { repository: store.repository, authAdapter: auth.adapter }
    ));
    expect(output).not.toContain(USER_A);
    expect(output).not.toContain(USER_B);
    expect(output).not.toContain(REQUEST_A);
    expect(output).not.toContain("email");
    expect(output).not.toContain("identities");
    expect(output).not.toContain("token");
  });

  it("replaces a rogue persisted failure reason with one fixed safe fallback and leaks no marker", async () => {
    const rogueReason = [
      "ROGUE_REASON_MARKER",
      "deadbeef-dead-4eef-8eed-deadbeefdead",
      "SQLSTATE_XX999_DETAIL_MARKER",
      "FAKE_SECRET_TOKEN_MARKER"
    ].join("__");
    const store = fakeRepository(sealedFixture({
      status: "auth_cleanup_failed",
      auth_cleanup_status: "manual_required",
      failure_stage: "auth_cleanup",
      failure_reason_code: rogueReason
    }));
    const auth = fakeAdapter({ gets: [{ kind: "present" }] });
    const capturedLogs: unknown[] = [];
    const spies = (["log", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { capturedLogs.push(args); })
    );

    try {
      const output = await runAccountDeletionAuthDurableStep(
        { requestRef: REQUEST_A, expectedUserId: USER_A },
        { repository: store.repository, authAdapter: auth.adapter }
      );
      expect(output.safeReasonCode).toBe("auth_stage_reason_unknown");
      expect(output.status).toBe("manual_required");
      expect(auth.calls.order).toEqual([]);

      const serializedSafeSurface = JSON.stringify({ output, capturedLogs });
      for (const marker of [
        rogueReason,
        "ROGUE_REASON_MARKER",
        "deadbeef-dead-4eef-8eed-deadbeefdead",
        "SQLSTATE_XX999_DETAIL_MARKER",
        "FAKE_SECRET_TOKEN_MARKER"
      ]) {
        expect(serializedSafeSurface).not.toContain(marker);
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("G5D-2M server-only durable Auth repository", () => {
  it("continues by exact UUID/opaque authority after owner-null and uses only focused RPCs", async () => {
    const row = sealedFixture({ user_id: null });
    const eq = vi.fn();
    const query = {
      select: vi.fn(),
      eq,
      limit: vi.fn(async () => ({ data: [row], error: null }))
    };
    query.select.mockReturnValue(query);
    eq.mockReturnValue(query);
    const rpc = vi.fn(async () => ({ data: row, error: null }));
    const client = { from: vi.fn(() => query), rpc };
    const repository = createAccountDeletionAuthDurableRepository(client as never);

    expect(await repository.getRequestByAuthority(REQUEST_A)).toMatchObject({ id: REQUEST_A, user_id: null });
    expect(eq).toHaveBeenCalledWith("id", REQUEST_A);
    expect(eq).not.toHaveBeenCalledWith("user_id", expect.anything());

    eq.mockClear();
    expect(await repository.getRequestByAuthority(row.anonymized_user_ref)).toMatchObject({ id: REQUEST_A });
    expect(eq).toHaveBeenCalledWith("anonymized_user_ref", row.anonymized_user_ref);

    await repository.authorizeDeleteDispatch({
      deletionRequestId: REQUEST_A,
      expectedTargetUserId: USER_A,
      intentVersion: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
      expectedVerificationAttemptCount: 1
    });
    expect(rpc).toHaveBeenCalledWith("authorize_account_deletion_auth_delete_dispatch", {
      p_deletion_request_id: REQUEST_A,
      p_expected_target_user_id: USER_A,
      p_auth_intent_version: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
      p_expected_verification_attempt_count: 1
    });
  });
});

describe("G5D-2M migration and boundary contract", () => {
  it("pins the exact remediated 0026 migration bytes", () => {
    const bytes = readFileSync(migrationPath);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_MIGRATION_SHA256);
  });

  it("defines one no-FK target, exact state shapes, focused ACL, owner-null finalizer, and no completion", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("g5d-2m.auth-delete.v1");
    expect(sql.match(/g5d-2m\.auth-delete\.v1/g)?.length).toBeGreaterThan(8);
    expect(sql).toContain("add column if not exists auth_delete_target_user_id uuid");
    expect(sql).toContain("add column if not exists auth_verification_result text");
    expect(sql).toContain("add column if not exists auth_verification_result_attempt_count integer");
    expect(sql).not.toMatch(/auth_delete_target_user_id[^;]*references auth\.users/s);
    expect(sql).toContain("auth_delete_generation in (0, 1)");
    expect(sql).toContain("auth_verification_result in ('present', 'absent', 'unknown')");
    expect(sql).toContain("auth_verification_result_attempt_count = auth_verification_attempt_count");
    expect(sql).toContain("old.auth_delete_generation = 0 and new.auth_delete_generation = 1");
    expect(sql).toMatch(/where id = p_deletion_request_id\s+and auth_delete_generation = 0/);
    expect(sql).toMatch(/auth_verification_result_attempt_count is distinct from p_expected_verification_attempt_count\s+or v_request\.auth_verification_result is distinct from 'present'/);
    expect(sql).toMatch(/set auth_delete_generation = 1,\s+auth_verification_result = null,\s+auth_verification_result_attempt_count = null/);
    expect(sql).toContain("when 'malformed' then 'auth_delete_malformed_outcome_unknown'");
    expect(sql).toContain("v_manual := p_result = 'permission_denied'");
    expect(sql).toContain("v_request.user_id is not null");
    expect(sql).toContain("auth_delete_target_user_id = null");
    expect(sql).toContain("auth_sub_finalized_at = v_now");
    expect(sql).not.toContain("status = 'completed'");
    expect(sql).not.toContain("completed_at =");
    expect(sql).not.toContain("expires_at =");
    expect(sql).not.toContain("current_setting(");
    expect(sql).not.toContain("set_config(");
    expect(sql).toContain("account_deletion_auth_prior_stages_terminal(v_request) is not true");
    expect(sql).toMatch(/select coalesce\(\([\s\S]*p_request\.metadata = '\{\}'::jsonb[\s\S]*\), false\);/);
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("grant execute on function public.finalize_account_deletion_auth_stage");
    expect(sql).toContain("revoke select on table public.account_deletion_requests from public, anon, authenticated");
    expect(sql).toContain("grant select on table public.account_deletion_requests to service_role");
  });

  it("keeps the manual generated DB surface aligned with all 0026 columns and RPCs", () => {
    const types = readFileSync(databaseTypesPath, "utf8");
    for (const field of [
      "auth_intent_version",
      "auth_delete_target_user_id",
      "auth_delete_generation",
      "auth_delete_requested_at",
      "auth_verification_attempt_count",
      "auth_verification_result",
      "auth_verification_result_attempt_count",
      "auth_verified_absent_at",
      "auth_sub_finalized_at"
    ]) {
      expect(types).toContain(`${field}:`);
    }
    for (const rpc of [
      "seal_account_deletion_auth_intent",
      "begin_account_deletion_auth_verification_attempt",
      "record_account_deletion_auth_verification_result",
      "authorize_account_deletion_auth_delete_dispatch",
      "record_account_deletion_auth_dispatch_outcome",
      "finalize_account_deletion_auth_stage"
    ]) {
      expect(types).toContain(`${rpc}:`);
    }
  });
});
