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
const STAGING_ASSOCIATED_DOMAIN = "applinks:native-minute-staging.vercel.app";

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
      authCallbackUri: STAGING_CALLBACK_URI,
      authTargetFingerprint:
        "cfdbf57f7a1d3226019079df30e06c61276cb528f31779581fb6ae92592096b3"
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
    const stagingEntitlements = readRepositoryFile("ios/App/App/App-Staging.entitlements");
    const associatedDomains = [
      ...stagingEntitlements.matchAll(/<string>\s*([^<]+?)\s*<\/string>/g)
    ].map((match) => match[1]);

    expect(debug).toContain("INFOPLIST_FILE = \"App/Info-Debug.plist\"");
    expect(debug).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${PRODUCTION_BUNDLE_ID}`);
    expect(debug).toContain("SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG");
    expect(debug).not.toContain("DEVELOPMENT_TEAM");
    expect(debug).not.toContain("CODE_SIGN_ENTITLEMENTS");

    expect(staging).toContain("INFOPLIST_FILE = App/Info.plist");
    expect(staging).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${STAGING_BUNDLE_ID}`);
    expect(staging).toContain('SWIFT_ACTIVE_COMPILATION_CONDITIONS = ""');
    expect(staging).toMatch(/DEVELOPMENT_TEAM = [A-Z0-9]{10}/);
    expect(staging).toContain("CODE_SIGN_ENTITLEMENTS = App/App-Staging.entitlements");
    expect(associatedDomains).toEqual([STAGING_ASSOCIATED_DOMAIN]);

    expect(release).toContain("INFOPLIST_FILE = App/Info.plist");
    expect(release).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${PRODUCTION_BUNDLE_ID}`);
    expect(release).not.toContain("DEVELOPMENT_TEAM");
    expect(release).not.toContain("CODE_SIGN_ENTITLEMENTS");
  });

  it("registers the exact debug scheme and connects Capacitor URL ingress to the auth lifecycle", () => {
    const debugInfoPlist = readRepositoryFile("ios/App/App/Info-Debug.plist");
    const releaseInfoPlist = readRepositoryFile("ios/App/App/Info.plist");
    const appDelegate = readRepositoryFile("ios/App/App/AppDelegate.swift");
    const capacitorProxy = readRepositoryFile(
      "node_modules/@capacitor/ios/Capacitor/Capacitor/CAPApplicationDelegateProxy.swift"
    );
    const lifecyclePlugin = readRepositoryFile(
      "ios/App/MobileAuthSessionStore/ios/Sources/MobileAuthSessionStorePlugin/MobileAuthLifecyclePlugin.swift"
    );
    const mobileAuth = readRepositoryFile("apps/mobile/src/auth/mobile-auth.ts");
    const appLifecycle = readRepositoryFile("apps/mobile/src/lib/app-lifecycle.ts");

    expect(debugInfoPlist).toContain("com.nativeminutes.app.debug");
    expect(releaseInfoPlist).not.toContain("CFBundleURLTypes");
    expect(releaseInfoPlist).not.toContain("com.nativeminutes.app.debug");

    expect(appDelegate).toContain(
      "return ApplicationDelegateProxy.shared.application(app, open: url, options: options)"
    );
    expect(appDelegate).toMatch(
      /func application\(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping \(\[UIUserActivityRestoring\]\?\) -> Void\) -> Bool/
    );
    expect(appDelegate).toContain(
      "return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)"
    );

    expect(capacitorProxy).toContain("lastURL = url");
    expect(capacitorProxy).toContain(
      "NotificationCenter.default.post(name: .capacitorOpenUniversalLink"
    );
    expect(lifecyclePlugin).toContain("Notification.Name.capacitorOpenURL");
    expect(lifecyclePlugin).toContain("Notification.Name.capacitorOpenUniversalLink");
    expect(lifecyclePlugin).toContain("ApplicationDelegateProxy.shared.lastURL");
    expect(lifecyclePlugin).toContain('notifyListeners(\n            "appUrlOpen"');
    expect(lifecyclePlugin).toContain("retainUntilConsumed: true");
    expect(appLifecycle).toContain('registerPlugin<NativeAppLifecyclePlugin>');
    expect(appLifecycle).toContain('NativeAppLifecycle.addListener("appUrlOpen"');
    expect(mobileAuth).toContain("addNativeAppUrlOpenListener");
    expect(mobileAuth).not.toContain("registerPlugin");
    expect(mobileAuth).toContain("void this.handleCallbackUrl(url)");
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
