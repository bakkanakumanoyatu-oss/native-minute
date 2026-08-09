export type PendingCallbackIdentity = {
  transactionId: string;
  state: string;
  nonce: string;
};

export type ParsedMobileAuthCallback = PendingCallbackIdentity & {
  code: string;
};

export type CallbackParseResult =
  | { ok: true; callback: ParsedMobileAuthCallback }
  | { ok: false; reason: "invalid" };

const CALLBACK_QUERY_KEYS = new Set(["code", "state", "nonce", "transaction_id"]);

function readSingleParameter(url: URL, key: string) {
  const values = url.searchParams.getAll(key);

  if (values.length !== 1 || !values[0]) {
    return null;
  }

  return values[0];
}

export function buildMobileAuthCallbackTarget(
  callbackUri: string,
  identity: PendingCallbackIdentity
) {
  const url = new URL(callbackUri);
  url.searchParams.set("transaction_id", identity.transactionId);
  url.searchParams.set("state", identity.state);
  url.searchParams.set("nonce", identity.nonce);
  return url.toString();
}

export function parseMobileAuthCallback(
  callbackUrl: string,
  expectedCallbackUri: string
): CallbackParseResult {
  try {
    const actual = new URL(callbackUrl);
    const expected = new URL(expectedCallbackUri);
    const sameTarget =
      actual.protocol === expected.protocol &&
      actual.hostname === expected.hostname &&
      actual.port === expected.port &&
      actual.pathname === expected.pathname &&
      !actual.username &&
      !actual.password &&
      !actual.hash;

    if (!sameTarget) {
      return { ok: false, reason: "invalid" };
    }

    for (const key of actual.searchParams.keys()) {
      if (!CALLBACK_QUERY_KEYS.has(key)) {
        return { ok: false, reason: "invalid" };
      }
    }

    const code = readSingleParameter(actual, "code");
    const transactionId = readSingleParameter(actual, "transaction_id");
    const state = readSingleParameter(actual, "state");
    const nonce = readSingleParameter(actual, "nonce");

    if (!code || !transactionId || !state || !nonce) {
      return { ok: false, reason: "invalid" };
    }

    return {
      ok: true,
      callback: { code, transactionId, state, nonce }
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export class CallbackReplayGuard {
  private readonly active = new Set<string>();
  private readonly consumed = new Set<string>();

  begin(transactionId: string) {
    if (this.active.has(transactionId) || this.consumed.has(transactionId)) {
      return false;
    }

    this.active.add(transactionId);
    return true;
  }

  finish(transactionId: string) {
    this.active.delete(transactionId);
    this.consumed.add(transactionId);
  }

  cancel(transactionId: string) {
    this.active.delete(transactionId);
  }
}
