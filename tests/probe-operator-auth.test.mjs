import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { isAuthorizedProbe, PROBE_PATH } from "../lib/operations/probe-operator-auth.mjs";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const key = publicKey.export({ type: "spki", format: "pem" });
const now = 1_790_000_000_000;
const env = { VERCEL_ENV: "production", VERCEL_URL: "probe.example.invalid" };
function signed(mode = "inventory") {
  const timestamp = String(now);
  const nonce = randomBytes(16).toString("base64url");
  const path = `${PROBE_PATH}?mode=${mode}`;
  const message = `GET\n${env.VERCEL_URL}\n${path}\n${timestamp}\n${nonce}`;
  return new Request(`https://${env.VERCEL_URL}${path}`, { headers: {
    "x-native-minute-probe-time": timestamp,
    "x-native-minute-probe-nonce": nonce,
    "x-native-minute-probe-signature": sign(null, Buffer.from(message), privateKey).toString("base64url")
  } });
}
test("only exact signed Production deployment GET is authorized", () => {
  for (const mode of ["selector", "inventory"]) assert.equal(isAuthorizedProbe(signed(mode), env, now, key), true);
  const request = signed();
  assert.equal(isAuthorizedProbe(new Request(request.url), env, now, key), false);
  assert.equal(isAuthorizedProbe(request, { ...env, VERCEL_ENV: "preview" }, now, key), false);
  assert.equal(isAuthorizedProbe(request, { ...env, VERCEL_URL: "native-minute.vercel.app" }, now, key), false);
  assert.equal(isAuthorizedProbe(request, env, now + 120_001, key), false);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal(isAuthorizedProbe(new Request(request.url, { method, headers: request.headers }), env, now, key), false);
  }
  for (const path of [`${PROBE_PATH}?mode=inventory&extra=1`, `${PROBE_PATH}?mode=selector`, "/api/create-voice", "/auth/callback"]) {
    assert.equal(isAuthorizedProbe(new Request(`https://${env.VERCEL_URL}${path}`, { headers: request.headers }), env, now, key), false);
  }
});
