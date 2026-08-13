#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const RELEASE_PROFILES = new Set(["local-spike", "staging", "production"]);
const STAGING_BUNDLE_ID = "com.nativeminutes.app.staging";
const STAGING_BFF_ORIGIN = "https://native-minute-staging.vercel.app";
const STAGING_CALLBACK = STAGING_BFF_ORIGIN + "/mobile/auth/callback";
const STAGING_ASSOCIATED_DOMAIN = "applinks:native-minute-staging.vercel.app";
const STAGING_ENTITLEMENTS_PATH = "App/App-Staging.entitlements";
const GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/;
const STAGING_APPLICATION_IDENTIFIER =
  "46P9QD3T3Q.com.nativeminutes.app.staging";
const LOOPBACK_URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)?/i;
const SUPABASE_VENDOR_LOOPBACK_LITERAL = "http://localhost:9999";
const RAW_SECRET_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{16,}/;
const SERVER_SECRET_MARKERS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "AZURE_SPEECH_KEY",
  "ELEVENLABS_API_KEY",
  "DATABASE_URL",
  "E2E_TEST_PASSWORD",
  "E2E_TEST_SECRET"
];
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".entitlements",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".plist",
  ".swift",
  ".ts",
  ".tsx"
]);
const AUTH_MATERIAL_PATTERN =
  /access[_-]?token|refresh[_-]?token|auth(?:entication)?[_-]?(?:code|token)|code[_-]?verifier|pkce|session|credential/i;
const PROHIBITED_AUTH_STORAGE_PATTERNS = [
  /\b(?:window\.)?localStorage\s*(?:\.|\[)/,
  /\b(?:window\.)?sessionStorage\s*(?:\.|\[)/,
  /\bindexedDB\s*\.\s*open\s*\(/,
  /["']@capacitor\/preferences["']/,
  /\bPreferences\s*\.\s*(?:get|set|remove|clear)\s*\(/,
  /\bUserDefaults(?:\s*\.\s*standard)?\s*\.\s*(?:set|data|object|string|removeObject)\s*\(/,
  /["']@capacitor\/filesystem["']/,
  /\bFilesystem\s*\.\s*(?:readFile|writeFile|appendFile)\s*\(/,
  /\bFileManager(?:\s*\.\s*default)?\b[\s\S]{0,160}\b(?:createFile|write|contents)\s*\(/
];
const COOKIE_CREDENTIAL_PATTERN =
  /\bcredentials\s*:\s*["'](?:include|same-origin)["']|\bdocument\s*\.\s*cookie\b|["']Cookie["']\s*:/i;
const WEB_AUTH_FALLBACK_PATTERN =
  /\b(?:web|browser|sameWebView)[A-Za-z0-9_]*(?:Fallback|Redirect)|\b(?:fallback|redirect)[A-Za-z0-9_]*(?:Web|Browser|WebView)|\blocation\s*\.\s*(?:assign|replace)\s*\([^)]*\/auth\/callback/i;
const RAW_AUTH_LOG_PATTERN =
  /\bconsole\s*\.\s*(?:log|info|debug|warn|error)\s*\([^;\n]*(?:accessToken|access_token|refreshToken|refresh_token|authCode|codeVerifier|pkceVerifier|authorizationHeader|cookieValue|\bsession\s*[,.)}]|\berror\s*[,.)}])/i;
const RAW_NATIVE_AUTH_LOG_PATTERN =
  /\b(?:print|debugPrint|NSLog|os_log)\s*\([^;\n]*(?:access[_-]?token|refresh[_-]?token|auth[_-]?code|code[_-]?verifier|pkce|authorization|cookie|\bsession\b)/i;
const SECRET_LIKE_ENV_NAME_PATTERN =
  /(?:^|_)(?:SECRET|SERVICE_ROLE|PRIVATE(?:_KEY)?|PASSWORD|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|API_KEY)(?:_|$)/i;
const PUBLIC_SUPABASE_KEY_NAME_PATTERN = /(?:ANON|PUBLISHABLE)_KEY/i;
const SERVICE_ROLE_REFERENCE_PATTERN = /\bservice[_-]?role\b|\bserviceRole(?:Key|Token|Client)?\b/i;
const MOBILE_BFF_COOKIE_AUTH_PATTERN =
  /\brequest\s*\.\s*cookies\b|\bcookies\s*\(|\bcookieStore\b|\bcreateSupabase(?:Route|Server)Client\s*\(|\bheaders\s*\.\s*(?:get|set|append)\s*\(\s*["']cookie["']|["']Cookie["']\s*:|\bimport\s*\{[^}]*\bcookies\b[^}]*\}\s*from\s*["']next\/headers["']/i;
const MOBILE_BFF_SERVICE_ROLE_PATTERN =
  /\bSUPABASE_SERVICE_ROLE_KEY\b|\bgetSupabaseServiceRoleKey\b|\bcreate(?:Supabase)?AdminClient\b|\bsupabaseAdmin\b|\badminClient\b|\.auth\s*\.\s*admin\b|\bfrom\s+["'][^"']*supabase\/admin["']|\bservice[_-]?role\b|\bserviceRole(?:Key|Token|Client)?\b/i;
const MOBILE_BFF_RAW_AUTH_LOG_PATTERN =
  /\bconsole\s*\.\s*(?:log|info|debug|warn|error)\s*\([^;\n]*(?:access[_-]?token|refresh[_-]?token|\btoken\b|\bsession\b|\bauthCode\b|\bcode\b|\bverifier\b|\bauthorization\b|\berror\b)\s*[,.:)}\]]/i;
const CUSTOM_AUTH_SCHEME_PATTERN =
  /\b([a-z][a-z0-9+.-]*):(?:\/\/|\/)[^\s"'`<>]*(?:auth|login|callback)[^\s"'`<>]*/i;
const PRODUCTION_READY_CLAIM_PATTERN =
  /\b(?:production|store|appStore)[_-]?(?:ready|readiness)["']?\s*[:=]\s*(?:true|["']ready["'])/i;
const AASA_CONTRACT_PATHS = [
  "public/.well-known/apple-app-site-association",
  "app/.well-known/apple-app-site-association/route.js",
  "app/.well-known/apple-app-site-association/route.ts"
];

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

    const safePath = relative(rootDir, absolutePath);

    if (options.skipTestSources && isTestSourcePath(safePath)) {
      continue;
    }

    const contents = readFileSync(absolutePath, "utf8");
    const loopbackScanContents = (options.ignoredLoopbackLiterals ?? []).reduce(
      (value, literal) => value.split(literal).join(""),
      contents
    );

    if (options.checkLoopback && LOOPBACK_URL_PATTERN.test(loopbackScanContents)) {
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

function isTestSourcePath(filePath) {
  return /(?:^|\/)(?:__tests__|test|tests)(?:\/|$)|\.(?:spec|test)\.[^.]+$/i.test(filePath);
}

function isPublicSupabaseKeyName(name) {
  return (
    PUBLIC_SUPABASE_KEY_NAME_PATTERN.test(name) &&
    !/(?:SERVICE_ROLE|PRIVATE|SECRET|PASSWORD)/i.test(name)
  );
}

function extractEnvironmentNames(contents) {
  const names = new Set();
  const patterns = [
    /\b(?:import\.meta\.env|process\.env)\.([A-Z][A-Z0-9_]*)\b/g,
    /\b(__[A-Z][A-Z0-9_]*__)\b/g,
    /["']((?:VITE|MOBILE|PUBLIC)_[A-Z][A-Z0-9_]*)["']/g
  ];

  for (const pattern of patterns) {
    for (const match of contents.matchAll(pattern)) {
      names.add(match[1].replace(/^__|__$/g, ""));
    }
  }

  return [...names];
}

function hasCustomAuthScheme(contents) {
  const pattern = new RegExp(CUSTOM_AUTH_SCHEME_PATTERN.source, "gi");

  for (const match of contents.matchAll(pattern)) {
    const scheme = match[1].toLowerCase();

    if (scheme !== "http" && scheme !== "https" && scheme !== "capacitor") {
      return true;
    }
  }

  return false;
}

function plistHasCustomUrlScheme(contents) {
  const sectionPattern =
    /<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/gi;

  for (const section of contents.matchAll(sectionPattern)) {
    const valuePattern = /<string>\s*([^<]+?)\s*<\/string>/gi;

    for (const value of section[1].matchAll(valuePattern)) {
      const scheme = value[1].trim().toLowerCase();

      if (scheme && scheme !== "http" && scheme !== "https") {
        return true;
      }
    }
  }

  return false;
}

function scanMobileAuthSafety(rootDir, findings) {
  const candidateFiles = [
    ...listFiles(resolve(rootDir, "apps/mobile/src")),
    ...["apps/mobile/vite.config.js", "apps/mobile/vite.config.mjs", "apps/mobile/vite.config.ts"]
      .map((filePath) => resolve(rootDir, filePath))
      .filter((filePath) => existsSync(filePath)),
    ...listFiles(resolve(rootDir, "ios/App/App"))
      .filter((filePath) => !relative(resolve(rootDir, "ios/App/App"), filePath).startsWith("public/")),
    ...listFiles(resolve(rootDir, "ios/App/MobileAuthSessionStore"))
  ];

  for (const absolutePath of candidateFiles) {
    if (!TEXT_EXTENSIONS.has(fileExtension(absolutePath))) {
      continue;
    }

    const safePath = relative(rootDir, absolutePath);

    if (isTestSourcePath(safePath)) {
      continue;
    }

    const contents = readFileSync(absolutePath, "utf8");
    const authSensitive =
      /auth|callback|credential|login|pkce|session|token/i.test(safePath) ||
      AUTH_MATERIAL_PATTERN.test(contents);

    const isNonSecretInstallMarker =
      safePath.endsWith("/MobileAuthInstallGeneration.swift") &&
      !/(?:access[_-]?token|refresh[_-]?token|code[_-]?verifier|pkce|credential|\bsession\b)/i.test(contents);

    if (
      authSensitive &&
      !isNonSecretInstallMarker &&
      PROHIBITED_AUTH_STORAGE_PATTERNS.some((pattern) => pattern.test(contents))
    ) {
      addFinding(findings, "mobile_auth_insecure_storage", safePath);
    }

    if (COOKIE_CREDENTIAL_PATTERN.test(contents)) {
      addFinding(findings, "mobile_cookie_credential_fallback", safePath);
    }

    if (WEB_AUTH_FALLBACK_PATTERN.test(contents)) {
      addFinding(findings, "mobile_web_auth_fallback", safePath);
    }

    if (
      authSensitive &&
      (RAW_AUTH_LOG_PATTERN.test(contents) || RAW_NATIVE_AUTH_LOG_PATTERN.test(contents))
    ) {
      addFinding(findings, "mobile_raw_auth_log", safePath);
    }

    if (
      SERVER_SECRET_MARKERS.some((marker) => contents.includes(marker)) ||
      SERVICE_ROLE_REFERENCE_PATTERN.test(contents)
    ) {
      addFinding(findings, "mobile_service_secret_reference", safePath);
    }

    if (RAW_SECRET_PATTERN.test(contents)) {
      addFinding(findings, "mobile_raw_secret_pattern", safePath);
    }

    if (
      extractEnvironmentNames(contents).some(
        (name) => SECRET_LIKE_ENV_NAME_PATTERN.test(name) && !isPublicSupabaseKeyName(name)
      )
    ) {
      addFinding(findings, "mobile_secret_like_environment", safePath);
    }
  }
}

function scanMobileMiddlewareBoundary(rootDir, findings) {
  const middlewarePath = resolve(rootDir, "middleware.ts");

  if (!existsSync(middlewarePath)) {
    addFinding(findings, "mobile_middleware_boundary_missing", "middleware.ts");
    return;
  }

  const contents = readFileSync(middlewarePath, "utf8");
  const exactBypass =
    /if\s*\(\s*isMobileApiPath\(pathname\)\s*\)\s*\{\s*return\s+nextResponse\(request\)\s*;?\s*\}/m;
  const bypassIndex = contents.search(exactBypass);
  const cookieClientIndex = contents.search(/\bcreateServerClient\s*(?:<|\()/);

  if (bypassIndex < 0 || (cookieClientIndex >= 0 && bypassIndex > cookieClientIndex)) {
    addFinding(findings, "mobile_middleware_cookie_boundary_missing", "middleware.ts");
  }
}

function scanMobileBffSafety(rootDir, findings) {
  const exactFiles = ["lib/supabase/mobile-route.ts", "lib/supabase/mobile-route.js"]
    .map((filePath) => resolve(rootDir, filePath))
    .filter((filePath) => existsSync(filePath));
  const candidateFiles = new Set([
    ...listFiles(resolve(rootDir, "app/api/mobile")),
    ...listFiles(resolve(rootDir, "lib/mobile")),
    ...exactFiles
  ]);

  for (const absolutePath of candidateFiles) {
    if (!TEXT_EXTENSIONS.has(fileExtension(absolutePath))) {
      continue;
    }

    const safePath = relative(rootDir, absolutePath);

    if (isTestSourcePath(safePath)) {
      continue;
    }

    const contents = readFileSync(absolutePath, "utf8");

    if (MOBILE_BFF_COOKIE_AUTH_PATTERN.test(contents)) {
      addFinding(findings, "mobile_bff_cookie_auth_fallback", safePath);
    }

    if (MOBILE_BFF_SERVICE_ROLE_PATTERN.test(contents)) {
      addFinding(findings, "mobile_bff_service_role_reference", safePath);
    }

    if (MOBILE_BFF_RAW_AUTH_LOG_PATTERN.test(contents)) {
      addFinding(findings, "mobile_bff_raw_auth_log", safePath);
    }
  }
}

function hasDevelopmentAuthCallback(value, keyPath = "") {
  if (typeof value === "string") {
    const callbackLike =
      /callback|redirect/i.test(keyPath) ||
      /(?:auth|login)[^\s"']*(?:callback|redirect)|(?:callback|redirect)[^\s"']*(?:auth|login)/i.test(value);

    if (!callbackLike) {
      return false;
    }

    try {
      const url = new URL(value);
      return (
        url.protocol === "http:" ||
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "::1"
      );
    } catch {
      return false;
    }
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) =>
    hasDevelopmentAuthCallback(nestedValue, keyPath ? keyPath + "." + key : key)
  );
}

function parseProductionUniversalLink(mobileProfile) {
  if (
    !mobileProfile ||
    typeof mobileProfile !== "object" ||
    mobileProfile.authCallbackMode !== "universal-link" ||
    typeof mobileProfile.authCallbackUri !== "string"
  ) {
    return null;
  }

  try {
    const callback = new URL(mobileProfile.authCallbackUri);
    const bff = new URL(mobileProfile.bffBaseUrl);
    const validCallback =
      callback.protocol === "https:" &&
      callback.origin === bff.origin &&
      callback.pathname.startsWith("/") &&
      callback.pathname !== "/" &&
      !callback.username &&
      !callback.password &&
      !callback.port &&
      !callback.search &&
      !callback.hash;

    return validCallback ? callback : null;
  } catch {
    return null;
  }
}

function readXcodeBuildSetting(contents, name) {
  const match = contents.match(new RegExp("(?:^|\\n)\\s*" + name + "\\s*=\\s*([^;\\n]+);", "m"));

  if (!match) {
    return null;
  }

  const value = match[1].trim();
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function resolveEntitlementsPath(rootDir, value) {
  if (!value) {
    return null;
  }

  const projectRoot = resolve(rootDir, "ios/App");
  const normalized = value
    .replace(/^\$\((?:SRCROOT|PROJECT_DIR)\)\/?/, "")
    .replace(/^\$\{(?:SRCROOT|PROJECT_DIR)\}\/?/, "");

  if (!normalized || /\$\(|\$\{/.test(normalized)) {
    return null;
  }

  const absolutePath = resolve(projectRoot, normalized);
  const relativePath = relative(projectRoot, absolutePath);

  if (
    relativePath.startsWith("..") ||
    fileExtension(absolutePath) !== ".entitlements" ||
    !existsSync(absolutePath)
  ) {
    return null;
  }

  return absolutePath;
}

function findProductionTargetContract(rootDir, expectedBundleId) {
  const projectPath = resolve(rootDir, "ios/App/App.xcodeproj/project.pbxproj");

  if (!expectedBundleId || !existsSync(projectPath)) {
    return null;
  }

  const project = readFileSync(projectPath, "utf8");
  const appTarget = project.match(
    /([A-F0-9]+) \/\*\s*App\s*\*\/ = \{\s*isa = PBXNativeTarget;([\s\S]*?)\n\s*\};/
  );
  const appTargetId = appTarget?.[1];
  const projectTargets = project.match(/targets\s*=\s*\(([\s\S]*?)\);/)?.[1] ?? "";

  if (!appTargetId || !new RegExp("\\b" + appTargetId + "\\b").test(projectTargets)) {
    return null;
  }

  const configurationListId = appTarget?.[2].match(
    /buildConfigurationList\s*=\s*([A-F0-9]+)\b/
  )?.[1];

  if (!configurationListId) {
    return null;
  }

  const configurationList = project.match(
    new RegExp(
      configurationListId +
        " \\/\\* Build configuration list for PBXNativeTarget \\\"App\\\" \\*\\/ = \\{([\\s\\S]*?)\\n\\s*\\};"
    )
  );
  const releaseConfigurationId = configurationList?.[1].match(
    /([A-F0-9]+) \/\*\s*Release\s*\*\//
  )?.[1];

  if (!releaseConfigurationId) {
    return null;
  }

  const releaseConfiguration = project.match(
    new RegExp(
      releaseConfigurationId +
        " \\/\\*\\s*Release\\s*\\*\\/ = \\{\\s*isa = XCBuildConfiguration;([\\s\\S]*?)\\n\\s*\\};"
    )
  );
  const settings = releaseConfiguration?.[1] ?? "";
  const bundleId = readXcodeBuildSetting(settings, "PRODUCT_BUNDLE_IDENTIFIER");
  const developmentTeam = readXcodeBuildSetting(settings, "DEVELOPMENT_TEAM");

  if (
    bundleId !== expectedBundleId ||
    !developmentTeam ||
    !/^[A-Z0-9]{10}$/.test(developmentTeam)
  ) {
    return null;
  }

  return {
    appIdentifier: developmentTeam + "." + bundleId,
    entitlementPath: resolveEntitlementsPath(
      rootDir,
      readXcodeBuildSetting(settings, "CODE_SIGN_ENTITLEMENTS")
    )
  };
}

function findTargetBuildSettings(rootDir, configurationName) {
  const projectPath = resolve(rootDir, "ios/App/App.xcodeproj/project.pbxproj");

  if (!existsSync(projectPath)) {
    return null;
  }

  const project = readFileSync(projectPath, "utf8");
  const pattern = new RegExp(
    "[A-F0-9]+ \\/\\*\\s*" + configurationName +
      "\\s*\\*\\/ = \\{\\s*isa = XCBuildConfiguration;([\\s\\S]*?)\\n\\s*\\};",
    "g"
  );

  for (const match of project.matchAll(pattern)) {
    const settings = match[1];

    if (readXcodeBuildSetting(settings, "PRODUCT_BUNDLE_IDENTIFIER")) {
      return settings;
    }
  }

  return null;
}

function scanStagingConfigurationContract({
  rootDir,
  capacitorProfile,
  mobileProfile,
  mobileProfilePath,
  webDir,
  webMetadata,
  nativeMetadata,
  generatedConfig,
  findings
}) {
  let currentRevision = null;
  let currentTreeDirty = null;

  if (existsSync(resolve(rootDir, ".git"))) {
    try {
      currentRevision = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: rootDir,
        encoding: "utf8"
      }).trim();
      currentTreeDirty = execFileSync(
        "git",
        ["status", "--porcelain", "--untracked-files=normal"],
        { cwd: rootDir, encoding: "utf8" }
      ).trim().length > 0;
    } catch {
      currentTreeDirty = true;
    }
  }

  const sourceMappingValid =
    capacitorProfile?.appId === STAGING_BUNDLE_ID &&
    mobileProfile?.bundleId === STAGING_BUNDLE_ID &&
    mobileProfile?.xcodeConfiguration === "Staging" &&
    mobileProfile?.capacitorProfile === "staging";

  if (!sourceMappingValid) {
    addFinding(findings, "staging_profile_identity_mismatch", mobileProfilePath);
  }

  const callback = parseProductionUniversalLink(mobileProfile);

  if (
    mobileProfile?.bffBaseUrl !== STAGING_BFF_ORIGIN ||
    mobileProfile?.authCallbackUri !== STAGING_CALLBACK ||
    callback?.href !== STAGING_CALLBACK
  ) {
    addFinding(findings, "staging_https_auth_callback_mismatch", mobileProfilePath);
  }

  for (const [metadata, path] of [
    [webMetadata, webDir + "/mobile-build.json"],
    [nativeMetadata, "ios/App/App/public/mobile-build.json"]
  ]) {
    if (
      metadata?.bundleId !== STAGING_BUNDLE_ID ||
      metadata?.xcodeConfiguration !== "Staging" ||
      metadata?.capacitorProfile !== "staging" ||
      metadata?.authCallbackMode !== "universal-link" ||
      metadata?.authConfigured !== true ||
      !GIT_REVISION_PATTERN.test(metadata?.sourceRevision ?? "") ||
      metadata?.sourceDirty !== false ||
      (currentRevision !== null && metadata?.sourceRevision !== currentRevision)
    ) {
      addFinding(findings, "staging_build_metadata_mismatch", path);
    }
  }

  if (
    webMetadata?.sourceRevision !== nativeMetadata?.sourceRevision ||
    webMetadata?.sourceDirty !== nativeMetadata?.sourceDirty
  ) {
    addFinding(findings, "staging_build_provenance_mismatch", "mobile-build.json");
  }

  if (currentTreeDirty === true) {
    addFinding(findings, "staging_source_tree_dirty", ".git");
  }

  if (generatedConfig?.appId !== STAGING_BUNDLE_ID) {
    addFinding(findings, "staging_capacitor_app_id_mismatch", "ios/App/App/capacitor.config.json");
  }

  const stagingSettings = findTargetBuildSettings(rootDir, "Staging");
  const stagingInfoPlist = readXcodeBuildSetting(stagingSettings ?? "", "INFOPLIST_FILE");
  const stagingDevelopmentTeam = readXcodeBuildSetting(
    stagingSettings ?? "",
    "DEVELOPMENT_TEAM"
  );
  const stagingEntitlementsSetting = readXcodeBuildSetting(
    stagingSettings ?? "",
    "CODE_SIGN_ENTITLEMENTS"
  );
  const stagingEntitlementsPath = resolveEntitlementsPath(
    rootDir,
    stagingEntitlementsSetting
  );

  if (
    readXcodeBuildSetting(stagingSettings ?? "", "PRODUCT_BUNDLE_IDENTIFIER") !==
      STAGING_BUNDLE_ID ||
    stagingInfoPlist !== "App/Info.plist" ||
    readXcodeBuildSetting(stagingSettings ?? "", "CODE_SIGN_STYLE") !== "Automatic" ||
    !stagingDevelopmentTeam ||
    !/^[A-Z0-9]{10}$/.test(stagingDevelopmentTeam)
  ) {
    addFinding(findings, "staging_xcode_configuration_mismatch", "ios/App/App.xcodeproj/project.pbxproj");
  }

  const associatedDomains = stagingEntitlementsPath
    ? [...readFileSync(stagingEntitlementsPath, "utf8").matchAll(/<string>\s*([^<]+?)\s*<\/string>/gi)]
        .map((match) => match[1].trim())
    : [];

  if (
    stagingEntitlementsSetting !== STAGING_ENTITLEMENTS_PATH ||
    associatedDomains.length !== 1 ||
    associatedDomains[0] !== STAGING_ASSOCIATED_DOMAIN
  ) {
    addFinding(
      findings,
      "staging_associated_domains_mismatch",
      stagingEntitlementsSetting ?? "ios/App/App/App-Staging.entitlements"
    );
  }

  if (
    !inspectExactAasaContract(
      rootDir,
      new URL(STAGING_CALLBACK).pathname,
      STAGING_APPLICATION_IDENTIFIER
    )
  ) {
    addFinding(
      findings,
      "staging_aasa_contract_mismatch",
      "public/.well-known/apple-app-site-association"
    );
  }

  for (const configurationName of ["Debug", "Release"]) {
    const settings = findTargetBuildSettings(rootDir, configurationName);

    if (readXcodeBuildSetting(settings ?? "", "CODE_SIGN_ENTITLEMENTS")) {
      addFinding(
        findings,
        "staging_associated_domains_isolation_mismatch",
        "ios/App/App.xcodeproj/project.pbxproj"
      );
    }
  }

  const stagingInfoPath = resolve(rootDir, "ios/App", stagingInfoPlist ?? "");

  if (
    !stagingInfoPlist ||
    !existsSync(stagingInfoPath) ||
    plistHasCustomUrlScheme(readFileSync(stagingInfoPath, "utf8"))
  ) {
    addFinding(findings, "staging_debug_scheme_leak", stagingInfoPlist ?? "ios/App/App/Info.plist");
  }

  if (
    webDir &&
    existsSync(resolve(rootDir, webDir)) &&
    !directoryContainsLiteral(resolve(rootDir, webDir), STAGING_CALLBACK)
  ) {
    addFinding(findings, "staging_https_auth_callback_missing", webDir);
  }
}

function hasAssociatedDomainsContract(targetContract, callbackHost) {
  if (!targetContract?.entitlementPath || !callbackHost) {
    return false;
  }

  const contents = readFileSync(targetContract.entitlementPath, "utf8");
  return [...contents.matchAll(/<string>\s*applinks:([^<\s]+)\s*<\/string>/gi)]
    .some((match) => match[1].toLowerCase() === callbackHost.toLowerCase());
}

function pathPatternMatches(pattern, callbackPath) {
  if (typeof pattern !== "string" || (pattern !== "*" && !pattern.startsWith("/"))) {
    return false;
  }

  const escaped = [...pattern]
    .map((character) => {
      if (character === "*") {
        return ".*";
      }

      if (character === "?") {
        return ".";
      }

      return /[.+^${}()|[\]\\]/.test(character) ? "\\" + character : character;
    })
    .join("");
  return new RegExp("^" + escaped + "$").test(callbackPath);
}

function aasaDetailDecision(detail, callbackPath, expectedAppIdentifier) {
  if (!detail || typeof detail !== "object") {
    return null;
  }

  const appIdentifiers = [
    ...(typeof detail.appID === "string" ? [detail.appID] : []),
    ...(Array.isArray(detail.appIDs) ? detail.appIDs : [])
  ].filter((value) => typeof value === "string");
  if (!appIdentifiers.includes(expectedAppIdentifier)) {
    return null;
  }

  if (Array.isArray(detail.components)) {
    for (const component of detail.components) {
      const pattern = component && typeof component === "object" ? component["/"] : null;

      if (pathPatternMatches(pattern, callbackPath)) {
        return component.exclude === true ? false : true;
      }
    }

    return null;
  }

  if (Array.isArray(detail.paths)) {
    for (const entry of detail.paths) {
      if (typeof entry !== "string") {
        continue;
      }

      const excluded = entry.startsWith("NOT ");
      const pattern = excluded ? entry.slice("NOT ".length) : entry;

      if (pathPatternMatches(pattern, callbackPath)) {
        return excluded ? false : true;
      }
    }
  }

  return null;
}

function inspectAasaContract(rootDir, callbackPath, expectedAppIdentifier) {
  const existingPaths = AASA_CONTRACT_PATHS.filter((filePath) =>
    existsSync(resolve(rootDir, filePath))
  );

  if (existingPaths.length === 0) {
    return "missing";
  }

  const staticPath = existingPaths.find(
    (filePath) => filePath === "public/.well-known/apple-app-site-association"
  );
  if (!staticPath || !callbackPath || !expectedAppIdentifier) {
    return "invalid";
  }

  try {
    const payload = JSON.parse(readFileSync(resolve(rootDir, staticPath), "utf8"));
    const details = payload?.applinks?.details;
    if (!Array.isArray(details)) {
      return "invalid";
    }

    for (const detail of details) {
      const decision = aasaDetailDecision(detail, callbackPath, expectedAppIdentifier);

      if (decision !== null) {
        return decision ? "valid" : "invalid";
      }
    }

    return "invalid";
  } catch {
    return "invalid";
  }
}

function inspectExactAasaContract(rootDir, callbackPath, expectedAppIdentifier) {
  const existingPaths = AASA_CONTRACT_PATHS.filter((filePath) =>
    existsSync(resolve(rootDir, filePath))
  );

  if (
    existingPaths.length !== 1 ||
    existingPaths[0] !== "public/.well-known/apple-app-site-association"
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      readFileSync(resolve(rootDir, existingPaths[0]), "utf8")
    );
    const applinks = payload?.applinks;
    const details = applinks?.details;
    const detail = Array.isArray(details) ? details[0] : null;
    const appIdentifiers = detail?.appIDs;
    const components = detail?.components;
    const component = Array.isArray(components) ? components[0] : null;
    const hasExactKeys = (value, keys) =>
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

    return (
      hasExactKeys(payload, ["applinks"]) &&
      hasExactKeys(applinks, ["details"]) &&
      Array.isArray(details) &&
      details.length === 1 &&
      hasExactKeys(detail, ["appIDs", "components"]) &&
      Array.isArray(appIdentifiers) &&
      appIdentifiers.length === 1 &&
      appIdentifiers[0] === expectedAppIdentifier &&
      Array.isArray(components) &&
      components.length === 1 &&
      hasExactKeys(component, ["/"]) &&
      component["/"] === callbackPath
    );
  } catch {
    return false;
  }
}

function directoryHasPattern(directory, pattern) {
  return listFiles(directory)
    .filter((filePath) => TEXT_EXTENSIONS.has(fileExtension(filePath)))
    .some((filePath) => pattern.test(readFileSync(filePath, "utf8")));
}

function directoryContainsLiteral(directory, literal) {
  return Boolean(literal) && listFiles(directory)
    .filter((filePath) => [".html", ".js"].includes(fileExtension(filePath)))
    .some((filePath) => readFileSync(filePath, "utf8").includes(literal));
}

function scanProductionAuthContract({
  rootDir,
  mobileProfile,
  mobileProfilePath,
  webDir,
  webMetadata,
  nativeMetadata,
  expectedBundleId,
  findings
}) {
  const serializedProfile = JSON.stringify(mobileProfile ?? {});
  const webDirectory = webDir ? resolve(rootDir, webDir) : null;
  const productionCallback = parseProductionUniversalLink(mobileProfile);
  const profileHasHttpsCallback = productionCallback !== null;
  const bundleHasHttpsCallback =
    webDirectory && existsSync(webDirectory)
      ? directoryContainsLiteral(webDirectory, mobileProfile?.authCallbackUri)
      : false;
  const targetContract = findProductionTargetContract(rootDir, expectedBundleId);
  const associatedDomainsPresent = hasAssociatedDomainsContract(
    targetContract,
    productionCallback?.hostname ?? null
  );
  const aasaContractState = inspectAasaContract(
    rootDir,
    productionCallback?.pathname ?? null,
    targetContract?.appIdentifier ?? null
  );
  const aasaContractPresent = aasaContractState === "valid";
  const webAuthMetadataValid =
    webMetadata?.authCallbackMode === "universal-link" && webMetadata?.authConfigured === true;
  const nativeAuthMetadataValid =
    nativeMetadata?.authCallbackMode === "universal-link" && nativeMetadata?.authConfigured === true;

  if (hasDevelopmentAuthCallback(mobileProfile)) {
    addFinding(
      findings,
      "production_development_auth_callback",
      mobileProfilePath
    );
  }

  if (!associatedDomainsPresent) {
    addFinding(findings, "production_associated_domains_missing", "ios/**/*.entitlements");
  }

  if (aasaContractState === "missing") {
    addFinding(findings, "production_aasa_contract_missing", "apple-app-site-association");
  } else if (aasaContractState === "invalid") {
    addFinding(findings, "production_aasa_contract_invalid", "apple-app-site-association");
  }

  if (!profileHasHttpsCallback || !bundleHasHttpsCallback) {
    addFinding(findings, "production_https_auth_callback_missing", mobileProfilePath);
  }

  if (!webAuthMetadataValid) {
    addFinding(findings, "production_auth_build_metadata_invalid", webDir + "/mobile-build.json");
  }

  if (!nativeAuthMetadataValid) {
    addFinding(
      findings,
      "production_auth_build_metadata_invalid",
      "ios/App/App/public/mobile-build.json"
    );
  }

  const infoPlistPath = resolve(rootDir, "ios/App/App/Info.plist");

  if (
    existsSync(infoPlistPath) &&
    plistHasCustomUrlScheme(readFileSync(infoPlistPath, "utf8"))
  ) {
    addFinding(findings, "production_custom_scheme_callback", "ios/App/App/Info.plist");
  }

  if (hasCustomAuthScheme(serializedProfile)) {
    addFinding(findings, "production_custom_scheme_callback", mobileProfilePath);
  }

  if (webDirectory && existsSync(webDirectory)) {
    for (const absolutePath of listFiles(webDirectory)) {
      if (!TEXT_EXTENSIONS.has(fileExtension(absolutePath))) {
        continue;
      }

      const contents = readFileSync(absolutePath, "utf8");
      const safePath = relative(rootDir, absolutePath);

      if (hasCustomAuthScheme(contents)) {
        addFinding(findings, "production_custom_scheme_callback", safePath);
      }

      if (WEB_AUTH_FALLBACK_PATTERN.test(contents)) {
        addFinding(findings, "production_web_auth_fallback", safePath);
      }
    }
  }

  if (WEB_AUTH_FALLBACK_PATTERN.test(serializedProfile)) {
    addFinding(findings, "production_web_auth_fallback", mobileProfilePath);
  }

  if (
    (!associatedDomainsPresent || !aasaContractPresent || !profileHasHttpsCallback ||
      !bundleHasHttpsCallback || !webAuthMetadataValid || !nativeAuthMetadataValid) &&
    (PRODUCTION_READY_CLAIM_PATTERN.test(serializedProfile) ||
      directoryHasPattern(resolve(rootDir, "apps/mobile/src"), PRODUCTION_READY_CLAIM_PATTERN))
  ) {
    addFinding(
      findings,
      "production_readiness_claim_without_universal_links",
      mobileProfilePath
    );
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
  let webMetadata = null;

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

    webMetadata = readJson(rootDir, webDir + "/mobile-build.json", findings, "mobile_build_metadata");

    if (webMetadata?.profile !== profile) {
      addFinding(findings, "mobile_build_profile_mismatch", webDir + "/mobile-build.json");
    }

    if (expectedBffOrigin && webMetadata?.bffOrigin !== expectedBffOrigin) {
      addFinding(findings, "mobile_build_bff_mismatch", webDir + "/mobile-build.json");
    }

    scanFiles(rootDir, webDir, findings, {
      checkLoopback: true,
      loopbackCategory: "bundle_loopback_url",
      ignoredLoopbackLiterals: [SUPABASE_VENDOR_LOOPBACK_LITERAL],
      checkSecretMarkers: true,
      secretMarkerCategory: "bundle_server_secret_marker",
      rawSecretCategory: "bundle_raw_secret_pattern"
    });
  }

  scanFiles(rootDir, "apps/mobile/src", findings, {
    checkLoopback: true,
    loopbackCategory: "mobile_source_loopback_url",
    skipTestSources: true,
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

  scanMobileAuthSafety(rootDir, findings);
  scanMobileBffSafety(rootDir, findings);
  scanMobileMiddlewareBoundary(rootDir, findings);

  if (profile === "production") {
    scanProductionAuthContract({
      rootDir,
      mobileProfile,
      mobileProfilePath,
      webDir,
      webMetadata,
      nativeMetadata,
      expectedBundleId:
        typeof generatedConfig?.appId === "string" ? generatedConfig.appId : null,
      findings
    });
  } else if (profile === "staging") {
    scanStagingConfigurationContract({
      rootDir,
      capacitorProfile,
      mobileProfile,
      mobileProfilePath,
      webDir,
      webMetadata,
      nativeMetadata,
      generatedConfig,
      findings
    });
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
