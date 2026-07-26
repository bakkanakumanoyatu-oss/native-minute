#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

const FALSE_SIGNING_VALUES = new Set(["0", "FALSE", "NO"]);
const SIGNING_VARIABLES = [
  ["CODE_SIGNING_ALLOWED", "unsafe_code_signing_allowed"],
  ["CODE_SIGNING_REQUIRED", "unsafe_code_signing_required"]
];

function falseLike(value) {
  return typeof value === "string" && FALSE_SIGNING_VALUES.has(value.trim().toUpperCase());
}

export function unsafeSigningReason(environment, assignments) {
  for (const [name, reason] of SIGNING_VARIABLES) {
    if (falseLike(environment[name])) {
      return reason;
    }

    const hasUnsafeAssignment = assignments.some(
      (candidate) => candidate.name === name && falseLike(candidate.value)
    );
    if (hasUnsafeAssignment) {
      return reason;
    }
  }

  return null;
}

function fixedAssignment(argument) {
  const match = /^(CODE_SIGNING_ALLOWED|CODE_SIGNING_REQUIRED)=(.*)$/.exec(argument);
  return match ? { name: match[1], value: match[2] } : null;
}

function parseArguments(argumentsList) {
  const assignments = [];
  let mode = null;
  let appPath = null;
  let device = "booted";

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const assignment = fixedAssignment(argument);

    if (assignment) {
      assignments.push(assignment);
      continue;
    }

    if (argument === "--verify-only" || argument === "--install-launch") {
      if (mode !== null) {
        return null;
      }
      mode = argument;
      continue;
    }

    if (argument === "--app") {
      appPath = argumentsList[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (argument === "--device") {
      device = argumentsList[index + 1] ?? "";
      index += 1;
      continue;
    }

    return null;
  }

  if (
    mode === null ||
    typeof appPath !== "string" ||
    !isAbsolute(appPath) ||
    !appPath.endsWith(".app") ||
    !/^(?:booted|[A-Fa-f0-9-]{8,})$/.test(device)
  ) {
    return null;
  }

  return { mode, appPath, device, assignments };
}

function command(file, args) {
  return spawnSync(file, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function plistValue(path, key) {
  const result = command("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", path]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function xmlPlists(text) {
  return text.match(/<\?xml[\s\S]*?<\/plist>/g) ?? [];
}

export function decodeOtoolEntitlementsSection(output) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  const hexWords = [];
  for (const line of lines) {
    const tokens = line.trim().split(/\s+/);
    if (
      tokens.length < 2 ||
      !/^[0-9a-fA-F]{8,16}$/.test(tokens[0]) ||
      tokens
        .slice(1)
        .some((token) => !/^(?:[0-9a-fA-F]{2}){1,4}$/.test(token))
    ) {
      return null;
    }
    hexWords.push(...tokens.slice(1));
  }

  const byteHex = hexWords
    .map((word) => word.match(/../g)?.reverse().join("") ?? "")
    .join("");
  if (byteHex.length === 0 || byteHex.length % 2 !== 0) {
    return null;
  }

  const decoded = Buffer.from(byteHex, "hex").toString("utf8").replace(/\0+$/g, "");
  return decoded.includes("\0") ? null : decoded;
}

function xmlStringValue(plist, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<key>\\s*${escaped}\\s*</key>\\s*<string>([^<]+)</string>`
  ).exec(plist);
  return match?.[1]?.trim() || null;
}

function keychainGroupsValid(plist) {
  if (!plist.includes("<key>keychain-access-groups</key>")) {
    return true;
  }

  const match =
    /<key>\s*keychain-access-groups\s*<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist);
  if (!match) {
    return false;
  }

  return /<string>[^<]+<\/string>/.test(match[1]);
}

export function inspectEntitlementText(text) {
  const candidates = xmlPlists(text);
  const entitlementPlist = candidates.find((candidate) =>
    candidate.includes("<key>application-identifier</key>")
  );

  if (!entitlementPlist) {
    return {
      applicationIdentifierPresent: false,
      keychainGroupsValid: false
    };
  }

  return {
    applicationIdentifierPresent:
      xmlStringValue(entitlementPlist, "application-identifier") !== null,
    keychainGroupsValid: keychainGroupsValid(entitlementPlist)
  };
}

function inspectAppBundle(appPath) {
  if (!existsSync(appPath) || !statSync(appPath).isDirectory()) {
    return {
      signed: false,
      applicationIdentifierPresent: false,
      keychainEntitlementReady: false,
      reason: "app_bundle_missing"
    };
  }

  const signature = command("/usr/bin/codesign", [
    "--verify",
    "--strict",
    "--all-architectures",
    appPath
  ]);
  const signed = signature.status === 0;

  if (!signed) {
    return {
      signed: false,
      applicationIdentifierPresent: false,
      keychainEntitlementReady: false,
      reason: "bundle_signature_invalid"
    };
  }

  const infoPlistPath = join(appPath, "Info.plist");
  const executableName = plistValue(infoPlistPath, "CFBundleExecutable");
  if (!executableName || executableName.includes("/") || executableName.includes("\0")) {
    return {
      signed: true,
      applicationIdentifierPresent: false,
      keychainEntitlementReady: false,
      reason: "bundle_metadata_invalid"
    };
  }

  const executablePath = join(appPath, executableName);
  if (!existsSync(executablePath) || !statSync(executablePath).isFile()) {
    return {
      signed: true,
      applicationIdentifierPresent: false,
      keychainEntitlementReady: false,
      reason: "bundle_metadata_invalid"
    };
  }

  const entitlementSection = command("/usr/bin/otool", [
    "-s",
    "__TEXT",
    "__entitlements",
    "-X",
    executablePath
  ]);
  const entitlementText =
    entitlementSection.status === 0
      ? decodeOtoolEntitlementsSection(entitlementSection.stdout)
      : null;
  const entitlements = entitlementText
    ? inspectEntitlementText(entitlementText)
    : {
        applicationIdentifierPresent: false,
        keychainGroupsValid: false
      };
  const keychainEntitlementReady =
    entitlements.applicationIdentifierPresent && entitlements.keychainGroupsValid;

  return {
    signed: true,
    applicationIdentifierPresent: entitlements.applicationIdentifierPresent,
    keychainEntitlementReady,
    reason: entitlements.applicationIdentifierPresent
      ? keychainEntitlementReady
        ? "ok"
        : "keychain_entitlement_invalid"
      : "application_identifier_missing"
  };
}

function printResult(result, extras = {}) {
  console.log(`signed=${result.signed}`);
  console.log(`application_identifier_present=${result.applicationIdentifierPresent}`);
  console.log(`keychain_entitlement_ready=${result.keychainEntitlementReady}`);
  for (const [name, value] of Object.entries(extras)) {
    console.log(`${name}=${value}`);
  }
  console.log(`reason=${result.reason}`);
}

function runSelfTest() {
  const cleanEnvironment = {};
  const cases = [
    [unsafeSigningReason(cleanEnvironment, []), null],
    [unsafeSigningReason({ CODE_SIGNING_ALLOWED: "YES" }, []), null],
    [
      unsafeSigningReason({ CODE_SIGNING_ALLOWED: "NO" }, []),
      "unsafe_code_signing_allowed"
    ],
    [
      unsafeSigningReason({}, [{ name: "CODE_SIGNING_REQUIRED", value: "0" }]),
      "unsafe_code_signing_required"
    ],
    [
      unsafeSigningReason(
        {},
        [
          { name: "CODE_SIGNING_ALLOWED", value: "YES" },
          { name: "CODE_SIGNING_ALLOWED", value: "NO" }
        ]
      ),
      "unsafe_code_signing_allowed"
    ]
  ];

  const appIdentifierOnly = inspectEntitlementText(`<?xml version="1.0"?>
<plist><dict><key>application-identifier</key><string>fixture.app</string></dict></plist>`);
  const nonemptyGroups = inspectEntitlementText(`<?xml version="1.0"?>
<plist><dict>
<key>application-identifier</key><string>fixture.app</string>
<key>keychain-access-groups</key><array><string>fixture.app</string></array>
</dict></plist>`);
  const emptyGroups = inspectEntitlementText(`<?xml version="1.0"?>
<plist><dict>
<key>application-identifier</key><string>fixture.app</string>
<key>keychain-access-groups</key><array></array>
</dict></plist>`);
  const missingIdentifier = inspectEntitlementText(`<?xml version="1.0"?>
<plist><dict><key>get-task-allow</key><true/></dict></plist>`);
  const fixtureEntitlementXml = `<?xml version="1.0"?>
<plist><dict><key>application-identifier</key><string>fixture.app</string></dict></plist>`;
  const fixtureBytes = Buffer.from(fixtureEntitlementXml, "utf8");
  const fixtureWords = [];
  for (let index = 0; index < fixtureBytes.length; index += 4) {
    fixtureWords.push(
      Buffer.from(fixtureBytes.subarray(index, index + 4)).reverse().toString("hex")
    );
  }
  const fixtureOtoolOutput = fixtureWords
    .reduce((lines, word, index) => {
      const lineIndex = Math.floor(index / 4);
      lines[lineIndex] ??= `${(lineIndex * 16).toString(16).padStart(16, "0")}`;
      lines[lineIndex] += ` ${word}`;
      return lines;
    }, [])
    .join("\n");
  const decodedFixture = decodeOtoolEntitlementsSection(fixtureOtoolOutput);

  const passed =
    cases.every(([actual, expected]) => actual === expected) &&
    appIdentifierOnly.applicationIdentifierPresent &&
    appIdentifierOnly.keychainGroupsValid &&
    nonemptyGroups.applicationIdentifierPresent &&
    nonemptyGroups.keychainGroupsValid &&
    emptyGroups.applicationIdentifierPresent &&
    !emptyGroups.keychainGroupsValid &&
    !missingIdentifier.applicationIdentifierPresent &&
    decodedFixture === fixtureEntitlementXml &&
    decodeOtoolEntitlementsSection("not otool output") === null;

  if (!passed) {
    console.error("FAIL: iOS Simulator runtime signing guard self-test failed.");
    process.exitCode = 1;
    return;
  }

  console.log("PASS: iOS Simulator runtime signing guard self-test passed.");
}

function main() {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.length === 1 && argumentsList[0] === "--self-test") {
    runSelfTest();
    return;
  }

  const options = parseArguments(argumentsList);
  if (!options) {
    printResult({
      signed: false,
      applicationIdentifierPresent: false,
      keychainEntitlementReady: false,
      reason: "invalid_arguments"
    });
    process.exitCode = 2;
    return;
  }

  const unsafeReason = unsafeSigningReason(process.env, options.assignments);
  if (unsafeReason) {
    printResult({
      signed: false,
      applicationIdentifierPresent: false,
      keychainEntitlementReady: false,
      reason: unsafeReason
    });
    process.exitCode = 1;
    return;
  }

  const inspection = inspectAppBundle(options.appPath);
  if (inspection.reason !== "ok") {
    printResult(inspection);
    process.exitCode = 1;
    return;
  }

  if (options.mode === "--verify-only") {
    printResult(inspection);
    return;
  }

  const bundleIdentifier = plistValue(join(options.appPath, "Info.plist"), "CFBundleIdentifier");
  if (!bundleIdentifier) {
    printResult({ ...inspection, reason: "bundle_metadata_invalid" });
    process.exitCode = 1;
    return;
  }

  command("/usr/bin/xcrun", [
    "simctl",
    "terminate",
    options.device,
    bundleIdentifier
  ]);
  const install = command("/usr/bin/xcrun", [
    "simctl",
    "install",
    options.device,
    options.appPath
  ]);
  if (install.status !== 0) {
    printResult(
      { ...inspection, reason: "simulator_install_failed" },
      { installed: false, launched: false }
    );
    process.exitCode = 1;
    return;
  }

  const launch = command("/usr/bin/xcrun", [
    "simctl",
    "launch",
    options.device,
    bundleIdentifier
  ]);
  if (launch.status !== 0) {
    printResult(
      { ...inspection, reason: "simulator_launch_failed" },
      { installed: true, launched: false }
    );
    process.exitCode = 1;
    return;
  }

  printResult(inspection, { installed: true, launched: true });
}

main();
