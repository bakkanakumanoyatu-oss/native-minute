#!/usr/bin/env node

import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";

const baseUrl = new URL(process.env.PERFORMANCE_TIMING_BASE_URL || "http://localhost:3000");
const storageStatePath = process.env.PERFORMANCE_TIMING_STORAGE_STATE || "tests/e2e/.auth/user.json";
const scriptId = process.env.PERFORMANCE_TIMING_SCRIPT_ID?.trim();
const takeId = process.env.PERFORMANCE_TIMING_TAKE_ID?.trim();
const scriptAudioId = process.env.PERFORMANCE_TIMING_SCRIPT_AUDIO_ID?.trim();

async function readStorageStateCookies() {
  try {
    const raw = await fs.readFile(storageStatePath, "utf8");
    const state = JSON.parse(raw);

    if (!Array.isArray(state.cookies)) {
      return [];
    }

    return state.cookies
      .filter((cookie) => typeof cookie.name === "string" && typeof cookie.value === "string")
      .filter((cookie) => cookieMatchesHost(cookie, baseUrl.hostname))
      .map((cookie) => `${cookie.name}=${cookie.value}`);
  } catch {
    return [];
  }
}

function cookieMatchesHost(cookie, host) {
  const domain = String(cookie.domain ?? "").replace(/^\./, "");

  if (!domain) {
    return true;
  }

  return host === domain || host.endsWith(`.${domain}`);
}

function withBase(path) {
  return new URL(path, baseUrl).toString();
}

function buildRequests() {
  const requests = [
    { label: "scripts.page", method: "GET", path: "/scripts" },
    { label: "progress.page", method: "GET", path: "/progress" },
    {
      label: "evaluate.route.validation",
      method: "POST",
      path: "/api/evaluate",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }
  ];

  if (scriptId) {
    requests.push(
      { label: "listen.page", method: "GET", path: `/scripts/${scriptId}/listen` },
      { label: "record.page", method: "GET", path: `/scripts/${scriptId}/record` }
    );
  }

  if (scriptId && takeId) {
    requests.push({ label: "review.page", method: "GET", path: `/scripts/${scriptId}/review/${takeId}` });
  }

  if (takeId) {
    requests.push({ label: "takeAudio.route", method: "GET", path: `/api/takes/${takeId}/audio` });
  }

  if (scriptAudioId) {
    requests.push({ label: "scriptAudio.route", method: "GET", path: `/api/script-audio/${scriptAudioId}` });
  }

  return requests;
}

async function timeRequest(request, cookieHeader) {
  const headers = {
    ...(request.headers ?? {})
  };

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const start = performance.now();
  const response = await fetch(withBase(request.path), {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual"
  });
  const durationMs = performance.now() - start;

  await response.body?.cancel();

  return {
    label: request.label,
    method: request.method,
    path: request.path,
    status: response.status,
    location: response.headers.get("location") ?? null,
    durationMs: Math.round(durationMs)
  };
}

const cookieParts = await readStorageStateCookies();
const cookieHeader = cookieParts.join("; ");
const results = [];

for (const request of buildRequests()) {
  results.push(await timeRequest(request, cookieHeader));
}

console.log(JSON.stringify(
  {
    baseUrl: baseUrl.toString(),
    storageStatePath,
    authenticatedCookieCount: cookieParts.length,
    optionalInputs: {
      scriptId: Boolean(scriptId),
      takeId: Boolean(takeId),
      scriptAudioId: Boolean(scriptAudioId)
    },
    note:
      cookieParts.length > 0
        ? "HTTP status and client-side request duration only. Read the app server console for [timing] labels."
        : "No storageState cookies were found. Protected pages will redirect or return 401; use the manual runbook for authenticated timing.",
    results
  },
  null,
  2
));
