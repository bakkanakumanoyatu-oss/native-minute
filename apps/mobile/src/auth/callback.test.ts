import { describe, expect, it } from "vitest";
import {
  buildDebugCallbackTarget,
  CallbackReplayGuard,
  parseMobileAuthCallback
} from "./callback";

const CALLBACK_URI = "com.nativeminutes.app.debug://auth/callback";
const HTTPS_CALLBACK_URI =
  "https://native-minute-staging.vercel.app/mobile/auth/callback";
const IDENTITY = {
  transactionId: "transaction-fixture",
  state: "state-fixture",
  nonce: "nonce-fixture"
};

function validCallback(callbackUri = CALLBACK_URI) {
  const url = new URL(buildDebugCallbackTarget(callbackUri, IDENTITY));
  url.searchParams.set("code", "authorization-code-fixture");
  return url.toString();
}

describe("mobile auth callback", () => {
  it("accepts the exact debug target and returns only transient exchange fields", () => {
    expect(parseMobileAuthCallback(validCallback(), CALLBACK_URI)).toEqual({
      ok: true,
      callback: {
        code: "authorization-code-fixture",
        ...IDENTITY
      }
    });
  });

  it("accepts an exact HTTPS callback target without changing the debug contract", () => {
    expect(parseMobileAuthCallback(validCallback(HTTPS_CALLBACK_URI), HTTPS_CALLBACK_URI)).toEqual({
      ok: true,
      callback: {
        code: "authorization-code-fixture",
        ...IDENTITY
      }
    });
  });

  it.each([
    "http://native-minute-staging.vercel.app/mobile/auth/callback",
    "https://other.example/mobile/auth/callback",
    "https://native-minute-staging.vercel.app:8443/mobile/auth/callback",
    "https://native-minute-staging.vercel.app/mobile/auth/other"
  ])("rejects an HTTPS callback with a non-exact target: %s", (target) => {
    expect(parseMobileAuthCallback(validCallback(target), HTTPS_CALLBACK_URI)).toEqual({
      ok: false,
      reason: "invalid"
    });
  });

  it.each([
    "https://user@native-minute-staging.vercel.app/mobile/auth/callback?code=x&transaction_id=t&state=s&nonce=n",
    "https://native-minute-staging.vercel.app/mobile/auth/callback?code=x&transaction_id=t&state=s&nonce=n#fragment",
    "https://native-minute-staging.vercel.app/mobile/auth/callback?code=x&transaction_id=t&state=s&nonce=n&next=/scripts",
    "https://native-minute-staging.vercel.app/mobile/auth/callback?code=x&code=y&transaction_id=t&state=s&nonce=n"
  ])("rejects ambiguous or unsafe HTTPS callback fields", (url) => {
    expect(parseMobileAuthCallback(url, HTTPS_CALLBACK_URI)).toEqual({
      ok: false,
      reason: "invalid"
    });
  });

  it.each([
    "https://auth.example/callback?code=x&transaction_id=t&state=s&nonce=n",
    "com.nativeminutes.app.debug://auth/other?code=x&transaction_id=t&state=s&nonce=n",
    "com.nativeminutes.app.debug://auth/callback?code=x&code=y&transaction_id=t&state=s&nonce=n",
    "com.nativeminutes.app.debug://auth/callback?code=x&transaction_id=t&state=s&nonce=n&next=/scripts"
  ])("rejects a non-exact or ambiguous callback without exposing its contents", (url) => {
    expect(parseMobileAuthCallback(url, CALLBACK_URI)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects warm or cold duplicate delivery after the first exchange begins", () => {
    const guard = new CallbackReplayGuard();

    expect(guard.begin(IDENTITY.transactionId)).toBe(true);
    expect(guard.begin(IDENTITY.transactionId)).toBe(false);
    guard.finish(IDENTITY.transactionId);
    expect(guard.begin(IDENTITY.transactionId)).toBe(false);
  });
});
