export type MobileAuthReasonCode =
  | "auth_not_configured"
  | "auth_email_invalid"
  | "auth_request_failed"
  | "auth_request_rate_limited"
  | "auth_callback_invalid"
  | "auth_callback_state_mismatch"
  | "auth_callback_expired"
  | "auth_callback_duplicate"
  | "auth_exchange_failed"
  | "auth_session_missing"
  | "auth_session_expired"
  | "auth_session_invalid"
  | "auth_refresh_failed"
  | "auth_secure_store_unavailable"
  | "auth_unavailable";

export type MobileAuthState =
  | { kind: "unauthenticated" }
  | { kind: "requesting_link" }
  | { kind: "link_sent"; cooldownUntil: number }
  | { kind: "awaiting_callback"; cooldownUntil: number }
  | { kind: "exchanging_code" }
  | { kind: "authenticated"; userId: string }
  | { kind: "restoring" }
  | { kind: "refreshing" }
  | { kind: "expired"; reasonCode: "auth_session_expired" | "auth_session_invalid" }
  | { kind: "signing_out" }
  | {
      kind: "recoverable_error";
      reasonCode: MobileAuthReasonCode;
      restartRequired: boolean;
    }
  | { kind: "fatal_error"; reasonCode: MobileAuthReasonCode };

export type MobileAuthEvent =
  | { type: "RESTORE_STARTED" }
  | { type: "RESTORE_EMPTY" }
  | { type: "LINK_REQUEST_STARTED" }
  | { type: "LINK_SENT"; cooldownUntil: number }
  | { type: "CALLBACK_WAIT_STARTED"; cooldownUntil: number }
  | { type: "CALLBACK_EXCHANGE_STARTED" }
  | { type: "SESSION_ESTABLISHED"; userId: string }
  | { type: "REFRESH_STARTED" }
  | { type: "SESSION_EXPIRED"; reasonCode: "auth_session_expired" | "auth_session_invalid" }
  | { type: "SIGN_OUT_STARTED" }
  | { type: "SIGNED_OUT" }
  | {
      type: "RECOVERABLE_FAILURE";
      reasonCode: MobileAuthReasonCode;
      restartRequired?: boolean;
    }
  | { type: "FATAL_FAILURE"; reasonCode: MobileAuthReasonCode };

export const initialMobileAuthState: MobileAuthState = { kind: "unauthenticated" };

export function canRequestMagicLink(state: MobileAuthState) {
  return (
    state.kind === "unauthenticated" ||
    state.kind === "link_sent" ||
    state.kind === "awaiting_callback" ||
    state.kind === "expired" ||
    state.kind === "recoverable_error"
  );
}

export function canHandleMobileAuthCallback(state: MobileAuthState) {
  return (
    state.kind === "unauthenticated" ||
    state.kind === "link_sent" ||
    state.kind === "awaiting_callback" ||
    state.kind === "restoring" ||
    state.kind === "recoverable_error"
  );
}

export function reduceMobileAuthState(
  _state: MobileAuthState,
  event: MobileAuthEvent
): MobileAuthState {
  switch (event.type) {
    case "RESTORE_STARTED":
      return { kind: "restoring" };
    case "RESTORE_EMPTY":
    case "SIGNED_OUT":
      return { kind: "unauthenticated" };
    case "LINK_REQUEST_STARTED":
      return { kind: "requesting_link" };
    case "LINK_SENT":
      return { kind: "link_sent", cooldownUntil: event.cooldownUntil };
    case "CALLBACK_WAIT_STARTED":
      return { kind: "awaiting_callback", cooldownUntil: event.cooldownUntil };
    case "CALLBACK_EXCHANGE_STARTED":
      return { kind: "exchanging_code" };
    case "SESSION_ESTABLISHED":
      return { kind: "authenticated", userId: event.userId };
    case "REFRESH_STARTED":
      return { kind: "refreshing" };
    case "SESSION_EXPIRED":
      return { kind: "expired", reasonCode: event.reasonCode };
    case "SIGN_OUT_STARTED":
      return { kind: "signing_out" };
    case "RECOVERABLE_FAILURE":
      return {
        kind: "recoverable_error",
        reasonCode: event.reasonCode,
        restartRequired: event.restartRequired ?? false
      };
    case "FATAL_FAILURE":
      return { kind: "fatal_error", reasonCode: event.reasonCode };
  }
}
