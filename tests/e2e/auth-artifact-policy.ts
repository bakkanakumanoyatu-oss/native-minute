import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const workspaceKey = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12);
const portKey = (process.env.PLAYWRIGHT_PORT ?? "3100").replace(/[^a-zA-Z0-9_-]/g, "_");

export const authArtifactRoot = path.join(
  tmpdir(),
  "native-minute-playwright-auth",
  workspaceKey + "-" + portKey
);
export const authStorageStatePath = path.join(authArtifactRoot, "storage-state.json");
export const authSetupOutputDir = path.join(authArtifactRoot, "setup-results");
export const authGuardOutputDir = path.join(authArtifactRoot, "guard-results");
