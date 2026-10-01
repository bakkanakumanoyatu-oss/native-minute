import { createHash } from "node:crypto";

const PROVIDER_ORIGIN = "https://api.elevenlabs.io";
const USER_URL = `${PROVIDER_ORIGIN}/v1/user`;
const VOICES_URL = `${PROVIDER_ORIGIN}/v2/voices`;
const MAX_PAGES = 50;
const MAX_VOICES = 5_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const SNAPSHOT_TIMEOUT_MS = 45_000;
const CUSTOM_CATEGORIES = new Set(["cloned", "generated", "professional"]);
const KNOWN_CATEGORIES = new Set(["premade", ...CUSTOM_CATEGORIES]);

export function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function getProbeSelector(env = process.env) {
  // Match providers/voice/factory.ts exactly: do not trim the selector.
  const raw = env.VOICE_PROVIDER ?? "mock";
  const normalized = typeof raw === "string" ? raw.toLowerCase() : null;
  const effectiveProvider = normalized === null
    ? "UNKNOWN"
    : ["elevenlabs", "openai", "mock"].includes(normalized)
      ? normalized
      : "<other>";

  return {
    effectiveProvider,
    selector: effectiveProvider === "UNKNOWN" ? "UNKNOWN" : `VOICE_PROVIDER=${effectiveProvider}`,
    credentials: {
      ELEVENLABS_API_KEY_PRESENT: typeof env.ELEVENLABS_API_KEY === "string" && Boolean(env.ELEVENLABS_API_KEY.trim()),
      OPENAI_API_KEY_PRESENT: typeof env.OPENAI_API_KEY === "string" && Boolean(env.OPENAI_API_KEY.trim())
    }
  };
}

export function isReadOnlyProviderRequestAllowed(url, method = "GET") {
  if (method !== "GET" || typeof url !== "string") return false;

  try {
    const parsed = new URL(url);
    if (parsed.origin !== PROVIDER_ORIGIN || parsed.username || parsed.password || parsed.hash) return false;
    if (parsed.pathname === "/v1/user") return parsed.search === "";
    if (parsed.pathname !== "/v2/voices") return false;

    const entries = [...parsed.searchParams.entries()];
    const names = entries.map(([name]) => name);
    if (new Set(names).size !== names.length) return false;
    if (names.some((name) => !["page_size", "next_page_token", "include_total_count"].includes(name))) return false;
    if (parsed.searchParams.get("page_size") !== "100") return false;
    if (parsed.searchParams.has("include_total_count") && parsed.searchParams.get("include_total_count") !== "false") return false;
    const token = parsed.searchParams.get("next_page_token");
    return token === null || (Boolean(token.trim()) && token.length <= 4_096);
  } catch {
    return false;
  }
}

function classifyHttpStatus(status) {
  if (status >= 200 && status < 300) return "SUCCESS";
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500 && status < 600) return "PROVIDER_UNAVAILABLE";
  return "HTTP_REJECTED";
}

function transportFailure(classification, reasonCode) {
  return { ok: false, classification, reasonCode };
}

export async function readOnlyProviderRequest(input, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS) {
  if (!input || typeof input !== "object" || Object.keys(input).some((key) => !["url", "method", "apiKey"].includes(key))) {
    return transportFailure("REQUEST_BLOCKED", "provider_probe_request_not_allowed");
  }
  const method = input.method ?? "GET";
  if (!isReadOnlyProviderRequestAllowed(input.url, method) || typeof input.apiKey !== "string" || !input.apiKey.trim()) {
    return transportFailure("REQUEST_BLOCKED", "provider_probe_request_not_allowed");
  }

  const controller = new AbortController();
  const boundedTimeout = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(REQUEST_TIMEOUT_MS, timeoutMs)) : REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), boundedTimeout);
  try {
    const response = await fetchImpl(input.url, {
      method: "GET",
      headers: { "xi-api-key": input.apiKey, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal
    });
    const classification = classifyHttpStatus(response.status);
    if (classification !== "SUCCESS") {
      // Never read or reflect provider error bodies, request IDs, or URLs.
      return transportFailure(classification, "provider_probe_http_failure");
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      return transportFailure("INVALID_RESPONSE", "provider_probe_response_too_large");
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return transportFailure("INVALID_RESPONSE", "provider_probe_response_not_json");
    }

    const reader = response.body?.getReader();
    if (!reader) return transportFailure("INVALID_RESPONSE", "provider_probe_response_missing_body");
    const chunks = [];
    let byteCount = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteCount += chunk.value.byteLength;
      if (byteCount > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        return transportFailure("INVALID_RESPONSE", "provider_probe_response_too_large");
      }
      chunks.push(Buffer.from(chunk.value));
    }
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return transportFailure("INVALID_RESPONSE", "provider_probe_response_invalid_json");
    }
    return { ok: true, classification: "SUCCESS", payload };
  } catch {
    return transportFailure("NETWORK_FAILURE", "provider_probe_transport_failure");
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOpaqueId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(value);
}

function summarizeInventory(resources, pageCount, paginationComplete) {
  const sorted = [...resources].sort((a, b) => a.voiceIdHash.localeCompare(b.voiceIdHash));
  const voiceIdHashes = sorted.map((resource) => resource.voiceIdHash);
  const knownTimes = sorted.map((resource) => resource.createdAtUnix).filter((value) => value !== null);
  const categoryCounts = { premade: 0, cloned: 0, generated: 0, professional: 0, other: 0 };
  for (const resource of sorted) categoryCounts[resource.category] += 1;

  return {
    paginationComplete,
    pageCount,
    totalVoiceCount: sorted.length,
    ownedVoiceCount: sorted.filter((resource) => resource.isOwner === true).length,
    customVoiceCount: sorted.filter((resource) => CUSTOM_CATEGORIES.has(resource.category)).length,
    ownedCustomCount: sorted.filter((resource) => resource.classification === "OWNED_CUSTOM").length,
    nonAppResourceCount: sorted.filter((resource) => resource.classification === "NON_APP_RESOURCE").length,
    unknownClassificationCount: sorted.filter((resource) => resource.classification === "UNKNOWN").length,
    categoryCounts,
    voiceIdHashes,
    ownedCustomIdHashes: sorted.filter((resource) => resource.classification === "OWNED_CUSTOM").map((resource) => resource.voiceIdHash),
    unknownIdHashes: sorted.filter((resource) => resource.classification === "UNKNOWN").map((resource) => resource.voiceIdHash),
    digest: sha256(voiceIdHashes.join("\n")),
    createdAtRange: {
      minUnix: knownTimes.length ? Math.min(...knownTimes) : null,
      maxUnix: knownTimes.length ? Math.max(...knownTimes) : null,
      knownCount: knownTimes.length,
      unknownCount: sorted.length - knownTimes.length
    }
  };
}

function failProbe(base, reasonCode, account = null, inventory = null) {
  return { ...base, status: "BLOCKED", reasonCode, account, inventory };
}

export async function runProbe(mode, env = process.env, fetchImpl = fetch) {
  const base = { ...getProbeSelector(env), requestedAt: new Date().toISOString() };
  if (mode === "selector") return { ...base, status: "PASS", reasonCode: "provider_probe_selector_only", account: null, inventory: null };
  if (mode !== "inventory") return failProbe(base, "provider_probe_mode_not_allowed");
  if (base.effectiveProvider === "UNKNOWN") return failProbe(base, "provider_probe_effective_provider_unknown");
  if (base.effectiveProvider !== "elevenlabs") return failProbe(base, "provider_probe_inventory_not_supported_for_effective_provider");
  if (!base.credentials.ELEVENLABS_API_KEY_PRESENT) return failProbe(base, "provider_probe_credential_missing");

  const apiKey = env.ELEVENLABS_API_KEY.trim();
  const deadline = Date.now() + SNAPSHOT_TIMEOUT_MS;
  const request = async (url) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return transportFailure("NETWORK_FAILURE", "provider_probe_snapshot_timeout");
    const result = await readOnlyProviderRequest({ url, apiKey }, fetchImpl, remainingMs);
    if (Date.now() >= deadline) return transportFailure("NETWORK_FAILURE", "provider_probe_snapshot_timeout");
    return result;
  };
  const userResponse = await request(USER_URL);
  if (!userResponse.ok) {
    return failProbe(base, userResponse.reasonCode, { status: userResponse.classification, identityHash: null });
  }
  if (!isRecord(userResponse.payload) || !isOpaqueId(userResponse.payload.user_id)) {
    return failProbe(base, "provider_probe_account_identity_invalid", { status: "INVALID_RESPONSE", identityHash: null });
  }
  const account = { status: "SUCCESS", identityHash: sha256(userResponse.payload.user_id) };
  // Raw user payload is scoped to this request and is never logged or persisted.
  userResponse.payload = null;
  const resources = [];
  const seenIds = new Set();
  const seenTokens = new Set();
  let token = null;
  let pageCount = 0;
  const failInventory = (reasonCode) => failProbe(base, reasonCode, account, summarizeInventory(resources, pageCount, false));

  while (pageCount < MAX_PAGES) {
    const url = new URL(VOICES_URL);
    url.searchParams.set("page_size", "100");
    url.searchParams.set("include_total_count", "false");
    if (token !== null) url.searchParams.set("next_page_token", token);
    const pageResponse = await request(url.toString());
    if (!pageResponse.ok) {
      return { ...failInventory(pageResponse.reasonCode), inventoryHttpStatusClass: pageResponse.classification };
    }
    pageCount += 1;
    const page = pageResponse.payload;
    if (!isRecord(page) || !Array.isArray(page.voices) || typeof page.has_more !== "boolean") {
      return failInventory("provider_probe_pagination_schema_invalid");
    }
    if (resources.length + page.voices.length > MAX_VOICES) return failInventory("provider_probe_resource_cap_exceeded");
    for (const voice of page.voices) {
      if (!isRecord(voice) || !isOpaqueId(voice.voice_id)) return failInventory("provider_probe_voice_identity_invalid");
      const voiceIdHash = sha256(voice.voice_id);
      if (seenIds.has(voiceIdHash)) return failInventory("provider_probe_duplicate_voice_identity");
      seenIds.add(voiceIdHash);
      const category = KNOWN_CATEGORIES.has(voice.category) ? voice.category : "other";
      const isOwner = typeof voice.is_owner === "boolean" ? voice.is_owner : null;
      const classification = category === "premade"
        ? "NON_APP_RESOURCE"
        : isOwner === true && CUSTOM_CATEGORIES.has(category)
          ? "OWNED_CUSTOM"
          : "UNKNOWN";
      const createdAtUnix = Number.isSafeInteger(voice.created_at_unix) && voice.created_at_unix > 0 ? voice.created_at_unix : null;
      resources.push({ voiceIdHash, category, isOwner, classification, createdAtUnix });
    }
    if (!page.has_more) {
      return {
        ...base,
        status: "PASS",
        reasonCode: "provider_probe_inventory_complete",
        completedAt: new Date().toISOString(),
        account,
        inventory: summarizeInventory(resources, pageCount, true)
      };
    }
    if (page.voices.length === 0) return failInventory("provider_probe_pagination_empty_page");
    if (typeof page.next_page_token !== "string" || !page.next_page_token.trim() || page.next_page_token.length > 4_096) {
      return failInventory("provider_probe_pagination_token_invalid");
    }
    if (seenTokens.has(page.next_page_token)) return failInventory("provider_probe_pagination_token_repeated");
    token = page.next_page_token;
    seenTokens.add(token);
    pageResponse.payload = null;
  }
  return failInventory("provider_probe_page_cap_exceeded");
}
