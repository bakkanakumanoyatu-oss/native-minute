export type MobileApiReasonCode =
  | "auth_required"
  | "session_expired"
  | "session_invalid"
  | "auth_unavailable"
  | "request_invalid"
  | "origin_forbidden"
  | "method_not_allowed"
  | "rate_limited"
  | "scripts_unavailable"
  | "account_deletion_in_progress"
  | "mobile_auth_disabled";

export interface MobileApiErrorBody {
  ok: false;
  error: {
    reasonCode: MobileApiReasonCode;
    message: string;
    retryable: boolean;
  };
}

export interface MobileApiSuccessBody<T> {
  ok: true;
  data: T;
}
