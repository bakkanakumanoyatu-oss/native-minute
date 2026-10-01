import assert from "node:assert/strict";
import test from "node:test";
import { getProbeSelector, isReadOnlyProviderRequestAllowed, readOnlyProviderRequest, runProbe, sha256 } from "../lib/operations/provider-readonly-probe.mjs";

const ENV = { VOICE_PROVIDER: "elevenlabs", ELEVENLABS_API_KEY: "fixture-credential-do-not-reflect", OPENAI_API_KEY: "fixture-openai-credential-do-not-reflect" };
const USER_ID = "fixture-private-provider-user";
const PRIVATE_FIELDS = {
  name: "fixture-private-voice-name",
  preview_url: "https://private.example/fixture-preview",
  samples: [{ file_name: "fixture-private-sample.wav" }],
  labels: { personal: "fixture-private-personal-label" }
};
const voice = (voiceId, extra = {}) => ({ voice_id: voiceId, category: "cloned", is_owner: true, created_at_unix: 100, ...PRIVATE_FIELDS, ...extra });
const user = () => ({ user_id: USER_ID, first_name: "fixture-private-first-name", email: "fixture-private@example.com", xi_api_key_preview: "fixture-private-key-preview" });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeProvider(pages, userPayload = user()) {
  const calls = [];
  let pageIndex = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.equal(init.body, undefined);
    assert.equal(init.headers["xi-api-key"], ENV.ELEVENLABS_API_KEY);
    assert.ok(init.signal instanceof AbortSignal);
    if (new URL(url).pathname === "/v1/user") return userPayload instanceof Response ? userPayload : json(userPayload);
    const page = pages[pageIndex++];
    assert.notEqual(page, undefined, "unexpected extra page request");
    return page instanceof Response ? page : json(page);
  };
  return { calls, fetchImpl };
}

function assertSanitized(result, rawIds = []) {
  const output = JSON.stringify(result);
  for (const forbidden of [ENV.ELEVENLABS_API_KEY, ENV.OPENAI_API_KEY, USER_ID, ...Object.values(PRIVATE_FIELDS).filter((value) => typeof value === "string"), "fixture-private-sample.wav", "fixture-private-personal-label", "fixture-private-first-name", "fixture-private@example.com", "fixture-private-key-preview", ...rawIds]) {
    assert.ok(!output.includes(forbidden), `reflected forbidden fixture: ${forbidden}`);
  }
}

test("selector mirrors lowercase-only factory without reflecting unsupported values or credentials", () => {
  assert.equal(getProbeSelector({}).effectiveProvider, "mock");
  assert.equal(getProbeSelector({ VOICE_PROVIDER: "ELEVENLABS" }).effectiveProvider, "elevenlabs");
  assert.equal(getProbeSelector({ VOICE_PROVIDER: " ElevenLabs " }).effectiveProvider, "<other>");
  assert.equal(getProbeSelector({ VOICE_PROVIDER: "" }).effectiveProvider, "<other>");
  assert.equal(getProbeSelector({ VOICE_PROVIDER: 42 }).effectiveProvider, "UNKNOWN");
  const result = getProbeSelector({ ...ENV, VOICE_PROVIDER: "fixture-secret-selector-value" });
  assert.equal(result.selector, "VOICE_PROVIDER=<other>");
  assert.deepEqual(result.credentials, { ELEVENLABS_API_KEY_PRESENT: true, OPENAI_API_KEY_PRESENT: true });
  assert.ok(!JSON.stringify(result).includes("fixture-secret-selector-value"));
  assertSanitized(result);
});

test("selector, non-ElevenLabs selection, missing credentials, and invalid modes perform zero networking", async () => {
  let calls = 0;
  const fetchImpl = () => { calls += 1; throw new Error("must never invoke provider"); };
  assert.equal((await runProbe("selector", ENV, fetchImpl)).status, "PASS");
  for (const selector of ["openai", "mock", "other", " elevenlabs ", ""]) {
    const result = await runProbe("inventory", { ...ENV, VOICE_PROVIDER: selector }, fetchImpl);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.reasonCode, "provider_probe_inventory_not_supported_for_effective_provider");
    assertSanitized(result);
  }
  assert.equal((await runProbe("inventory", { VOICE_PROVIDER: "elevenlabs" }, fetchImpl)).reasonCode, "provider_probe_credential_missing");
  assert.equal((await runProbe("delete", ENV, fetchImpl)).reasonCode, "provider_probe_mode_not_allowed");
  assert.equal((await runProbe("inventory", { ...ENV, VOICE_PROVIDER: {} }, fetchImpl)).reasonCode, "provider_probe_effective_provider_unknown");
  assert.equal(calls, 0);
});

test("transport blocks every mutation method, app/provider mutation URL, unapproved query and request body before networking", async () => {
  let calls = 0;
  const fetchImpl = () => { calls += 1; throw new Error("network must remain unreachable"); };
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "get"]) {
    assert.equal(isReadOnlyProviderRequestAllowed("https://api.elevenlabs.io/v1/user", method), false);
    const result = await readOnlyProviderRequest({ url: "https://api.elevenlabs.io/v1/user", method, apiKey: ENV.ELEVENLABS_API_KEY }, fetchImpl);
    assert.equal(result.classification, "REQUEST_BLOCKED");
    assertSanitized(result);
  }
  for (const url of ["https://api.elevenlabs.io/v1/voices/add", "https://api.elevenlabs.io/v1/text-to-speech/private-id", "https://api.elevenlabs.io/v1/voices/private-id", "http://api.elevenlabs.io/v1/user", "https://evil.example/v1/user", "https://secret@api.elevenlabs.io/v1/user", "https://api.elevenlabs.io/v1/user?secret=fixture", "https://api.elevenlabs.io/v1/user#fragment", "https://api.elevenlabs.io/v2/voices?page_size=100&category=cloned", "https://api.elevenlabs.io/v2/voices?page_size=100&page_size=10", "https://api.elevenlabs.io/v2/voices?page_size=10", "https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=true"]) {
    const result = await readOnlyProviderRequest({ url, apiKey: ENV.ELEVENLABS_API_KEY }, fetchImpl);
    assert.equal(result.classification, "REQUEST_BLOCKED");
    assertSanitized(result);
  }
  assert.equal((await readOnlyProviderRequest({ url: "https://api.elevenlabs.io/v1/user", apiKey: ENV.ELEVENLABS_API_KEY, body: "fixture-body" }, fetchImpl)).classification, "REQUEST_BLOCKED");
  assert.equal(calls, 0);
});

test("complete unfiltered pagination produces only sorted hashes, digest and safe classifications", async () => {
  const rawIds = ["fixture-private-voice-z", "fixture-private-voice-a", "fixture-private-voice-m"];
  const fake = fakeProvider([
    { voices: [voice(rawIds[0]), voice(rawIds[1], { category: "premade", is_owner: false, created_at_unix: undefined })], has_more: true, next_page_token: "fixture-private-pagination-token", total_count: 999 },
    { voices: [voice(rawIds[2], { category: "generated", created_at_unix: 200 })], has_more: false, next_page_token: null, total_count: 3 }
  ]);
  const result = await runProbe("inventory", ENV, fake.fetchImpl);
  assert.equal(result.status, "PASS");
  assert.equal(result.account.identityHash, sha256(USER_ID));
  assert.equal(result.inventory.paginationComplete, true);
  assert.equal(result.inventory.pageCount, 2);
  assert.equal(result.inventory.totalVoiceCount, 3);
  assert.equal(result.inventory.ownedCustomCount, 2);
  assert.equal(result.inventory.nonAppResourceCount, 1);
  assert.deepEqual(result.inventory.voiceIdHashes, rawIds.map(sha256).sort());
  assert.equal(result.inventory.digest, sha256(rawIds.map(sha256).sort().join("\n")));
  assert.deepEqual(result.inventory.createdAtRange, { minUnix: 100, maxUnix: 200, knownCount: 2, unknownCount: 1 });
  assert.equal(fake.calls.length, 3);
  const pages = fake.calls.slice(1).map(({ url }) => new URL(url));
  assert.equal(pages[0].searchParams.get("page_size"), "100");
  assert.equal(pages[0].searchParams.has("category"), false);
  assert.equal(pages[0].searchParams.has("voice_type"), false);
  assert.equal(pages[1].searchParams.get("next_page_token"), "fixture-private-pagination-token");
  assertSanitized(result, [...rawIds, "fixture-private-pagination-token"]);
});

test("missing category, ownership, and creation time remain represented conservatively", async () => {
  const rawIds = ["fixture-unknown-owner", "fixture-unknown-category", "fixture-old-voice"];
  const fake = fakeProvider([{ voices: [voice(rawIds[0], { is_owner: undefined }), voice(rawIds[1], { category: "fixture-private-category" }), voice(rawIds[2], { created_at_unix: null })], has_more: false }]);
  const result = await runProbe("inventory", ENV, fake.fetchImpl);
  assert.equal(result.status, "PASS");
  assert.equal(result.inventory.totalVoiceCount, 3);
  assert.equal(result.inventory.unknownClassificationCount, 2);
  assert.equal(result.inventory.ownedCustomCount, 1);
  assert.deepEqual(result.inventory.unknownIdHashes, rawIds.slice(0, 2).map(sha256).sort());
  assert.equal(result.inventory.createdAtRange.unknownCount, 1);
  assertSanitized(result, [...rawIds, "fixture-private-category"]);
});

test("nonowned custom resources are UNKNOWN; only premade category proves NON_APP_RESOURCE", async () => {
  const rawIds = ["fixture-nonowned-clone", "fixture-nonowned-professional", "fixture-premade-unknown-owner"];
  const fake = fakeProvider([{ voices: [voice(rawIds[0], { is_owner: false }), voice(rawIds[1], { category: "professional", is_owner: false }), voice(rawIds[2], { category: "premade", is_owner: undefined })], has_more: false }]);
  const result = await runProbe("inventory", ENV, fake.fetchImpl);
  assert.equal(result.inventory.totalVoiceCount, 3);
  assert.equal(result.inventory.unknownClassificationCount, 2);
  assert.equal(result.inventory.nonAppResourceCount, 1);
  assert.equal(result.inventory.ownedCustomCount, 0);
  assert.deepEqual(result.inventory.unknownIdHashes, rawIds.slice(0, 2).map(sha256).sort());
  assertSanitized(result, rawIds);
});

test("empty inventory is a complete observed snapshot", async () => {
  const fake = fakeProvider([{ voices: [], has_more: false }]);
  const result = await runProbe("inventory", ENV, fake.fetchImpl);
  assert.equal(result.inventory.paginationComplete, true);
  assert.equal(result.inventory.totalVoiceCount, 0);
  assert.equal(result.inventory.digest, sha256(""));
});

test("repeated pagination tokens and duplicate IDs fail closed without claiming completeness", async () => {
  const cases = [
    { pages: [{ voices: [voice("fixture-page-one")], has_more: true, next_page_token: "fixture-token" }, { voices: [voice("fixture-page-two")], has_more: true, next_page_token: "fixture-token" }], reason: "provider_probe_pagination_token_repeated" },
    { pages: [{ voices: [voice("fixture-duplicate")], has_more: true, next_page_token: "fixture-token" }, { voices: [voice("fixture-duplicate")], has_more: false }], reason: "provider_probe_duplicate_voice_identity" }
  ];
  for (const fixture of cases) {
    const fake = fakeProvider(fixture.pages);
    const result = await runProbe("inventory", ENV, fake.fetchImpl);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.reasonCode, fixture.reason);
    assert.equal(result.inventory.paginationComplete, false);
    assertSanitized(result, ["fixture-page-one", "fixture-page-two", "fixture-duplicate", "fixture-token"]);
  }
});

test("malformed optional account does not block inventory; malformed inventory fails closed", async () => {
  for (const userPayload of [{}, { user_id: "" }, { user_id: "fixture-user-with-space raw" }, { user_id: 42 }]) {
    const fake = fakeProvider([{ voices: [], has_more: false }], userPayload);
    const result = await runProbe("inventory", ENV, fake.fetchImpl);
    assert.equal(result.account.status, "INVALID_RESPONSE");
    assert.equal(result.status, "PASS");
    assert.equal(fake.calls.length, 2);
    assertSanitized(result);
  }
  for (const [page, reason] of [
    [{ voices: [], has_more: "false" }, "provider_probe_pagination_schema_invalid"],
    [{ voices: "private-body", has_more: false }, "provider_probe_pagination_schema_invalid"],
    [{ voices: [{ name: "private-body" }], has_more: false }, "provider_probe_voice_identity_invalid"],
    [{ voices: [voice("fixture-valid")], has_more: true }, "provider_probe_pagination_token_invalid"],
    [{ voices: [voice("fixture-valid")], has_more: true, next_page_token: " " }, "provider_probe_pagination_token_invalid"],
    [{ voices: [], has_more: true, next_page_token: "fixture-token" }, "provider_probe_pagination_empty_page"]
  ]) {
    const fake = fakeProvider([page]);
    const result = await runProbe("inventory", ENV, fake.fetchImpl);
    assert.equal(result.reasonCode, reason);
    assert.equal(result.inventory.paginationComplete, false);
    assertSanitized(result, ["private-body", "fixture-valid", "fixture-token"]);
  }
});

test("provider HTTP failures expose status diagnostics without reflecting private body or thrown errors", async () => {
  for (const [status, classification] of [[401, "AUTH_FAILED"], [403, "AUTH_FAILED"], [429, "RATE_LIMITED"], [500, "PROVIDER_UNAVAILABLE"], [422, "HTTP_REJECTED"], [302, "HTTP_REJECTED"]]) {
    const response = json({ raw: ENV.ELEVENLABS_API_KEY, user_id: USER_ID }, status);
    response.text = () => { throw new Error("must not read error body"); };
    const result = await runProbe("inventory", ENV, async () => response);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.account.status, classification);
    assert.equal(result.inventoryDiagnostic.httpStatus, status);
    assert.equal(result.inventoryDiagnostic.errorCode, null);
    assert.equal(result.inventoryDiagnostic.errorType, null);
    assertSanitized(result);
  }
  const result = await runProbe("inventory", ENV, async () => { throw new Error(`${ENV.ELEVENLABS_API_KEY} ${USER_ID}`); });
  assert.equal(result.account.status, "NETWORK_FAILURE");
  assertSanitized(result);
});

test("invalid JSON, content type, advertised oversize and streamed oversize are sanitized", async () => {
  for (const response of [
    new Response(ENV.ELEVENLABS_API_KEY, { headers: { "Content-Type": "application/json" } }),
    new Response(ENV.ELEVENLABS_API_KEY, { headers: { "Content-Type": "text/html" } }),
    new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": String(5 * 1024 * 1024) } }),
    new Response("x".repeat(4 * 1024 * 1024 + 1), { headers: { "Content-Type": "application/json" } })
  ]) {
    const result = await runProbe("inventory", ENV, async () => response);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.account.status, "INVALID_RESPONSE");
    assertSanitized(result);
  }
});

test("page and resource caps fail closed", async () => {
  const pages = Array.from({ length: 50 }, (_, index) => ({ voices: [voice(`fixture-cap-${index}`)], has_more: true, next_page_token: `fixture-cap-token-${index}` }));
  const fake = fakeProvider(pages);
  const result = await runProbe("inventory", ENV, fake.fetchImpl);
  assert.equal(result.reasonCode, "provider_probe_page_cap_exceeded");
  assert.equal(result.inventory.pageCount, 50);
  assert.equal(result.inventory.paginationComplete, false);
  const oversized = fakeProvider([{ voices: Array.from({ length: 5_001 }, (_, index) => voice(`fixture-resource-${index}`)), has_more: false }]);
  const capped = await runProbe("inventory", ENV, oversized.fetchImpl);
  assert.equal(capped.reasonCode, "provider_probe_resource_cap_exceeded");
  assert.equal(capped.inventory.paginationComplete, false);
});

test("overall snapshot budget returns an incomplete controlled result without starting another page", async () => {
  const originalNow = Date.now;
  let now = originalNow();
  let calls = 0;
  Date.now = () => now;
  try {
    const fetchImpl = async (url) => {
      calls += 1;
      if (new URL(url).pathname === "/v1/user") return json(user());
      now += 45_001;
      return json({ voices: [voice("fixture-budget-voice")], has_more: true, next_page_token: "fixture-budget-token" });
    };
    const result = await runProbe("inventory", ENV, fetchImpl);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.reasonCode, "provider_probe_snapshot_timeout");
    assert.equal(result.inventory.paginationComplete, false);
    assert.equal(calls, 2);
    assertSanitized(result, ["fixture-budget-voice", "fixture-budget-token"]);
  } finally {
    Date.now = originalNow;
  }
});

test("optional user HTTP failure never prevents direct complete voices pagination", async () => {
  const fake = fakeProvider([
    { voices: [voice("fixture-direct-page-one")], has_more: true, next_page_token: "fixture-direct-token" },
    { voices: [voice("fixture-direct-page-two")], has_more: false }
  ], json({ detail: { status: "missing_permissions", message: ENV.ELEVENLABS_API_KEY, user_id: USER_ID } }, 403));
  const result = await runProbe("inventory", ENV, fake.fetchImpl);
  assert.equal(result.status, "PASS");
  assert.equal(result.account.status, "AUTH_FAILED");
  assert.equal(result.account.diagnostic.httpStatus, 403);
  assert.equal(result.account.diagnostic.errorCode, "missing_permissions");
  assert.equal(result.inventory.paginationComplete, true);
  assert.equal(result.inventory.pageCount, 2);
  assert.equal(result.inventoryHttpStatus, 200);
  assert.deepEqual(fake.calls.map(x => new URL(x.url).pathname), ["/v1/user", "/v2/voices", "/v2/voices"]);
  assertSanitized(result, ["fixture-direct-page-one", "fixture-direct-page-two", "fixture-direct-token"]);
});

test("optional user timeout has a separate budget and cannot exhaust direct inventory", async () => {
  const originalNow = Date.now;
  let now = originalNow();
  let voicesCalls = 0;
  Date.now = () => now;
  try {
    const result = await runProbe("inventory", ENV, async url => {
      if (new URL(url).pathname === "/v1/user") { now += 45_001; throw new Error(ENV.ELEVENLABS_API_KEY); }
      voicesCalls++;
      return json({ voices: [], has_more: false });
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.account.status, "NETWORK_FAILURE");
    assert.equal(voicesCalls, 1);
  } finally { Date.now = originalNow; }
});

test("voices HTTP rejection distinguishes status with safe structured code and request header", async () => {
  for (const [status, classification] of [[401, "HTTP_401_AUTH_REJECTED"], [403, "HTTP_403_ACCESS_RESTRICTED"], [429, "HTTP_429_RATE_LIMITED"], [503, "HTTP_5XX_PROVIDER_ERROR"], [422, "HTTP_OTHER_REJECTED"]]) {
    const response = new Response(JSON.stringify({ detail: { code: "missing_permissions", type: "authorization_error", message: `${ENV.ELEVENLABS_API_KEY} ${USER_ID}`, voice_id: "fixture-private-voice" } }), {
      status, headers: { "content-type": "application/json; private=" + ENV.ELEVENLABS_API_KEY, "request-id": "11111111-2222-4333-8444-555555555555" }
    });
    const fake = fakeProvider([response]);
    const result = await runProbe("inventory", ENV, fake.fetchImpl);
    assert.equal(result.status, "BLOCKED");
    assert.equal(fake.calls.length, 2);
    assert.equal(result.inventory.paginationComplete, false);
    assert.deepEqual(result.inventoryDiagnostic, { httpStatus: status, httpClassification: classification, contentType: "application/json", errorCode: "missing_permissions", errorType: "authorization_error", requestIdentifier: { header: "request-id", value: "11111111-2222-4333-8444-555555555555" }, safeErrorCategory: "authorization_error" });
    assertSanitized(result, ["fixture-private-voice"]);
  }
});

test("arbitrary structured fields, header values, MIME parameters and raw body never leak", async () => {
  for (const privateValue of [ENV.ELEVENLABS_API_KEY, USER_ID, "fixture-private@example.com", "abcdefabcdefabcdefabcdefabcdefab"]) {
    const response = new Response(JSON.stringify({ detail: { code: privateValue, status: privateValue, type: privateValue, message: privateValue, voice_id: privateValue, user_id: privateValue, request_id: privateValue } }), {
      status: 403, headers: { "content-type": "application/json; label=" + privateValue, "request-id": privateValue, "x-request-id": privateValue, "x-trace-id": privateValue }
    });
    const fake = fakeProvider([response]);
    const result = await runProbe("inventory", ENV, fake.fetchImpl);
    assert.equal(result.inventoryDiagnostic.errorCode, null);
    assert.equal(result.inventoryDiagnostic.errorType, null);
    assert.equal(result.inventoryDiagnostic.requestIdentifier, null);
    assertSanitized(result, [privateValue]);
  }
});

test("malformed, oversized, non-JSON and throwing error bodies retain sanitized HTTP classification", async () => {
  const throwing = new Response(new ReadableStream({ start(controller) { controller.error(new Error(ENV.ELEVENLABS_API_KEY)); } }), { status: 403, headers: { "content-type": "application/json" } });
  for (const response of [
    new Response(ENV.ELEVENLABS_API_KEY, { status: 403, headers: { "content-type": "application/json" } }),
    new Response(ENV.ELEVENLABS_API_KEY, { status: 403, headers: { "content-type": "text/html" } }),
    new Response(ENV.ELEVENLABS_API_KEY, { status: 403, headers: { "content-type": "application/" + ENV.ELEVENLABS_API_KEY } }),
    new Response(JSON.stringify({ detail: { code: "missing_permissions" } }), { status: 403, headers: { "content-type": "application/json", "content-length": "70000" } }),
    new Response("x".repeat(65537), { status: 403, headers: { "content-type": "application/json" } }),
    throwing
  ]) {
    const fake = fakeProvider([response]);
    const result = await runProbe("inventory", ENV, fake.fetchImpl);
    assert.equal(result.inventoryDiagnostic.httpStatus, 403);
    assert.equal(result.inventoryDiagnostic.httpClassification, "HTTP_403_ACCESS_RESTRICTED");
    assert.equal(result.inventoryDiagnostic.errorCode, null);
    assert.equal(result.inventoryDiagnostic.errorType, null);
    assertSanitized(result);
  }
});

test("later-page HTTP rejection preserves incomplete partial hashes and safe diagnostic", async () => {
  const fake = fakeProvider([
    { voices: [voice("fixture-partial-voice")], has_more: true, next_page_token: "fixture-private-token" },
    json({ detail: { code: "rate_limit_exceeded", type: "rate_limit_error", message: ENV.ELEVENLABS_API_KEY } }, 429)
  ]);
  const result = await runProbe("inventory", ENV, fake.fetchImpl);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.inventory.pageCount, 1);
  assert.equal(result.inventory.totalVoiceCount, 1);
  assert.equal(result.inventory.paginationComplete, false);
  assert.equal(result.inventoryDiagnostic.httpStatus, 429);
  assert.equal(result.inventoryDiagnostic.errorCode, "rate_limit_exceeded");
  assertSanitized(result, ["fixture-partial-voice", "fixture-private-token"]);
});

test("request identifiers cannot reflect credential fragments or known account/voice identities", async () => {
  const hexId = "abcdefabcdefabcdefabcdefabcdefab";
  const longKey = hexId + "0123456789abcdef0123456789abcdef";
  const error = extra => new Response(JSON.stringify(extra), { status: 403, headers: { "content-type": "application/json", "request-id": hexId } });
  const transport = await readOnlyProviderRequest({ url: "https://api.elevenlabs.io/v1/user", apiKey: longKey }, async () => error({}));
  assert.equal(transport.diagnostic.requestIdentifier, null);
  assert.ok(!JSON.stringify(transport).includes(hexId));
  for (const payload of [{ user_id: hexId }, { nested: { voice_id: hexId } }, { detail: { user_id: hexId } }]) {
    const result = await readOnlyProviderRequest({ url: "https://api.elevenlabs.io/v1/user", apiKey: ENV.ELEVENLABS_API_KEY }, async () => error(payload));
    assert.equal(result.diagnostic.requestIdentifier, null);
  }
  const accountFake = fakeProvider([error({})], { user_id: hexId });
  assert.equal((await runProbe("inventory", ENV, accountFake.fetchImpl)).inventoryDiagnostic.requestIdentifier, null);
  const voiceFake = fakeProvider([{ voices: [voice(hexId)], has_more: true, next_page_token: "fixture-next" }, error({})]);
  assert.equal((await runProbe("inventory", ENV, voiceFake.fetchImpl)).inventoryDiagnostic.requestIdentifier, null);
  const otherCredential = await runProbe("inventory", { ...ENV, OPENAI_API_KEY: longKey }, async url => new URL(url).pathname === "/v1/user" ? json(user()) : error({}));
  assert.equal(otherCredential.inventoryDiagnostic.requestIdentifier, null);
});
