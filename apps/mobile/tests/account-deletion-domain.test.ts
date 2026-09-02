import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAccountDeletionRequest } from "../../../services/account-deletion";
import type { Database, AccountDeletionRequestStatus } from "../../../types/database";

const USER_A = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseServiceRoleKey: () => "service-role-test-key"
}));

type AccountDeletionRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];

function accountDeletionRow(status: AccountDeletionRequestStatus): AccountDeletionRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    user_id: USER_A,
    anonymized_user_ref: "adr_safe_fixture",
    request_source: "in_app",
    status,
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
    db_inventory_version: "g5d-2h.account-db.v1",
    db_observed_row_count: 0,
    db_deleted_row_count: 0,
    db_anonymized_row_count: 0,
    db_retained_row_count: 0,
    db_sub_finalized_at: null,
    auth_cleanup_status: "pending",
    notification_status: "pending",
    retry_count: 0,
    requested_at: "2026-08-22T00:00:00.000Z",
    confirmed_at: null,
    processing_started_at: null,
    completed_at: null,
    cancelled_at: null,
    expires_at: null,
    last_attempted_at: null,
    metadata: {},
    created_at: "2026-08-22T00:00:00.000Z",
    updated_at: "2026-08-22T00:00:00.000Z"
  };
}

function arrangeDomainClient(latestRequest: AccountDeletionRow | null) {
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data: accountDeletionRow("requested"), error: null }))
    }))
  }));
  const activeQuery = {
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn()
  };
  activeQuery.eq.mockReturnValue(activeQuery);
  let requestedStatuses: AccountDeletionRequestStatus[] = [];
  activeQuery.in.mockImplementation((_column: string, statuses: AccountDeletionRequestStatus[]) => {
    requestedStatuses = statuses;
    return activeQuery;
  });
  activeQuery.order.mockReturnValue(activeQuery);
  activeQuery.limit.mockReturnValue(activeQuery);
  activeQuery.maybeSingle.mockImplementation(async () => ({
    data: latestRequest && requestedStatuses.includes(latestRequest.status) ? latestRequest : null,
    error: null
  }));
  const admin = {
    from: vi.fn(() => ({
      select: vi.fn(() => activeQuery),
      insert
    }))
  };

  vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
  return { activeQuery, insert };
}

function arrangeInsertRaceClient(insertError: { code: string; message: string }) {
  const racedRequest = {
    ...accountDeletionRow("requested"),
    id: "44444444-4444-4444-8444-444444444444"
  };
  const foreignRequest = {
    ...accountDeletionRow("requested"),
    id: "55555555-5555-4555-8555-555555555555",
    user_id: "22222222-2222-4222-822222222222"
  };
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data: null, error: insertError }))
    }))
  }));
  const activeQuery = {
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn()
  };
  let queriedUserId: string | null = null;
  let requestedStatuses: AccountDeletionRequestStatus[] = [];
  let lookupCount = 0;

  activeQuery.eq.mockImplementation((column: string, value: string) => {
    if (column === "user_id") {
      queriedUserId = value;
    }

    return activeQuery;
  });
  activeQuery.in.mockImplementation((_column: string, statuses: AccountDeletionRequestStatus[]) => {
    requestedStatuses = statuses;
    return activeQuery;
  });
  activeQuery.order.mockReturnValue(activeQuery);
  activeQuery.limit.mockReturnValue(activeQuery);
  activeQuery.maybeSingle.mockImplementation(async () => {
    const rows = lookupCount++ === 0 ? [foreignRequest] : [foreignRequest, racedRequest];
    const canonicalRequest = rows.find(
      (row) => row.user_id === queriedUserId && requestedStatuses.includes(row.status)
    ) ?? null;

    return { data: canonicalRequest, error: null };
  });
  const admin = {
    from: vi.fn(() => ({
      select: vi.fn(() => activeQuery),
      insert
    }))
  };

  vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
  return { activeQuery, insert, racedRequest };
}

describe("canonical account-deletion request semantics", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseAdminClient).mockReset();
  });

  it.each(["cancelled", "expired"] as const)("creates a new request when the latest canonical request is %s", async (terminalStatus) => {
    const { activeQuery, insert } = arrangeDomainClient(accountDeletionRow(terminalStatus));

    const result = await createAccountDeletionRequest(USER_A);

    expect(activeQuery.in).toHaveBeenCalledWith(
      "status",
      expect.not.arrayContaining([terminalStatus])
    );
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_A,
      status: "requested"
    }));
    expect(result).toMatchObject({
      created: true,
      deletionRequest: { status: "requested" }
    });
  });

  it("reuses an active canonical request instead of creating a duplicate", async () => {
    const { insert } = arrangeDomainClient(accountDeletionRow("requested"));

    const result = await createAccountDeletionRequest(USER_A);

    expect(insert).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      created: false,
      deletionRequest: { status: "requested" }
    });
  });

  it("re-fetches and reuses User A's canonical active request after an insert 23505 race", async () => {
    const { activeQuery, insert, racedRequest } = arrangeInsertRaceClient({
      code: "23505",
      message: "duplicate key value violates unique constraint"
    });

    const result = await createAccountDeletionRequest(USER_A);

    expect(activeQuery.maybeSingle).toHaveBeenCalledTimes(2);
    expect(activeQuery.eq).toHaveBeenNthCalledWith(1, "user_id", USER_A);
    expect(activeQuery.eq).toHaveBeenNthCalledWith(2, "user_id", USER_A);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      created: false,
      deletionRequest: {
        id: racedRequest.id,
        status: racedRequest.status,
        requestedAt: racedRequest.requested_at
      }
    });
  });

  it("preserves the safe failure behavior for a non-23505 insert error", async () => {
    const { activeQuery, insert } = arrangeInsertRaceClient({
      code: "23514",
      message: "check constraint violation"
    });

    await expect(createAccountDeletionRequest(USER_A)).rejects.toMatchObject({
      name: "AppError",
      status: 500,
      message: "削除リクエストの作成に失敗しました。"
    });

    expect(activeQuery.maybeSingle).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
