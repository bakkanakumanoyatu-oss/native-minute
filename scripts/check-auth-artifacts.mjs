#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const rules = [
  {
    category: "known auth test output",
    matches: (filePath) => /(^|\/)test-results[^/]*\/auth\.setup\.ts-create-authenticated-storage-state-setup(?:\/|$)/.test(filePath)
  },
  {
    category: "Playwright test results",
    matches: (filePath) => /(^|\/)test-results[^/]*\//.test(filePath)
  },
  {
    category: "Playwright HTML report",
    matches: (filePath) => /(^|\/)playwright-report[^/]*\//.test(filePath)
  },
  {
    category: "Playwright blob report",
    matches: (filePath) => /(^|\/)blob-report[^/]*\//.test(filePath)
  },
  {
    category: "Playwright auth state directory",
    matches: (filePath) => /(^|\/)(?:playwright|tests\/e2e)\/\.auth(?:\/|$)/.test(filePath)
  },
  {
    category: "storage state JSON",
    matches: (filePath) => /(^|\/)storage-state[^/]*\.json$/i.test(filePath)
  },
  {
    category: "auth state JSON",
    matches: (filePath) => /(^|\/)auth-state[^/]*\.json$/i.test(filePath)
  },
  {
    category: "Playwright trace archive",
    matches: (filePath) => /(^|\/)(?:trace|[^/]+[._-]trace)\.zip$/i.test(filePath)
  },
  {
    category: "editor swap file",
    matches: (filePath) => /\.swp$/i.test(filePath)
  },
  {
    category: "Xcode or Simulator generated state",
    matches: (filePath) =>
      /(^|\/)DerivedData\//.test(filePath) ||
      /(^|\/)xcuserdata\//.test(filePath) ||
      /\.xcresult(?:\.zip)?(?:\/|$)/i.test(filePath) ||
      /\.xcuserstate$/i.test(filePath)
  }
];

function classifyPath(filePath) {
  return rules.find((rule) => rule.matches(filePath))?.category ?? null;
}

function runSelfTest() {
  const blockedCases = [
    ["test-results 2/auth.setup.ts-create-authenticated-storage-state-setup/trace.zip", "known auth test output"],
    ["test-results-copy/ui/test-failed-1.png", "Playwright test results"],
    ["playwright-report-old/index.html", "Playwright HTML report"],
    ["blob-report-2/report.zip", "Playwright blob report"],
    ["tests/e2e/.auth/user.json", "Playwright auth state directory"],
    ["tmp/storage-state-run.json", "storage state JSON"],
    ["tmp/auth-state-run.json", "auth state JSON"],
    ["tmp/login.trace.zip", "Playwright trace archive"],
    ["tmp/auth-trace.zip", "Playwright trace archive"],
    ["tmp/auth_trace.zip", "Playwright trace archive"],
    [".middleware.ts.swp", "editor swap file"],
    ["ios/DerivedData/App/Build/output", "Xcode or Simulator generated state"],
    ["ios/App.xcodeproj/xcuserdata/user.xcuserdatad/state.xcuserstate", "Xcode or Simulator generated state"],
    ["results/AppTests.xcresult/Data/data", "Xcode or Simulator generated state"],
    ["results/AppTests.xcresult.zip", "Xcode or Simulator generated state"]
  ];
  const allowedCases = [
    "artifacts/rr-2b-settings-smoke.png",
    "docs/playwright-test-results-policy.md",
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    "tests/fixtures/sample-recording.webm"
  ];

  const failedBlockedCases = blockedCases.filter(([filePath, category]) => classifyPath(filePath) !== category);
  const failedAllowedCases = allowedCases.filter((filePath) => classifyPath(filePath) !== null);

  if (failedBlockedCases.length > 0 || failedAllowedCases.length > 0) {
    console.error("FAIL: auth artifact checker self-test did not enforce the expected path policy.");
    process.exitCode = 1;
    return;
  }

  console.log("PASS: auth artifact checker path policy self-test passed.");
}

function getTrackedPaths() {
  const output = execFileSync("git", ["ls-files", "-z"]);
  return output.toString("utf8").split("\0").filter(Boolean);
}

function checkTrackedPaths() {
  let trackedPaths;

  try {
    trackedPaths = getTrackedPaths();
  } catch {
    console.error("FAIL: unable to inspect tracked paths with git ls-files.");
    process.exitCode = 2;
    return;
  }

  const findings = trackedPaths.flatMap((filePath) => {
    const category = classifyPath(filePath);
    return category ? [{ category, filePath }] : [];
  });

  if (findings.length > 0) {
    console.error("FAIL: tracked generated authentication or test artifacts were found.");

    for (const finding of findings) {
      console.error("- " + finding.category + ": " + JSON.stringify(finding.filePath));
    }

    process.exitCode = 1;
    return;
  }

  console.log("PASS: no blocked authentication or generated test artifact paths are tracked.");
}

const args = process.argv.slice(2);

if (args.length === 0) {
  checkTrackedPaths();
} else if (args.length === 1 && args[0] === "--self-test") {
  runSelfTest();
} else {
  console.error("FAIL: unsupported checker arguments.");
  process.exitCode = 2;
}
