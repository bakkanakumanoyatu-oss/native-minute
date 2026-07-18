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

function writeFixture(rootDir, filePath, contents) {
  const absolutePath = resolve(rootDir, filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents, "utf8");
}

function writeJsonFixture(rootDir, filePath, value) {
  writeFixture(rootDir, filePath, JSON.stringify(value));
}

function createPassingFixture(rootDir) {
  writeJsonFixture(rootDir, "config/capacitor-profiles.json", {
    "local-spike": {
      webDir: "apps/mobile/dist"
    },
    production: {
      webDir: "apps/mobile/dist"
    }
  });
  writeJsonFixture(rootDir, "config/mobile-profiles.json", {
    "local-spike": {
      bffBaseUrl: "https://native-minute.example"
    },
    production: {
      bffBaseUrl: "https://native-minute.example"
    }
  });
  writeFixture(rootDir, "apps/mobile/dist/index.html", "<div id=\"root\"></div>");
  writeFixture(rootDir, "apps/mobile/dist/assets/app.js", "console.info(\"mobile fixture\");");
  writeJsonFixture(rootDir, "apps/mobile/dist/mobile-build.json", {
    profile: "production",
    bffOrigin: "https://native-minute.example"
  });
  writeFixture(rootDir, "apps/mobile/src/App.tsx", "export const appName = \"Native Minutes\";");
  writeJsonFixture(rootDir, "ios/App/App/capacitor.config.json", {
    appId: "com.nativeminutes.app",
    appName: "Native Minutes",
    webDir: "apps/mobile/dist"
  });
  writeJsonFixture(rootDir, "ios/App/App/public/mobile-build.json", {
    profile: "production",
    bffOrigin: "https://native-minute.example"
  });
}

const fixtureRoot = mkdtempSync(resolve(tmpdir(), "native-minute-mobile-release-"));

try {
  createPassingFixture(fixtureRoot);

  const passingFindings = runMobileReleaseGuard({
    rootDir: fixtureRoot,
    profile: "production"
  });

  if (passingFindings.length > 0) {
    throw new Error("Expected the safe release fixture to pass.");
  }

  writeJsonFixture(fixtureRoot, "apps/mobile/dist/mobile-build.json", {
    profile: "local-spike",
    bffOrigin: "https://native-minute-preview.example"
  });
  writeJsonFixture(fixtureRoot, "ios/App/App/public/mobile-build.json", {
    profile: "local-spike",
    bffOrigin: "https://native-minute-preview.example"
  });

  const previewFindings = runMobileReleaseGuard({
    rootDir: fixtureRoot,
    profile: "local-spike",
    bffBaseUrlOverride: "https://native-minute-preview.example"
  });

  if (previewFindings.length > 0) {
    throw new Error("Expected matching local-spike preview metadata to pass.");
  }

  const productionOverrideFindings = runMobileReleaseGuard({
    rootDir: fixtureRoot,
    profile: "production",
    bffBaseUrlOverride: "https://native-minute-preview.example"
  });

  if (!productionOverrideFindings.some((finding) => finding.category === "bff_override_not_local_spike")) {
    throw new Error("Expected a production BFF override to be blocked.");
  }

  createPassingFixture(fixtureRoot);

  writeJsonFixture(fixtureRoot, "config/capacitor-profiles.json", {
    production: {
      webDir: "apps/mobile/dist",
      server: {
        url: "http://localhost:3000",
        cleartext: true,
        allowNavigation: ["localhost"]
      }
    }
  });
  writeJsonFixture(fixtureRoot, "config/mobile-profiles.json", {
    production: {
      bffBaseUrl: "http://localhost:3000"
    }
  });
  writeFixture(
    fixtureRoot,
    "apps/mobile/dist/assets/app.js",
    "const endpoint = \"http://localhost:3000\"; const marker = \"SUPABASE_SERVICE_ROLE_KEY\";"
  );
  writeFixture(
    fixtureRoot,
    "apps/mobile/src/App.tsx",
    "export const forbiddenMarker = \"SUPABASE_SERVICE_ROLE_KEY\";"
  );
  writeJsonFixture(fixtureRoot, "ios/App/App/capacitor.config.json", {
    server: {
      url: "http://localhost:3000",
      cleartext: true,
      allowNavigation: ["localhost"]
    }
  });

  const blockedFindings = runMobileReleaseGuard({
    rootDir: fixtureRoot,
    profile: "production"
  });
  const categories = new Set(blockedFindings.map((finding) => finding.category));
  const expectedCategories = [
    "capacitor_server_url",
    "capacitor_cleartext",
    "capacitor_allow_navigation",
    "bff_not_https",
    "bff_loopback_host",
    "bundle_loopback_url",
    "bundle_server_secret_marker",
    "mobile_source_service_role_reference",
    "native_server_url",
    "native_cleartext",
    "native_allow_navigation",
    "native_loopback_url"
  ];

  if (expectedCategories.some((category) => !categories.has(category))) {
    throw new Error("Expected the unsafe release fixture to exercise every blocking category.");
  }

  console.log("PASS: mobile release guard self-test covered safe and blocked fixtures.");
} catch {
  console.error("FAIL: mobile release guard self-test failed.");
  process.exitCode = 1;
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
