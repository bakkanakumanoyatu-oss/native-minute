import { isStrictProductionRuntime } from "@/lib/production-guard";

export function isE2ETestModeEnabled() {
  if (isStrictProductionRuntime()) {
    return false;
  }

  return process.env.NODE_ENV === "development" || Boolean(process.env.E2E_TEST_SECRET?.trim());
}
