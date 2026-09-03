import "server-only";

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
type AuthErrorLike = { status?: unknown; code?: unknown };
type GetResponseLike = { data?: { user?: unknown } | null; error?: AuthErrorLike | null };
type DeleteResponseLike = { data?: { user?: unknown } | null; error?: AuthErrorLike | null };
type SupabaseAuthAdminLike = {
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

function statusNumber(error: AuthErrorLike | null | undefined) {
  return typeof error?.status === "number" ? error.status : null;
}

function errorCode(error: AuthErrorLike | null | undefined) {
  return typeof error?.code === "string" ? error.code : null;
}

function isExactUserNotFound(error: AuthErrorLike | null | undefined) {
  return statusNumber(error) === 404 && errorCode(error) === "user_not_found";
}

function classifyNonAbsenceError(error: AuthErrorLike | null | undefined):
  | "permission_denied"
  | "rate_limited"
  | "unavailable"
  | "malformed" {
  const status = statusNumber(error);
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
  const user = typed.data?.user;

  // Absence is deliberately conjunctive. Neither a generic error nor a null
  // user on its own is canonical absence evidence.
  if (user === null && isExactUserNotFound(typed.error)) {
    return { kind: "verified_absent" };
  }

  if (typed.error) {
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

  if (isExactUserNotFound(typed.error)) {
    return { kind: "not_found" };
  }
  if (typed.error) {
    return { kind: classifyNonAbsenceError(typed.error) };
  }

  const user = typed.data?.user;
  return isRecord(user) && user.id === targetUserId
    ? { kind: "observed" }
    : { kind: "malformed" };
}

function classifyThrown(error: unknown): "timeout" | "network_error" {
  return isRecord(error) && error.name === "TimeoutError" ? "timeout" : "network_error";
}

/**
 * Strict installed-SDK adapter. It is dependency-injected only: this foundation
 * does not create an admin client or wire/call real Supabase Auth.
 */
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
