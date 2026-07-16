import { rm } from "node:fs/promises";
import { authArtifactRoot } from "./auth-artifact-policy";

export default async function globalTeardown() {
  await rm(authArtifactRoot, { force: true, recursive: true });
}
