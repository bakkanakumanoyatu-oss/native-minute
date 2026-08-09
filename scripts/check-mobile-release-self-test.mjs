#!/usr/bin/env node

import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { runMobileReleaseGuard } from "./check-mobile-release.mjs";

const BFF_ORIGIN = "https://native-minute.example";
const PRODUCTION_CALLBACK = BFF_ORIGIN + "/mobile/auth/callback";
const STAGING_ORIGIN = "https://native-minute-staging.vercel.app";
const STAGING_CALLBACK = STAGING_ORIGIN + "/mobile/auth/callback";
const APP_BUNDLE_ID = "com.nativeminutes.app";
const STAGING_BUNDLE_ID = "com.nativeminutes.app.staging";
const DEVELOPMENT_TEAM = "ABCDE12345";
const APP_IDENTIFIER = DEVELOPMENT_TEAM + "." + APP_BUNDLE_ID;

function writeFixture(rootDir, filePath, contents) {
  const absolutePath = resolve(rootDir, filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents, "utf8");
}

function writeJsonFixture(rootDir, filePath, value) {
  writeFixture(rootDir, filePath, JSON.stringify(value));
}

function writeUniversalLinkFixture(rootDir, options = {}) {
  const callback = new URL(options.callback ?? PRODUCTION_CALLBACK);
  const entitlementHost = options.entitlementHost ?? callback.hostname;
  const appIdentifier = options.appIdentifier ?? APP_IDENTIFIER;
  const detail = {
    ...(options.useAppIDs ? { appIDs: [appIdentifier] } : { appID: appIdentifier }),
    ...(options.paths
      ? { paths: options.paths }
      : {
          components: options.components ?? [{ "/": callback.pathname }]
        })
  };

  writeFixture(
    rootDir,
    "ios/App/App/App.entitlements",
    [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<plist version=\"1.0\"><dict>",
      "<key>com.apple.developer.associated-domains</key>",
      `<array><string>applinks:${entitlementHost}</string></array>`,
      "</dict></plist>"
    ].join("\n")
  );
  writeFixture(
    rootDir,
    "ios/App/App.xcodeproj/project.pbxproj",
    [
      "// !$*UTF8*$!",
      "{ objects = {",
      "  ABCDEF0123456789ABCDEF00 /* App */ = {",
      "    isa = PBXNativeTarget;",
      "    buildConfigurationList = ABCDEF0123456789ABCDEF02 /* Build configuration list for PBXNativeTarget \"App\" */;",
      "    name = App;",
      "  };",
      "  ABCDEF0123456789ABCDEF01 /* Release */ = {",
      "    isa = XCBuildConfiguration;",
      "    buildSettings = {",
      ...(options.wireEntitlements === false
        ? []
        : ["      CODE_SIGN_ENTITLEMENTS = App/App.entitlements;"]),
      `      DEVELOPMENT_TEAM = ${DEVELOPMENT_TEAM};`,
      `      PRODUCT_BUNDLE_IDENTIFIER = ${APP_BUNDLE_ID};`,
      "    };",
      "    name = Release;",
      "  };",
      "  ABCDEF0123456789ABCDEF02 /* Build configuration list for PBXNativeTarget \"App\" */ = {",
      "    isa = XCConfigurationList;",
      "    buildConfigurations = (",
      "      ABCDEF0123456789ABCDEF01 /* Release */,",
      "    );",
      "    defaultConfigurationName = Release;",
      "  };",
      "  ABCDEF0123456789ABCDEF03 /* Project object */ = {",
      "    isa = PBXProject;",
      "    targets = (",
      "      ABCDEF0123456789ABCDEF00 /* App */,",
      "    );",
      "  };",
      "}; rootObject = ABCDEF0123456789ABCDEF03 /* Project object */; }"
    ].join("\n")
  );
  writeJsonFixture(
    rootDir,
    "public/.well-known/apple-app-site-association",
    {
      applinks: {
        details: [detail]
      }
    }
  );
}

function writeInfoPlistFixture(rootDir, customScheme = null) {
  const urlTypes = customScheme
    ? [
        "<key>CFBundleURLTypes</key>",
        "<array><dict>",
        "<key>CFBundleURLSchemes</key>",
        `<array><string>${customScheme}</string></array>`,
        "</dict></array>"
      ].join("\n")
    : "";

  writeFixture(
    rootDir,
    "ios/App/App/Info.plist",
    [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<plist version=\"1.0\"><dict>",
      urlTypes,
      "</dict></plist>"
    ].join("\n")
  );
}

function writeStagingXcodeFixture(rootDir, options = {}) {
  writeFixture(
    rootDir,
    "ios/App/App.xcodeproj/project.pbxproj",
    [
      "// !$*UTF8*$!",
      "{ objects = {",
      "  ABCDEF0123456789ABCDEF01 /* Staging */ = {",
      "    isa = XCBuildConfiguration;",
      "    buildSettings = {",
      `      INFOPLIST_FILE = ${options.infoPlist ?? "App/Info.plist"};`,
      ...(options.developmentTeam ? [`      DEVELOPMENT_TEAM = ${DEVELOPMENT_TEAM};`] : []),
      ...(options.entitlements ? ["      CODE_SIGN_ENTITLEMENTS = App/App.entitlements;"] : []),
      `      PRODUCT_BUNDLE_IDENTIFIER = ${options.bundleId ?? STAGING_BUNDLE_ID};`,
      "      SWIFT_ACTIVE_COMPILATION_CONDITIONS = \"\";",
      "    };",
      "    name = Staging;",
      "  };",
      "}; }"
    ].join("\n")
  );
}

function createFixture(rootDir, profile = "production", options = {}) {
  const localCallback = "com.nativeminutes.app.debug:/auth/callback";
  const bffOrigin = options.bffOrigin ?? BFF_ORIGIN;
  const productionCallback =
    options.productionCallback ?? bffOrigin + "/mobile/auth/callback";

  writeJsonFixture(rootDir, "config/capacitor-profiles.json", {
    "local-spike": {
      webDir: "apps/mobile/dist"
    },
    staging: {
      appId: options.stagingCapacitorAppId ?? STAGING_BUNDLE_ID,
      webDir: "apps/mobile/dist"
    },
    production: {
      webDir: "apps/mobile/dist"
    }
  });
  writeJsonFixture(rootDir, "config/mobile-profiles.json", {
    "local-spike": {
      bffBaseUrl: bffOrigin,
      authCallbackMode: "custom-scheme",
      authCallbackUri: localCallback
    },
    staging: {
      bundleId: options.stagingBundleId ?? STAGING_BUNDLE_ID,
      xcodeConfiguration: options.stagingConfiguration ?? "Staging",
      capacitorProfile: options.stagingProfile ?? "staging",
      bffBaseUrl: STAGING_ORIGIN,
      authCallbackMode: "universal-link",
      authCallbackUri: options.stagingCallback ?? STAGING_CALLBACK
    },
    production: {
      bffBaseUrl: bffOrigin,
      authCallbackMode: "universal-link",
      authCallbackUri: productionCallback
    }
  });
  writeFixture(rootDir, "apps/mobile/dist/index.html", "<div id=\"root\"></div>");
  writeFixture(
    rootDir,
    "apps/mobile/dist/assets/app.js",
    profile === "production"
      ? `const callback = ${JSON.stringify(productionCallback)};`
      : profile === "staging"
        ? `const callback = ${JSON.stringify(options.stagingCallback ?? STAGING_CALLBACK)};`
        : `const callback = ${JSON.stringify(localCallback)};`
  );
  const metadata =
    profile === "staging"
      ? {
          profile,
          bundleId: STAGING_BUNDLE_ID,
          xcodeConfiguration: "Staging",
          capacitorProfile: "staging",
          bffOrigin: STAGING_ORIGIN,
          authCallbackMode: "universal-link",
          authConfigured: true
        }
      : {
          profile,
          bffOrigin,
          authCallbackMode: profile === "production" ? "universal-link" : "custom-scheme",
          authConfigured: true
        };
  writeJsonFixture(rootDir, "apps/mobile/dist/mobile-build.json", {
    ...metadata
  });
  writeFixture(rootDir, "apps/mobile/src/App.tsx", "export const appName = \"Native Minutes\";");
  writeJsonFixture(rootDir, "ios/App/App/capacitor.config.json", {
    appId: profile === "staging" ? STAGING_BUNDLE_ID : APP_BUNDLE_ID,
    appName: "Native Minutes",
    webDir: "apps/mobile/dist"
  });
  writeJsonFixture(rootDir, "ios/App/App/public/mobile-build.json", {
    ...metadata
  });
  writeInfoPlistFixture(rootDir, options.customScheme ?? null);
  writeFixture(
    rootDir,
    "middleware.ts",
    [
      "function isMobileApiPath(pathname) { return pathname.startsWith('/api/mobile/'); }",
      "function nextResponse(request) { return request; }",
      "export function middleware(request) {",
      "  const pathname = request.nextUrl.pathname;",
      "  if (isMobileApiPath(pathname)) { return nextResponse(request); }",
      "  return createServerClient();",
      "}"
    ].join("\n")
  );

  if (options.universalLinks !== false) {
    writeUniversalLinkFixture(rootDir, {
      callback: productionCallback,
      ...options.universalLink
    });
  }

  if (profile === "staging") {
    writeStagingXcodeFixture(rootDir, options.stagingXcode);
  }
}

function withFixture(run) {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "native-minute-mobile-release-"));

  try {
    run(fixtureRoot);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function assertPass(rootDir, options, message) {
  const findings = runMobileReleaseGuard({ rootDir, ...options });

  if (findings.length > 0) {
    throw new Error(message + " Findings: " + JSON.stringify(findings));
  }
}

function assertCategories(rootDir, options, categories, message) {
  const findings = runMobileReleaseGuard({ rootDir, ...options });
  const actual = new Set(findings.map((finding) => finding.category));
  const missing = categories.filter((category) => !actual.has(category));

  if (missing.length > 0) {
    throw new Error(message + " Missing categories: " + missing.join(", "));
  }
}

try {
  withFixture((rootDir) => {
    createFixture(rootDir, "staging", { universalLinks: false });
    assertPass(
      rootDir,
      { profile: "staging" },
      "Expected the Unit A staging identity/configuration fixture to pass."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "staging", {
      universalLinks: false,
      stagingCallback: "https://wrong.example/mobile/auth/callback",
      stagingCapacitorAppId: APP_BUNDLE_ID,
      stagingXcode: { bundleId: APP_BUNDLE_ID }
    });
    assertCategories(
      rootDir,
      { profile: "staging" },
      [
        "staging_profile_identity_mismatch",
        "staging_https_auth_callback_mismatch",
        "staging_xcode_configuration_mismatch"
      ],
      "Expected staging profile/configuration mismatches to fail closed."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    assertPass(
      rootDir,
      { profile: "production" },
      "Expected the Universal Link production fixture to pass."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production", {
      bffOrigin: STAGING_ORIGIN,
      productionCallback: STAGING_CALLBACK
    });
    assertPass(
      rootDir,
      { profile: "production" },
      "Expected the selected staging HTTPS origin to pass the synthetic release fixture."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production", {
      universalLink: { useAppIDs: true }
    });
    assertPass(
      rootDir,
      { profile: "production" },
      "Expected a wired Universal Link fixture using AASA appIDs to pass."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeJsonFixture(rootDir, "config/mobile-profiles.json", {
      "local-spike": {
        bffBaseUrl: BFF_ORIGIN,
        authCallbackMode: "custom-scheme",
        authCallbackUri: "com.nativeminutes.app.debug:/auth/callback"
      },
      production: {
        bffBaseUrl: BFF_ORIGIN,
        auth: {
          authCallbackMode: "universal-link",
          authCallbackUri: PRODUCTION_CALLBACK
        }
      }
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      ["production_https_auth_callback_missing"],
      "Expected nested callback-like fields to fail the exact production callback contract."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production", {
      universalLink: { appIdentifier: DEVELOPMENT_TEAM + ".com.example.other" }
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      ["production_aasa_contract_invalid"],
      "Expected an AASA app identifier for another bundle to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production", {
      productionCallback: "https://auth.example/mobile/auth/callback"
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      ["production_https_auth_callback_missing"],
      "Expected a production callback on a host other than the BFF host to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production", {
      universalLink: { entitlementHost: "auth.example" }
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      ["production_associated_domains_missing"],
      "Expected an Associated Domains entitlement for another host to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production", {
      universalLink: { components: [{ "/": "/wrong/callback" }] }
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      ["production_aasa_contract_invalid"],
      "Expected an AASA rule for another path to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production", {
      universalLink: {
        components: [
          { "/": "/mobile/auth/callback", exclude: true },
          { "/": "*" }
        ]
      }
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      ["production_aasa_contract_invalid"],
      "Expected an ordered AASA exclusion before a wildcard allow rule to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production", {
      universalLink: {
        paths: ["NOT /mobile/auth/callback", "*"]
      }
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      ["production_aasa_contract_invalid"],
      "Expected an ordered legacy AASA path exclusion before a wildcard to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production", {
      universalLink: { wireEntitlements: false }
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      ["production_associated_domains_missing"],
      "Expected an entitlement file not wired to the Release target to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeJsonFixture(
      rootDir,
      "public/.well-known/apple-app-site-association",
      { applinks: { details: [] } }
    );
    assertCategories(
      rootDir,
      { profile: "production" },
      ["production_aasa_contract_invalid"],
      "Expected an empty AASA contract to remain blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeFixture(
      rootDir,
      "ios/App/MobileAuthSessionStore/ios/Sources/UnsafePlugin.swift",
      [
        "let accessToken = UserDefaults.standard.string(forKey: \"session\")",
        "print(accessToken)"
      ].join("\n")
    );
    assertCategories(
      rootDir,
      { profile: "production" },
      ["mobile_auth_insecure_storage", "mobile_raw_auth_log"],
      "Expected unsafe native auth persistence and logging to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeFixture(
      rootDir,
      "apps/mobile/src/auth/unsafe-key.ts",
      "export const configuredKey = \"sb_secret_fixture_material_1234567890\";"
    );
    assertCategories(
      rootDir,
      { profile: "production" },
      ["mobile_raw_secret_pattern", "mobile_source_raw_secret_pattern"],
      "Expected a modern Supabase secret key format to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeFixture(
      rootDir,
      "middleware.ts",
      [
        "function isMobileApiPath(pathname) { return pathname.startsWith('/api/mobile/'); }",
        "export function middleware(request) {",
        "  const pathname = request.nextUrl.pathname;",
        "  return createServerClient({ cookies: request.cookies });",
        "}"
      ].join("\n")
    );
    assertCategories(
      rootDir,
      { profile: "production" },
      ["mobile_middleware_cookie_boundary_missing"],
      "Expected a missing unconditional mobile middleware bypass to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "local-spike", {
      customScheme: "com.nativeminutes.app.debug",
      universalLinks: false
    });
    writeJsonFixture(rootDir, "apps/mobile/dist/mobile-build.json", {
      profile: "local-spike",
      bffOrigin: "https://native-minute-preview.example"
    });
    writeJsonFixture(rootDir, "ios/App/App/public/mobile-build.json", {
      profile: "local-spike",
      bffOrigin: "https://native-minute-preview.example"
    });
    assertPass(
      rootDir,
      {
        profile: "local-spike",
        bffBaseUrlOverride: "https://native-minute-preview.example"
      },
      "Expected the debug custom-scheme local-spike fixture to pass."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "local-spike", { universalLinks: false });
    writeFixture(
      rootDir,
      "apps/mobile/dist/assets/app.js",
      "const vendorDefault = \"http://localhost:9999\";"
    );
    assertPass(
      rootDir,
      { profile: "local-spike" },
      "Expected the exact bundled Supabase vendor loopback literal to be ignored."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "local-spike", { universalLinks: false });
    writeFixture(
      rootDir,
      "apps/mobile/dist/assets/app.js",
      [
        "const vendorDefault = \"http://localhost:9999\";",
        "const unsafeFallback = \"http://127.0.0.1:3000\";"
      ].join("\n")
    );
    assertCategories(
      rootDir,
      { profile: "local-spike" },
      ["bundle_loopback_url"],
      "Expected every non-vendor bundled loopback URL to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "local-spike", { universalLinks: false });
    writeFixture(
      rootDir,
      "apps/mobile/dist/assets/app.js",
      "const vendorDefault = \"http://localhost:9999\";"
    );
    writeFixture(
      rootDir,
      "apps/mobile/src/auth/vendor-fallback.ts",
      "export const unsafeSourceFallback = \"http://localhost:9999\";"
    );
    assertCategories(
      rootDir,
      { profile: "local-spike" },
      ["mobile_source_loopback_url"],
      "Expected the vendor loopback literal to remain blocked in mobile source."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    assertCategories(
      rootDir,
      {
        profile: "production",
        bffBaseUrlOverride: "https://native-minute-preview.example"
      },
      ["bff_override_not_local_spike"],
      "Expected a production BFF override to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production", {
      customScheme: "com.nativeminutes.app.debug",
      universalLinks: false
    });
    writeJsonFixture(rootDir, "config/mobile-profiles.json", {
      "local-spike": {
        bffBaseUrl: "https://native-minute.example"
      },
      production: {
        bffBaseUrl: "https://native-minute.example",
        authCallbackUrl: "com.nativeminutes.app.debug:/auth/callback",
        productionReady: true,
        webAuthFallback: true
      }
    });
    writeFixture(
      rootDir,
      "apps/mobile/dist/assets/app.js",
      "const callback = \"com.nativeminutes.app.debug:/auth/callback\";"
    );
    assertCategories(
      rootDir,
      { profile: "production" },
      [
        "production_associated_domains_missing",
        "production_aasa_contract_missing",
        "production_https_auth_callback_missing",
        "production_custom_scheme_callback",
        "production_web_auth_fallback",
        "production_readiness_claim_without_universal_links"
      ],
      "Expected an incomplete production auth redirect contract to be blocked."
    );
  });

  const insecureStorageFixtures = [
    "const session = localStorage.getItem(\"mobile-auth-session\");",
    "const request = indexedDB.open(\"mobile-auth-session\");",
    [
      "import { Preferences } from \"@capacitor/preferences\";",
      "void Preferences.set({ key: \"mobile-auth-session\", value: session });"
    ].join("\n"),
    "void Filesystem.writeFile({ path: \"mobile-auth-session\", data: session });",
    "UserDefaults.standard.set(session, forKey: \"mobile-auth-session\")",
    "FileManager.default.createFile(atPath: path, contents: sessionData)"
  ];

  for (const fixture of insecureStorageFixtures) {
    withFixture((rootDir) => {
      createFixture(rootDir, "production");
      writeFixture(rootDir, "apps/mobile/src/lib/mobile-auth-session.ts", fixture);
      assertCategories(
        rootDir,
        { profile: "production" },
        ["mobile_auth_insecure_storage"],
        "Expected insecure auth persistence to be blocked."
      );
    });
  }

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeFixture(
      rootDir,
      "apps/mobile/src/lib/mobile-auth-client.ts",
      [
        "const mobileCredentialName = import.meta.env.MOBILE_AUTH_TOKEN;",
        "const serverOnlyName = \"SUPABASE_SERVICE_ROLE_KEY\";",
        "const request = fetch(\"/api/mobile/scripts\", { credentials: \"include\" });",
        "function report(accessToken) { console.debug(accessToken); }",
        "const webAuthFallback = () => location.replace(\"/auth/callback\");"
      ].join("\n")
    );
    assertCategories(
      rootDir,
      { profile: "production" },
      [
        "mobile_secret_like_environment",
        "mobile_service_secret_reference",
        "mobile_source_service_role_reference",
        "mobile_cookie_credential_fallback",
        "mobile_raw_auth_log",
        "mobile_web_auth_fallback"
      ],
      "Expected unsafe mobile auth source patterns to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeFixture(
      rootDir,
      "app/api/mobile/scripts/route.ts",
      "export function GET(request) { return request.cookies.get(\"mobile-session\"); }"
    );
    writeFixture(
      rootDir,
      "lib/mobile/unsafe-auth.ts",
      [
        "const client = createSupabaseServerClient();",
        "function report(session, code) { console.info(session, code); }"
      ].join("\n")
    );
    writeFixture(
      rootDir,
      "lib/supabase/mobile-route.ts",
      "const adminClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);"
    );
    assertCategories(
      rootDir,
      { profile: "production" },
      [
        "mobile_bff_cookie_auth_fallback",
        "mobile_bff_service_role_reference",
        "mobile_bff_raw_auth_log"
      ],
      "Expected unsafe mobile BFF auth patterns to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeFixture(
      rootDir,
      "app/api/mobile/scripts/route.test.ts",
      "const ignoredTest = request.cookies;"
    );
    writeFixture(
      rootDir,
      "lib/mobile/mobile-route.spec.ts",
      "console.info(session); const adminClient = createSupabaseAdminClient();"
    );
    assertPass(
      rootDir,
      { profile: "production" },
      "Expected mobile BFF test fixtures to be excluded from release scanning."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeJsonFixture(rootDir, "config/mobile-profiles.json", {
      "local-spike": {
        bffBaseUrl: "https://native-minute.example"
      },
      production: {
        bffBaseUrl: "https://native-minute.example",
        authCallbackUrl: "http://localhost:3000/auth/callback"
      }
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      ["production_development_auth_callback"],
      "Expected a development HTTP auth callback in the production profile to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeJsonFixture(rootDir, "config/mobile-profiles.json", {
      "local-spike": {
        bffBaseUrl: "https://native-minute.example"
      },
      production: {
        authCallbackUrl: "https://auth.example/mobile/auth/callback"
      }
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      ["bff_url_missing"],
      "Expected a missing production HTTPS BFF to be blocked."
    );
  });

  withFixture((rootDir) => {
    createFixture(rootDir, "production");
    writeJsonFixture(rootDir, "config/capacitor-profiles.json", {
      production: {
        webDir: "apps/mobile/dist",
        server: {
          url: "http://localhost:3000",
          cleartext: true,
          allowNavigation: ["localhost"]
        }
      }
    });
    writeJsonFixture(rootDir, "config/mobile-profiles.json", {
      production: {
        bffBaseUrl: "http://localhost:3000",
        authCallbackUrl: "https://auth.example/mobile/auth/callback"
      }
    });
    writeFixture(
      rootDir,
      "apps/mobile/dist/assets/app.js",
      "const endpoint = \"http://localhost:3000\";"
    );
    writeJsonFixture(rootDir, "ios/App/App/capacitor.config.json", {
      server: {
        url: "http://localhost:3000",
        cleartext: true,
        allowNavigation: ["localhost"]
      }
    });
    assertCategories(
      rootDir,
      { profile: "production" },
      [
        "capacitor_server_url",
        "capacitor_cleartext",
        "capacitor_allow_navigation",
        "bff_not_https",
        "bff_loopback_host",
        "bundle_loopback_url",
        "native_server_url",
        "native_cleartext",
        "native_allow_navigation",
        "native_loopback_url"
      ],
      "Expected localhost and hosted-web release fallbacks to be blocked."
    );
  });

  console.log(
    "PASS: mobile release guard self-test covered production, staging, local-spike, and blocked auth fixtures."
  );
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown_fixture_failure";
  console.error("FAIL: mobile release guard self-test failed: " + reason);
  process.exitCode = 1;
}
