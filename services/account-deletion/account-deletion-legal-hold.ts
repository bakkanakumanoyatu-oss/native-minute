import type { Database } from "@/types/database";

type RequestRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
export type AccountDeletionLegalHoldState = Pick<RequestRow, "legal_hold_active" | "legal_hold_scope">;
export type AccountDeletionCanonicalStage = "provider" | "storage" | "database" | "auth" | "completion";

const SCOPES = ["database", "owner_linkage", "provider", "retained_audit", "storage"];
const BLOCKING_SCOPES: Record<AccountDeletionCanonicalStage, readonly string[]> = {
  provider: ["provider"],
  storage: ["storage"],
  database: ["provider", "storage", "database"],
  auth: ["provider", "storage", "database", "owner_linkage"],
  completion: ["provider", "storage", "database", "owner_linkage"]
};

/** Missing or malformed persisted hold authority fails closed. Mirrors migration 0028. */
export function accountDeletionLegalHoldBlocks(
  row: { legal_hold_active?: unknown; legal_hold_scope?: unknown },
  stage: AccountDeletionCanonicalStage
): boolean {
  if (row.legal_hold_active === false) return false;
  const scope = row.legal_hold_scope;
  if (row.legal_hold_active !== true || !Array.isArray(scope) || scope.length < 1 || scope.length > 5 ||
    scope.some((value, index) => typeof value !== "string" || !SCOPES.includes(value) ||
      (index > 0 && scope[index - 1] >= value))) return true;
  return scope.some(value => BLOCKING_SCOPES[stage].includes(value));
}

/** Read-only stage selection; execution still requires the existing canonical resolver/ceremony. */
export function selectAccountDeletionResumeStage(row: Pick<RequestRow,
  "status" | "legal_hold_active" | "legal_hold_scope" |
  "provider_cleanup_status" | "provider_sub_finalized_at" |
  "storage_cleanup_status" | "storage_sub_finalized_at" |
  "db_cleanup_status" | "db_sub_finalized_at" |
  "auth_cleanup_status" | "auth_sub_finalized_at"
>): AccountDeletionCanonicalStage | null {
  if (!["confirmed", "provider_cleanup_failed", "storage_cleanup_failed", "db_cleanup_failed", "auth_cleanup_failed"].includes(row.status)) return null;
  const stages = [
    ["provider", row.provider_cleanup_status, row.provider_sub_finalized_at],
    ["storage", row.storage_cleanup_status, row.storage_sub_finalized_at],
    ["database", row.db_cleanup_status, row.db_sub_finalized_at],
    ["auth", row.auth_cleanup_status, row.auth_sub_finalized_at]
  ] as const;
  for (const [stage, status, finalizedAt] of stages) {
    if (["succeeded", "not_needed"].includes(status) && finalizedAt) continue;
    if (!["pending", "failed"].includes(status) || finalizedAt || accountDeletionLegalHoldBlocks(row, stage)) return null;
    return stage;
  }
  return accountDeletionLegalHoldBlocks(row, "completion") ? null : "completion";
}
