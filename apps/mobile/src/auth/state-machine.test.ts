import { describe, expect, it } from "vitest";
import { initialMobileAuthState, reduceMobileAuthState } from "./state-machine";

describe("mobile auth state machine", () => {
  it("covers link request, callback exchange, authentication, refresh, and logout", () => {
    const requesting = reduceMobileAuthState(initialMobileAuthState, {
      type: "LINK_REQUEST_STARTED"
    });
    const linkSent = reduceMobileAuthState(requesting, {
      type: "LINK_SENT",
      cooldownUntil: 120
    });
    const waiting = reduceMobileAuthState(linkSent, {
      type: "CALLBACK_WAIT_STARTED",
      cooldownUntil: 120
    });
    const exchanging = reduceMobileAuthState(waiting, {
      type: "CALLBACK_EXCHANGE_STARTED"
    });
    const authenticated = reduceMobileAuthState(exchanging, {
      type: "SESSION_ESTABLISHED",
      userId: "user-fixture"
    });
    const refreshing = reduceMobileAuthState(authenticated, { type: "REFRESH_STARTED" });
    const refreshed = reduceMobileAuthState(refreshing, {
      type: "SESSION_ESTABLISHED",
      userId: "user-fixture"
    });
    const signingOut = reduceMobileAuthState(refreshed, { type: "SIGN_OUT_STARTED" });
    const signedOut = reduceMobileAuthState(signingOut, { type: "SIGNED_OUT" });

    expect(requesting.kind).toBe("requesting_link");
    expect(linkSent.kind).toBe("link_sent");
    expect(waiting.kind).toBe("awaiting_callback");
    expect(exchanging.kind).toBe("exchanging_code");
    expect(authenticated).toEqual({ kind: "authenticated", userId: "user-fixture" });
    expect(refreshing.kind).toBe("refreshing");
    expect(signedOut.kind).toBe("unauthenticated");
  });

  it("keeps provider details out of recoverable state", () => {
    expect(
      reduceMobileAuthState(initialMobileAuthState, {
        type: "RECOVERABLE_FAILURE",
        reasonCode: "auth_exchange_failed",
        restartRequired: true
      })
    ).toEqual({
      kind: "recoverable_error",
      reasonCode: "auth_exchange_failed",
      restartRequired: true
    });
  });
});
