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
