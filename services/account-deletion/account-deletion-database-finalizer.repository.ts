import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";
import { ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION } from "./account-deletion-database-contract";

type RequestRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
type ServiceRoleClient = ReturnType<typeof createSupabaseAdminClient>;

export type AccountDeletionDatabaseOperatorRequestRow = Pick<
  RequestRow,
  | "id"
  | "user_id"
  | "anonymized_user_ref"
  | "status"
  | "failure_stage"
  | "failure_reason_code"
  | "provider_cleanup_status"
  | "provider_sub_finalized_at"
  | "storage_cleanup_status"
  | "storage_sub_finalized_at"
  | "db_cleanup_status"
  | "db_inventory_version"
  | "db_observed_row_count"
  | "db_deleted_row_count"
  | "db_anonymized_row_count"
  | "db_retained_row_count"
  | "db_sub_finalized_at"
  | "last_attempted_at"
> & { metadata: Json };

type DatabaseFinalizerEvidence = {
  status: "succeeded" | "not_needed";
  dbObservedRowCount: number;
  dbDeletedRowCount: number;
  dbAnonymizedRowCount: number;
  dbRetainedRowCount: number;
};

export type AccountDeletionDatabaseFinalizerResult =
  | (DatabaseFinalizerEvidence & {
      kind: "succeeded" | "not_needed";
      alreadyFinalized: false;
    })
  | (DatabaseFinalizerEvidence & {
      kind: "already_finalized";
      alreadyFinalized: true;
    })
  | { kind: "blocked" }
  | { kind: "unknown" };

export type AccountDeletionDatabaseFinalizerRepository = {
  getRequestForOwner(
    deletionRequestId: string,
    userId: string
  ): Promise<AccountDeletionDatabaseOperatorRequestRow | null>;
  finalizeDatabaseStage(input: {
    deletionRequestId: string;
    userId: string;
    inventoryVersion: typeof ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION;
  }): Promise<AccountDeletionDatabaseFinalizerResult>;
};

const REQUEST_SELECT = [
  "id",
  "user_id",
  "anonymized_user_ref",
  "status",
  "failure_stage",
  "failure_reason_code",
  "provider_cleanup_status",
  "provider_sub_finalized_at",
  "storage_cleanup_status",
  "storage_sub_finalized_at",
  "db_cleanup_status",
  "db_inventory_version",
  "db_observed_row_count",
  "db_deleted_row_count",
  "db_anonymized_row_count",
  "db_retained_row_count",
  "db_sub_finalized_at",
  "last_attempted_at",
  "metadata"
].join(",");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseFinalizerResult(value: unknown): AccountDeletionDatabaseFinalizerResult {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    return { kind: "unknown" };
  }

  const row = value[0];
  const status = row.db_cleanup_status;
  const safeReason = row.safe_reason;
  const alreadyFinalized = row.already_finalized;
  const counts = [
    row.db_observed_row_count,
    row.db_deleted_row_count,
    row.db_anonymized_row_count,
    row.db_retained_row_count
  ];

  if (
    (status !== "succeeded" && status !== "not_needed") ||
    typeof safeReason !== "string" ||
    typeof alreadyFinalized !== "boolean" ||
    !counts.every(isSafeCount)
  ) {
    return { kind: "unknown" };
  }

  if (
    (alreadyFinalized && safeReason !== "already_finalized") ||
    (!alreadyFinalized && safeReason !== "db_cleanup_finalized")
  ) {
    return { kind: "unknown" };
  }

  const evidence: DatabaseFinalizerEvidence = {
    status,
    dbObservedRowCount: row.db_observed_row_count as number,
    dbDeletedRowCount: row.db_deleted_row_count as number,
    dbAnonymizedRowCount: row.db_anonymized_row_count as number,
    dbRetainedRowCount: row.db_retained_row_count as number
  };

  return alreadyFinalized
    ? { kind: "already_finalized", alreadyFinalized: true, ...evidence }
    : { kind: status, alreadyFinalized: false, ...evidence };
}

export function createAccountDeletionDatabaseFinalizerRepository(
  client: ServiceRoleClient = createSupabaseAdminClient()
): AccountDeletionDatabaseFinalizerRepository {
  async function getRequestForOwner(deletionRequestId: string, userId: string) {
    const response = (await client
      .from("account_deletion_requests")
      .select(REQUEST_SELECT)
      .eq("id", deletionRequestId)
      .eq("user_id", userId)
      .limit(2)) as unknown as {
      data: AccountDeletionDatabaseOperatorRequestRow[] | null;
      error: unknown;
    };

    if (response.error) {
      throw new Error("account_deletion_database_request_lookup_failed");
    }

    return response.data?.length === 1 ? response.data[0] : null;
  }

  async function finalizeDatabaseStage(input: {
    deletionRequestId: string;
    userId: string;
    inventoryVersion: typeof ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION;
  }) {
    if (input.inventoryVersion !== ACCOUNT_DELETION_DATABASE_INVENTORY_VERSION) {
      return { kind: "unknown" } as const;
    }

    const response = (await client.rpc("finalize_account_deletion_database_stage", {
      p_deletion_request_id: input.deletionRequestId,
      p_expected_user_id: input.userId,
      p_expected_db_inventory_version: input.inventoryVersion
    })) as unknown as { data: unknown; error: unknown };

    if (response.error) {
      return { kind: "blocked" } as const;
    }

    return parseFinalizerResult(response.data);
  }

  return { getRequestForOwner, finalizeDatabaseStage };
}
