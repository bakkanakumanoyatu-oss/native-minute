import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DEBUG_CALLBACK_URI = "com.nativeminutes.app.debug://auth/callback";

function readRepositoryFile(path: string) {
  return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

describe("native mobile auth configuration", () => {
  it("keeps the custom callback debug-only at the profile contract", () => {
    const profiles = JSON.parse(readRepositoryFile("config/mobile-profiles.json")) as Record<
      string,
      { authCallbackMode: string; authCallbackUri: string | null }
    >;

    expect(profiles["local-spike"]).toMatchObject({
      authCallbackMode: "custom-scheme",
      authCallbackUri: DEBUG_CALLBACK_URI
    });
    expect(profiles.production).toMatchObject({
      authCallbackMode: "unconfigured",
      authCallbackUri: null
    });
  });

  it("registers the exact debug scheme and forwards cold/warm URLs to the native bridge", () => {
    const infoPlist = readRepositoryFile("ios/App/App/Info.plist");
    const appDelegate = readRepositoryFile("ios/App/App/AppDelegate.swift");
    const lifecyclePlugin = readRepositoryFile(
      "ios/App/MobileAuthSessionStore/ios/Sources/MobileAuthSessionStorePlugin/MobileAuthLifecyclePlugin.swift"
    );

    expect(infoPlist).toContain("com.nativeminutes.app.debug");
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
