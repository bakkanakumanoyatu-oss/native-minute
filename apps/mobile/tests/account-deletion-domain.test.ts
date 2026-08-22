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
    storage_cleanup_status: "pending",
    db_cleanup_status: "pending",
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
});
