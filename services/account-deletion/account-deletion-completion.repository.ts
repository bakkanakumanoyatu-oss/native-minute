import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

type RequestRow = Database["public"]["Tables"]["account_deletion_requests"]["Row"];
type ServiceRoleClient = ReturnType<typeof createSupabaseAdminClient>;

export const ACCOUNT_DELETION_COMPLETION_EXPIRY_MS = 7_776_000_000 as const;

export type AccountDeletionCompletionAuthority = {
  deletionRequestId: string;
};

export type AccountDeletionCompletionRequestRow = Pick<
  RequestRow,
  | "id"
  | "user_id"
  | "status"
  | "failure_stage"
  | "failure_reason_code"
  | "auth_cleanup_status"
  | "auth_sub_finalized_at"
  | "notification_status"
  | "completed_at"
  | "expires_at"
  | "last_attempted_at"
> & { metadata: Json };

export type AccountDeletionCompletionAuthorityResult =
  | { kind: "resolved"; authority: AccountDeletionCompletionAuthority }
  | { kind: "invalid" | "missing" | "ambiguous" | "mismatch" | "unknown" };

export type AccountDeletionCompletionRequestResult =
  | { kind: "found"; request: AccountDeletionCompletionRequestRow }
  | { kind: "missing" | "ambiguous" | "mismatch" | "unknown" };

type CompletionTerminalEvidence = {
  completedAt: string;
  expiresAt: string;
  completedAtEpochMicros: number;
  expiresAtEpochMicros: number;
};

export type AccountDeletionCompletionRpcResult =
  | ({ kind: "completed"; alreadyCompleted: false } & CompletionTerminalEvidence)
  | ({ kind: "already_completed"; alreadyCompleted: true } & CompletionTerminalEvidence)
  | { kind: "rejected" }
  | { kind: "unknown" };

export type AccountDeletionCompletionRepository = {
  resolveAuthority(requestRef: string): Promise<AccountDeletionCompletionAuthorityResult>;
  getRequestById(deletionRequestId: string): Promise<AccountDeletionCompletionRequestResult>;
  finalizeCompletion(deletionRequestId: string): Promise<AccountDeletionCompletionRpcResult>;
};

const AUTHORITY_SELECT = "id,anonymized_user_ref";
const REQUEST_SELECT = [
  "id",
  "user_id",
  "status",
  "failure_stage",
  "failure_reason_code",
  "auth_cleanup_status",
  "auth_sub_finalized_at",
  "notification_status",
  "completed_at",
  "expires_at",
  "last_attempted_at",
  "metadata"
].join(",");
const COMPLETION_RPC_FIELDS = new Set([
  "completion_status",
  "safe_reason",
  "completed_at",
  "expires_at",
  "already_completed"
]);
const RECOGNIZED_TRANSACTIONAL_REJECTIONS = new Map([
  ["22023", new Set(["completion_request_identity_invalid"])],
  ["23514", new Set([
    "completion_prerequisite_authority_invalid",
    "completion_terminal_replay_invalid",
    "completion_request_not_runnable"
  ])],
  ["40001", new Set(["completion_terminal_write_lost"])],
  ["42501", new Set(["completion_request_not_found"])]
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isOpaqueRefLike(value: string) {
  return /^adr_[0-9a-f]{32}$/i.test(value);
}

function sameUuid(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseAccountDeletionCompletionUtcInstant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?([zZ]|[+-]\d{2}:?\d{2})$/.exec(normalized);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = (match[7] ?? "").padEnd(6, "0");
  const timezone = match[8];
  if (
    year < 100 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) ||
    hour > 23 || minute > 59 || second > 59
  ) {
    return null;
  }

  const millisecond = Number(fraction.slice(0, 3));
  const subMillisecondMicros = Number(fraction.slice(3, 6));
  let offsetMs = 0;
  if (timezone.toLowerCase() !== "z") {
    const sign = timezone[0] === "+" ? 1 : -1;
    const offsetHour = Number(timezone.slice(1, 3));
    const offsetMinute = Number(timezone.slice(timezone.length - 2));
    if (offsetHour > 23 || offsetMinute > 59) return null;
    offsetMs = sign * (offsetHour * 60 + offsetMinute) * 60_000;
  }

  const utcEpochMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offsetMs;
  const utcEpochMicros = utcEpochMs * 1_000 + subMillisecondMicros;
  return Number.isSafeInteger(utcEpochMicros) ? utcEpochMicros : null;
}

function hasExactRpcFields(row: Record<string, unknown>) {
  const fields = Object.keys(row);
  return fields.length === COMPLETION_RPC_FIELDS.size && fields.every((field) => COMPLETION_RPC_FIELDS.has(field));
}

function normalizeCompletionRpcData(value: unknown): AccountDeletionCompletionRpcResult {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0]) || !hasExactRpcFields(value[0])) {
    return { kind: "unknown" };
  }

  const row = value[0];
  const completedAtEpochMicros = parseAccountDeletionCompletionUtcInstant(row.completed_at);
  const expiresAtEpochMicros = parseAccountDeletionCompletionUtcInstant(row.expires_at);
  if (
    row.completion_status !== "completed" ||
    typeof row.completed_at !== "string" ||
    typeof row.expires_at !== "string" ||
    completedAtEpochMicros === null ||
    expiresAtEpochMicros === null ||
    expiresAtEpochMicros - completedAtEpochMicros !== ACCOUNT_DELETION_COMPLETION_EXPIRY_MS * 1_000
  ) {
    return { kind: "unknown" };
  }

  const evidence: CompletionTerminalEvidence = {
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    completedAtEpochMicros,
    expiresAtEpochMicros
  };

  if (row.safe_reason === "completion_finalized" && row.already_completed === false) {
    return { kind: "completed", alreadyCompleted: false, ...evidence };
  }
  if (row.safe_reason === "already_completed" && row.already_completed === true) {
    return { kind: "already_completed", alreadyCompleted: true, ...evidence };
  }

  return { kind: "unknown" };
}

function isRecognizedTransactionalRejection(value: unknown) {
  if (!isRecord(value) || typeof value.code !== "string" || typeof value.message !== "string") {
    return false;
  }

  return RECOGNIZED_TRANSACTIONAL_REJECTIONS.get(value.code)?.has(value.message) === true;
}

function isAuthorityRow(value: unknown): value is { id: string; anonymized_user_ref: string } {
  return isRecord(value) && typeof value.id === "string" && typeof value.anonymized_user_ref === "string";
}

function isRequestRow(value: unknown): value is AccountDeletionCompletionRequestRow {
  return isRecord(value) && typeof value.id === "string";
}

export function createAccountDeletionCompletionRepository(
  client: ServiceRoleClient = createSupabaseAdminClient()
): AccountDeletionCompletionRepository {
  async function resolveAuthority(requestRef: string): Promise<AccountDeletionCompletionAuthorityResult> {
    const normalized = requestRef.trim();
    const field = isUuidLike(normalized)
      ? "id"
      : isOpaqueRefLike(normalized)
        ? "anonymized_user_ref"
        : null;
    if (!field) return { kind: "invalid" };

    try {
      const response = (await client
        .from("account_deletion_requests")
        .select(AUTHORITY_SELECT)
        .eq(field, normalized)
        .limit(2)) as unknown as { data: unknown; error: unknown };
      if (response.error) return { kind: "unknown" };
      if (!Array.isArray(response.data) || response.data.length === 0) return { kind: "missing" };
      if (response.data.length !== 1) return { kind: "ambiguous" };

      const row = response.data[0];
      if (!isAuthorityRow(row) || !isUuidLike(row.id)) return { kind: "mismatch" };
      const matches = field === "id"
        ? sameUuid(row.id, normalized)
        : row.anonymized_user_ref === normalized;
      return matches
        ? { kind: "resolved", authority: { deletionRequestId: row.id } }
        : { kind: "mismatch" };
    } catch {
      return { kind: "unknown" };
    }
  }

  async function getRequestById(deletionRequestId: string): Promise<AccountDeletionCompletionRequestResult> {
    if (!isUuidLike(deletionRequestId)) return { kind: "mismatch" };

    try {
      const response = (await client
        .from("account_deletion_requests")
        .select(REQUEST_SELECT)
        .eq("id", deletionRequestId)
        .limit(2)) as unknown as { data: unknown; error: unknown };
      if (response.error) return { kind: "unknown" };
      if (!Array.isArray(response.data) || response.data.length === 0) return { kind: "missing" };
      if (response.data.length !== 1) return { kind: "ambiguous" };

      const row = response.data[0];
      return isRequestRow(row) && isUuidLike(row.id) && sameUuid(row.id, deletionRequestId)
        ? { kind: "found", request: row }
        : { kind: "mismatch" };
    } catch {
      return { kind: "unknown" };
    }
  }

  async function finalizeCompletion(deletionRequestId: string): Promise<AccountDeletionCompletionRpcResult> {
    if (!isUuidLike(deletionRequestId)) return { kind: "unknown" };

    try {
      const response = (await client.rpc("finalize_account_deletion_completion", {
        p_deletion_request_id: deletionRequestId
      })) as unknown as { data: unknown; error: unknown };
      if (response.error) {
        return isRecognizedTransactionalRejection(response.error)
          ? { kind: "rejected" }
          : { kind: "unknown" };
      }

      return normalizeCompletionRpcData(response.data);
    } catch {
      return { kind: "unknown" };
    }
  }

  return { resolveAuthority, getRequestById, finalizeCompletion };
}
