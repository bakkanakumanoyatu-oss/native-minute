export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getPublicAppUrl(): string {
  const value = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}
