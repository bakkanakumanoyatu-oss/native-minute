export const DEFAULT_E2E_TEST_SECRET = "native-minute-e2e-secret";
export const DEFAULT_E2E_TEST_EMAIL = "native-minute-e2e@example.com";
export const DEFAULT_E2E_TEST_PASSWORD = "native-minute-e2e-password";

export function getE2ETestEnvValue(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}
