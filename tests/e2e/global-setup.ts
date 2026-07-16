import { mkdir, rm } from "node:fs/promises";
import { authArtifactRoot } from "./auth-artifact-policy";

export default async function globalSetup() {
  await rm(authArtifactRoot, { force: true, recursive: true });
  await mkdir(authArtifactRoot, { mode: 0o700, recursive: true });
}
