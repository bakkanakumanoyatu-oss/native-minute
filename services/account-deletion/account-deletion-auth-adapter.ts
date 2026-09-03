import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

export const ACCOUNT_DELETION_AUTH_REQUEST_TIMEOUT_MS = 10_000 as const;

export type AccountDeletionAuthGetResult =
  | { kind: "present" }
  | { kind: "verified_absent" }
  | { kind: "permission_denied" }
  | { kind: "rate_limited" }
  | { kind: "unavailable" }
  | { kind: "network_error" }
  | { kind: "timeout" }
  | { kind: "malformed" }
  | { kind: "mismatched_user" };

export type AccountDeletionAuthDeleteResult =
  | { kind: "observed" }
  | { kind: "not_found" }
  | { kind: "permission_denied" }
  | { kind: "rate_limited" }
  | { kind: "unavailable" }
  | { kind: "network_error" }
  | { kind: "timeout" }
  | { kind: "malformed" };

export type AccountDeletionAuthAdapter = {
  getUserById(targetUserId: string): Promise<AccountDeletionAuthGetResult>;
  deleteUser(targetUserId: string): Promise<AccountDeletionAuthDeleteResult>;
};

type AuthUserLike = { id?: unknown };
type GetResponseLike = { data?: { user?: unknown } | null; error?: unknown };
type DeleteResponseLike = { data?: { user?: unknown } | null; error?: unknown };
export type SupabaseAuthAdminLike = {
  auth: {
    admin: {
      getUserById(targetUserId: string): Promise<GetResponseLike>;
      deleteUser(targetUserId: string): Promise<DeleteResponseLike>;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function statusNumber(error: unknown) {
  return isRecord(error) && typeof error.status === "number" ? error.status : null;
}

function errorCode(error: unknown) {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function errorName(error: unknown) {
  return isRecord(error) && typeof error.name === "string" ? error.name : null;
}

function errorMessage(error: unknown) {
  return isRecord(error) && typeof error.message === "string" ? error.message : null;
}

function isExactUserNotFound(error: unknown) {
  return statusNumber(error) === 404 && errorCode(error) === "user_not_found";
}

function isTimeoutError(error: unknown) {
  return errorName(error) === "TimeoutError" || errorName(error) === "AbortError" ||
    errorCode(error) === "request_timeout" || errorMessage(error) === "request_timeout";
}

function isNetworkError(error: unknown) {
  const status = statusNumber(error);
  return status === 0 || (errorName(error) === "AuthRetryableFetchError" && (status === null || status === 0));
}

function classifyNonAbsenceError(error: unknown):
  | "permission_denied"
  | "rate_limited"
  | "unavailable"
  | "network_error"
  | "timeout"
  | "malformed" {
  if (!isRecord(error)) return "malformed";
  const status = statusNumber(error);
  if (isTimeoutError(error)) return "timeout";
  if (isNetworkError(error)) return "network_error";
  if (status === 401 || status === 403) return "permission_denied";
  if (status === 429) return "rate_limited";
  if (status !== null && status >= 500 && status <= 599) return "unavailable";
  return "malformed";
}

export function classifyAccountDeletionAuthGetResponse(
  targetUserId: string,
  response: unknown
): AccountDeletionAuthGetResult {
  if (!isRecord(response)) return { kind: "malformed" };
  const typed = response as GetResponseLike;
  if (!("data" in response) || !("error" in response) || !isRecord(typed.data) || !("user" in typed.data)) {
    return { kind: "malformed" };
  }
  const user = typed.data.user;

  // Absence is deliberately conjunctive. Neither a generic error nor a null
  // user on its own is canonical absence evidence.
  if (user === null && isExactUserNotFound(typed.error)) {
    return { kind: "verified_absent" };
  }

  if (typed.error !== null) {
    return { kind: classifyNonAbsenceError(typed.error) };
  }

  if (!isRecord(user) || typeof (user as AuthUserLike).id !== "string") {
    return { kind: "malformed" };
  }

  return (user as AuthUserLike).id === targetUserId
    ? { kind: "present" }
    : { kind: "mismatched_user" };
}

export function classifyAccountDeletionAuthDeleteResponse(
  targetUserId: string,
  response: unknown
): AccountDeletionAuthDeleteResult {
  if (!isRecord(response)) return { kind: "malformed" };
  const typed = response as DeleteResponseLike;
  if (!("data" in response) || !("error" in response) || !isRecord(typed.data) || !("user" in typed.data)) {
    return { kind: "malformed" };
  }
  const user = typed.data.user;

  if (user === null && isExactUserNotFound(typed.error)) {
    return { kind: "not_found" };
  }
  if (typed.error !== null) {
    return { kind: classifyNonAbsenceError(typed.error) };
  }

  return isRecord(user) && user.id === targetUserId
    ? { kind: "observed" }
    : { kind: "malformed" };
}

function classifyThrown(error: unknown): "timeout" | "network_error" | "malformed" {
  if (isTimeoutError(error)) return "timeout";
  if (isNetworkError(error)) return "network_error";
  return "malformed";
}

/** Strict installed-SDK normalization boundary; construction itself performs no Auth call. */
export function createAccountDeletionAuthAdapter(client: SupabaseAuthAdminLike): AccountDeletionAuthAdapter {
  return {
    async getUserById(targetUserId) {
      try {
        return classifyAccountDeletionAuthGetResponse(
          targetUserId,
          await client.auth.admin.getUserById(targetUserId)
        );
      } catch (error) {
        return { kind: classifyThrown(error) };
      }
    },
    async deleteUser(targetUserId) {
      try {
        return classifyAccountDeletionAuthDeleteResponse(
          targetUserId,
          await client.auth.admin.deleteUser(targetUserId)
        );
      } catch (error) {
        return { kind: classifyThrown(error) };
      }
    }
  };
}

function fixedTransportError(kind: "request_timeout" | "network_error") {
  const error = new Error(kind);
  error.name = kind === "request_timeout" ? "TimeoutError" : "AuthNetworkError";
  return error;
}

/**
 * Auth-only fetch boundary. Each request owns one AbortController and one timer;
 * no retry or abandoned racing promise is introduced.
 */
export function createAccountDeletionAuthBoundedFetch(options: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): typeof fetch {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = typeof options.timeoutMs === "number" && Number.isSafeInteger(options.timeoutMs) &&
      options.timeoutMs > 0
    ? options.timeoutMs
    : ACCOUNT_DELETION_AUTH_REQUEST_TIMEOUT_MS;

  return async (input, init) => {
    const controller = new AbortController();
    const requestSignal = typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined;
    const upstreamSignal = init?.signal ?? requestSignal;
    let aborted = false;
    const abort = () => {
      aborted = true;
      controller.abort();
    };

    if (upstreamSignal?.aborted) {
      abort();
    } else {
      upstreamSignal?.addEventListener("abort", abort, { once: true });
    }

    const timer = setTimeout(abort, timeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } catch {
      throw fixedTransportError(aborted || controller.signal.aborted ? "request_timeout" : "network_error");
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener("abort", abort);
    }
  };
}

/** Production construction is intentionally deferred by the Auth stage service. */
export function createAccountDeletionAuthProductionAdapter(options: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): AccountDeletionAuthAdapter {
  const client = createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      fetch: createAccountDeletionAuthBoundedFetch(options)
    }
  });

  return createAccountDeletionAuthAdapter(client);
}
