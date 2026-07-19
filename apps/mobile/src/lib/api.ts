export type HealthConnectionState =
  | { kind: "checking" }
  | { kind: "connected"; service: string }
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "server-error"; status: number }
  | { kind: "invalid-response" }
  | { kind: "network-error" };

type HealthPayload = {
  ok: true;
  data: {
    status: "ok";
    service: string;
    timestamp: string;
  };
};

type FetchHealthOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type MobileScript = {
  id: string;
  title: string;
  content: string;
  targetSeconds: number;
  locale: string;
  createdAt: string;
  updatedAt: string;
};

export type ScriptsRequestState =
  | { kind: "success"; scripts: MobileScript[] }
  | { kind: "unauthorized"; reasonCode: string }
  | { kind: "forbidden"; reasonCode: string }
  | { kind: "rate-limited"; retryAfterSeconds: number }
  | { kind: "server-error"; status: number }
  | { kind: "invalid-response" }
  | { kind: "timeout" }
  | { kind: "network-error" };

type FetchScriptsOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function isHealthPayload(value: unknown): value is HealthPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<HealthPayload>;
  const data = payload.data;

  return (
    payload.ok === true &&
    Boolean(data) &&
    data?.status === "ok" &&
    typeof data.service === "string" &&
    data.service.length > 0 &&
    typeof data.timestamp === "string" &&
    !Number.isNaN(Date.parse(data.timestamp))
  );
}

function isMobileScript(value: unknown): value is MobileScript {
  if (!value || typeof value !== "object") {
    return false;
  }

  const script = value as Partial<MobileScript>;
  return (
    typeof script.id === "string" &&
    Boolean(script.id) &&
    typeof script.title === "string" &&
    typeof script.content === "string" &&
    typeof script.targetSeconds === "number" &&
    Number.isFinite(script.targetSeconds) &&
    typeof script.locale === "string" &&
    typeof script.createdAt === "string" &&
    !Number.isNaN(Date.parse(script.createdAt)) &&
    typeof script.updatedAt === "string" &&
    !Number.isNaN(Date.parse(script.updatedAt))
  );
}

function parseScriptsPayload(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as { ok?: unknown; data?: { scripts?: unknown } };
  return payload.ok === true && Array.isArray(payload.data?.scripts) && payload.data.scripts.every(isMobileScript)
    ? payload.data.scripts
    : null;
}

function parseErrorReason(value: unknown) {
  if (!value || typeof value !== "object") {
    return "request_failed";
  }

  const payload = value as { error?: { reasonCode?: unknown } };
  return typeof payload.error?.reasonCode === "string"
    ? payload.error.reasonCode
    : "request_failed";
}

function parseRetryAfter(value: string | null) {
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 300 ? seconds : 30;
}

export function initialHealthState(isOnline: boolean): HealthConnectionState {
  return isOnline ? { kind: "checking" } : { kind: "offline" };
}

export async function fetchHealth(
  bffBaseUrl: string,
  options: FetchHealthOptions = {}
): Promise<HealthConnectionState> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(bffBaseUrl + "/api/mobile/health", {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      return { kind: "server-error", status: response.status };
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!isHealthPayload(payload)) {
      return { kind: "invalid-response" };
    }

    return {
      kind: "connected",
      service: payload.data.service
    };
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { kind: "timeout" };
    }

    return { kind: "network-error" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMobileScripts(
  bffBaseUrl: string,
  accessToken: string,
  options: FetchScriptsOptions = {}
): Promise<ScriptsRequestState> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);

  try {
    const response = await fetchImpl(bffBaseUrl + "/api/mobile/scripts", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal
    });
    const payload: unknown = await response.json().catch(() => null);

    if (response.ok) {
      const scripts = parseScriptsPayload(payload);
      return scripts ? { kind: "success", scripts } : { kind: "invalid-response" };
    }

    const reasonCode = parseErrorReason(payload);
    if (response.status === 401) {
      return { kind: "unauthorized", reasonCode };
    }

    if (response.status === 403) {
      return { kind: "forbidden", reasonCode };
    }

    if (response.status === 429) {
      return {
        kind: "rate-limited",
        retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after"))
      };
    }

    return { kind: "server-error", status: response.status };
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { kind: "timeout" };
    }

    return { kind: "network-error" };
  } finally {
    clearTimeout(timeout);
  }
}
