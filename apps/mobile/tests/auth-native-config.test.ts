import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DEBUG_CALLBACK_URI = "com.nativeminutes.app.debug://auth/callback";
const STAGING_CALLBACK_URI =
  "https://native-minute-staging.vercel.app/mobile/auth/callback";
const PRODUCTION_BUNDLE_ID = "com.nativeminutes.app";
const STAGING_BUNDLE_ID = "com.nativeminutes.app.staging";

function readRepositoryFile(path: string) {
  return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

function targetBuildSettings(project: string, configuration: "Debug" | "Staging" | "Release") {
  const matches = project.matchAll(
    new RegExp(
      "[A-F0-9]+ \\/\\* " + configuration +
        " \\*\\/ = \\{\\s*isa = XCBuildConfiguration;([\\s\\S]*?)\\n\\s*\\};",
      "g"
    )
  );

  for (const match of matches) {
    if (match[1].includes("PRODUCT_BUNDLE_IDENTIFIER")) {
      return match[1];
    }
  }

  throw new Error(`Missing App target ${configuration} build settings.`);
}

describe("native mobile auth configuration", () => {
  it("maps Debug, staging, and production profiles to exact callback contracts", () => {
    const profiles = JSON.parse(readRepositoryFile("config/mobile-profiles.json")) as Record<
      string,
      {
        authCallbackMode: string;
        authCallbackUri: string | null;
        bundleId: string;
        xcodeConfiguration: string;
        capacitorProfile: string;
      }
    >;

    expect(profiles["local-spike"]).toMatchObject({
      authCallbackMode: "custom-scheme",
      authCallbackUri: DEBUG_CALLBACK_URI
    });
    expect(profiles.staging).toEqual({
      bundleId: STAGING_BUNDLE_ID,
      xcodeConfiguration: "Staging",
      capacitorProfile: "staging",
      bffBaseUrl: "https://native-minute-staging.vercel.app",
      authCallbackMode: "universal-link",
      authCallbackUri: STAGING_CALLBACK_URI
    });
    expect(profiles.production).toMatchObject({
      bundleId: PRODUCTION_BUNDLE_ID,
      xcodeConfiguration: "Release",
      capacitorProfile: "production",
      authCallbackMode: "unconfigured",
      authCallbackUri: null
    });
  });

  it("maps each Capacitor profile to the matching app identity", () => {
    const profiles = JSON.parse(readRepositoryFile("config/capacitor-profiles.json")) as Record<
      string,
      { appId: string; webDir: string }
    >;

    expect(profiles["local-spike"]).toMatchObject({
      appId: PRODUCTION_BUNDLE_ID,
      webDir: "apps/mobile/dist"
    });
    expect(profiles.staging).toEqual({
      appId: STAGING_BUNDLE_ID,
      webDir: "apps/mobile/dist"
    });
    expect(profiles.production).toEqual({
      appId: PRODUCTION_BUNDLE_ID,
      webDir: "apps/mobile/dist"
    });
  });

  it("keeps the Staging Xcode configuration release-like and identity-exact", () => {
    const project = readRepositoryFile("ios/App/App.xcodeproj/project.pbxproj");
    const debug = targetBuildSettings(project, "Debug");
    const staging = targetBuildSettings(project, "Staging");
    const release = targetBuildSettings(project, "Release");

    expect(debug).toContain("INFOPLIST_FILE = \"App/Info-Debug.plist\"");
    expect(debug).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${PRODUCTION_BUNDLE_ID}`);
    expect(debug).toContain("SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG");

    expect(staging).toContain("INFOPLIST_FILE = App/Info.plist");
    expect(staging).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${STAGING_BUNDLE_ID}`);
    expect(staging).toContain('SWIFT_ACTIVE_COMPILATION_CONDITIONS = ""');
    expect(staging).not.toContain("DEVELOPMENT_TEAM");
    expect(staging).not.toContain("CODE_SIGN_ENTITLEMENTS");

    expect(release).toContain("INFOPLIST_FILE = App/Info.plist");
    expect(release).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${PRODUCTION_BUNDLE_ID}`);
    expect(release).not.toContain("DEVELOPMENT_TEAM");
    expect(release).not.toContain("CODE_SIGN_ENTITLEMENTS");
  });

  it("registers the exact debug scheme and forwards cold/warm URLs to the native bridge", () => {
    const debugInfoPlist = readRepositoryFile("ios/App/App/Info-Debug.plist");
    const releaseInfoPlist = readRepositoryFile("ios/App/App/Info.plist");
    const appDelegate = readRepositoryFile("ios/App/App/AppDelegate.swift");
    const lifecyclePlugin = readRepositoryFile(
      "ios/App/MobileAuthSessionStore/ios/Sources/MobileAuthSessionStorePlugin/MobileAuthLifecyclePlugin.swift"
    );

    expect(debugInfoPlist).toContain("com.nativeminutes.app.debug");
    expect(releaseInfoPlist).not.toContain("CFBundleURLTypes");
    expect(releaseInfoPlist).not.toContain("com.nativeminutes.app.debug");
    expect(appDelegate).toContain("ApplicationDelegateProxy.shared.application");
    expect(lifecyclePlugin).toContain("Notification.Name.capacitorOpenURL");
    expect(lifecyclePlugin).toContain("Notification.Name.capacitorOpenUniversalLink");
    expect(lifecyclePlugin).toContain("ApplicationDelegateProxy.shared.lastURL");
    expect(lifecyclePlugin).toContain("retainUntilConsumed: true");
  });

  it("uses the device-only Keychain class without a preference fallback", () => {
    const plugin = readRepositoryFile(
      "ios/App/MobileAuthSessionStore/ios/Sources/MobileAuthSessionStorePlugin/MobileAuthSessionStorePlugin.swift"
    );
    const installGeneration = readRepositoryFile(
      "ios/App/MobileAuthSessionStore/ios/Sources/MobileAuthSessionStorePlugin/MobileAuthInstallGeneration.swift"
    );

    expect(plugin).toContain("kSecAttrAccessibleWhenUnlockedThisDeviceOnly");
    expect(plugin).toContain("kSecAttrSynchronizable");
    expect(plugin).toContain("namespace: namespace");
    expect(plugin).toContain("MobileAuthInstallGeneration.current()");
    expect(plugin).not.toContain("UserDefaults");
    expect(installGeneration).toContain("UserDefaults.standard");
    expect(installGeneration).toContain("install-generation");
    expect(installGeneration).not.toMatch(/access[_-]?token|refresh[_-]?token|code[_-]?verifier/i);
  });

  it("classifies Keychain failures without exposing OSStatus or guessing device lock", () => {
    const plugin = readRepositoryFile(
      "ios/App/MobileAuthSessionStore/ios/Sources/MobileAuthSessionStorePlugin/MobileAuthSessionStorePlugin.swift"
    );

    expect(plugin).toContain("errSecInteractionNotAllowed");
    expect(plugin).toContain("errSecMissingEntitlement");
    expect(plugin).toContain("UIApplication.shared.isProtectedDataAvailable");
    expect(plugin).toContain("secure_storage_device_locked");
    expect(plugin).toContain("secure_storage_interaction_not_allowed");
    expect(plugin).toContain("secure_storage_missing_entitlement");
    expect(plugin).toContain("secure_storage_unexpected_status");
    expect(plugin).not.toContain("\\(status)");
    expect(plugin).not.toContain("String(status)");
    expect(plugin).not.toContain("String(describing: error)");
    expect(plugin).not.toContain("error.localizedDescription");
  });
});
