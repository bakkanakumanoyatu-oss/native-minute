#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const RELEASE_PROFILES = new Set(["local-spike", "production"]);
const LOOPBACK_URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?/i;
const RAW_SECRET_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}/;
const SERVER_SECRET_MARKERS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "AZURE_SPEECH_KEY",
  "ELEVENLABS_API_KEY",
  "DATABASE_URL",
  "E2E_TEST_PASSWORD",
  "E2E_TEST_SECRET"
];
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".map", ".mjs", ".ts", ".tsx"]);

function addFinding(findings, category, path) {
  findings.push({ category, path });
}

function readJson(rootDir, filePath, findings, category) {
  const absolutePath = resolve(rootDir, filePath);

  if (!existsSync(absolutePath)) {
    addFinding(findings, category + "_missing", filePath);
    return null;
  }

  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    addFinding(findings, category + "_invalid", filePath);
    return null;
  }
}

function listFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const files = [];

  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...listFiles(path));
    } else if (stats.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function fileExtension(filePath) {
  const dotIndex = filePath.lastIndexOf(".");
  return dotIndex >= 0 ? filePath.slice(dotIndex).toLowerCase() : "";
}

function scanFiles(rootDir, directoryPath, findings, options) {
  const directory = resolve(rootDir, directoryPath);

  for (const absolutePath of listFiles(directory)) {
    if (!TEXT_EXTENSIONS.has(fileExtension(absolutePath))) {
      continue;
    }

    const contents = readFileSync(absolutePath, "utf8");
    const safePath = relative(rootDir, absolutePath);

    if (options.checkLoopback && LOOPBACK_URL_PATTERN.test(contents)) {
      addFinding(findings, options.loopbackCategory, safePath);
    }

    if (options.checkSecretMarkers) {
      if (SERVER_SECRET_MARKERS.some((marker) => contents.includes(marker))) {
        addFinding(findings, options.secretMarkerCategory, safePath);
      }

      if (RAW_SECRET_PATTERN.test(contents)) {
        addFinding(findings, options.rawSecretCategory, safePath);
      }
    }
  }
}

function validateBffUrl(value, profilePath, findings) {
  if (typeof value !== "string") {
    addFinding(findings, "bff_url_missing", profilePath);
    return null;
  }

  try {
    const url = new URL(value);
    const originOnly = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;

    if (url.protocol !== "https:") {
      addFinding(findings, "bff_not_https", profilePath);
    }

    if (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    ) {
      addFinding(findings, "bff_loopback_host", profilePath);
    }

    if (!originOnly) {
      addFinding(findings, "bff_not_origin_only", profilePath);
    }

    return url.origin;
  } catch {
    addFinding(findings, "bff_url_invalid", profilePath);
    return null;
  }
}

function validateServerConfig(server, path, findings, prefix) {
  if (!server || typeof server !== "object") {
    return;
  }

  if (Object.hasOwn(server, "url")) {
    addFinding(findings, prefix + "_server_url", path);
  }

  if (server.cleartext === true) {
    addFinding(findings, prefix + "_cleartext", path);
  }

  if (Array.isArray(server.allowNavigation) && server.allowNavigation.length > 0) {
    addFinding(findings, prefix + "_allow_navigation", path);
  }
}

export function runMobileReleaseGuard(options = {}) {
  const rootDir = options.rootDir ?? DEFAULT_ROOT;
  const profile = options.profile ?? "production";
  const bffBaseUrlOverride = options.bffBaseUrlOverride?.trim() || null;
  const findings = [];

  if (!RELEASE_PROFILES.has(profile)) {
    addFinding(findings, "unsupported_release_profile", "profile");
    return findings;
  }

  const capacitorProfilesPath = "config/capacitor-profiles.json";
  const mobileProfilesPath = "config/mobile-profiles.json";
  const capacitorProfiles = readJson(rootDir, capacitorProfilesPath, findings, "capacitor_profiles");
  const mobileProfiles = readJson(rootDir, mobileProfilesPath, findings, "mobile_profiles");
  const capacitorProfile = capacitorProfiles?.[profile];
  const mobileProfile = mobileProfiles?.[profile];
  const profilePath = capacitorProfilesPath + "#" + profile;
  const mobileProfilePath = mobileProfilesPath + "#" + profile;

  if (!capacitorProfile || typeof capacitorProfile !== "object") {
    addFinding(findings, "capacitor_profile_missing", profilePath);
  }

  if (!mobileProfile || typeof mobileProfile !== "object") {
    addFinding(findings, "mobile_profile_missing", mobileProfilePath);
  }

  if (capacitorProfile && typeof capacitorProfile === "object") {
    validateServerConfig(capacitorProfile.server, profilePath, findings, "capacitor");
  }

  if (bffBaseUrlOverride && profile !== "local-spike") {
    addFinding(findings, "bff_override_not_local_spike", mobileProfilePath);
  }

  const expectedBffOrigin = validateBffUrl(
    bffBaseUrlOverride || mobileProfile?.bffBaseUrl,
    bffBaseUrlOverride ? "MOBILE_BFF_BASE_URL" : mobileProfilePath,
    findings
  );
  const webDir =
    capacitorProfile && typeof capacitorProfile.webDir === "string"
      ? capacitorProfile.webDir
      : null;

  if (!webDir) {
    addFinding(findings, "web_dir_missing", profilePath);
  } else {
    const webDirectory = resolve(rootDir, webDir);
    const indexPath = resolve(webDirectory, "index.html");
    const javascriptAssets = listFiles(webDirectory).filter((filePath) => fileExtension(filePath) === ".js");

    if (!existsSync(webDirectory)) {
      addFinding(findings, "web_dir_not_built", webDir);
    }

    if (!existsSync(indexPath)) {
      addFinding(findings, "web_index_missing", relative(rootDir, indexPath));
    }

    if (javascriptAssets.length === 0) {
      addFinding(findings, "web_javascript_missing", webDir);
    }

    const metadata = readJson(rootDir, webDir + "/mobile-build.json", findings, "mobile_build_metadata");

    if (metadata?.profile !== profile) {
      addFinding(findings, "mobile_build_profile_mismatch", webDir + "/mobile-build.json");
    }

    if (expectedBffOrigin && metadata?.bffOrigin !== expectedBffOrigin) {
      addFinding(findings, "mobile_build_bff_mismatch", webDir + "/mobile-build.json");
    }

    scanFiles(rootDir, webDir, findings, {
      checkLoopback: true,
      loopbackCategory: "bundle_loopback_url",
      checkSecretMarkers: true,
      secretMarkerCategory: "bundle_server_secret_marker",
      rawSecretCategory: "bundle_raw_secret_pattern"
    });
  }

  scanFiles(rootDir, "apps/mobile/src", findings, {
    checkLoopback: false,
    loopbackCategory: "mobile_source_loopback_url",
    checkSecretMarkers: true,
    secretMarkerCategory: "mobile_source_service_role_reference",
    rawSecretCategory: "mobile_source_raw_secret_pattern"
  });

  const generatedConfigPath = "ios/App/App/capacitor.config.json";
  const generatedConfig = readJson(rootDir, generatedConfigPath, findings, "native_generated_config");

  if (generatedConfig && typeof generatedConfig === "object") {
    validateServerConfig(generatedConfig.server, generatedConfigPath, findings, "native");
    const serializedConfig = JSON.stringify(generatedConfig);

    if (LOOPBACK_URL_PATTERN.test(serializedConfig)) {
      addFinding(findings, "native_loopback_url", generatedConfigPath);
    }

    if (SERVER_SECRET_MARKERS.some((marker) => serializedConfig.includes(marker))) {
      addFinding(findings, "native_server_secret_marker", generatedConfigPath);
    }
  }

  const nativeMetadataPath = "ios/App/App/public/mobile-build.json";
  const nativeMetadata = readJson(rootDir, nativeMetadataPath, findings, "native_mobile_build_metadata");

  if (nativeMetadata?.profile !== profile) {
    addFinding(findings, "native_mobile_profile_mismatch", nativeMetadataPath);
  }

  if (expectedBffOrigin && nativeMetadata?.bffOrigin !== expectedBffOrigin) {
    addFinding(findings, "native_mobile_bff_mismatch", nativeMetadataPath);
  }

  return findings
    .filter(
      (finding, index, allFindings) =>
        allFindings.findIndex(
          (candidate) =>
            candidate.category === finding.category && candidate.path === finding.path
        ) === index
    )
    .sort((left, right) =>
      (left.category + left.path).localeCompare(right.category + right.path)
    );
}

function parseProfile(args) {
  const inline = args.find((arg) => arg.startsWith("--profile="));

  if (inline) {
    return inline.slice("--profile=".length);
  }

  const index = args.indexOf("--profile");
  return index >= 0 ? args[index + 1] : "production";
}

function runCli() {
  const profile = parseProfile(process.argv.slice(2));
  const findings = runMobileReleaseGuard({
    profile,
    bffBaseUrlOverride: process.env.MOBILE_BFF_BASE_URL
  });

  if (findings.length > 0) {
    console.error("FAIL: mobile release guard found blocked categories.");

    for (const finding of findings) {
      console.error("- " + finding.category + ": " + finding.path);
    }

    process.exitCode = 1;
    return;
  }

  console.log("PASS: mobile " + profile + " bundle and generated iOS config passed release guards.");
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;

if (executedPath === import.meta.url) {
  runCli();
}
