export const WRITE_FENCE_ENV: "NATIVE_MINUTE_WRITE_FENCE";
export const WRITE_FENCE_STATUS_PATH: "/api/operations/write-fence";
export const WRITE_FENCE_MESSAGE: string;
export type WriteFenceEnvironment = { NATIVE_MINUTE_WRITE_FENCE?: string };
export type WriteFenceState = {
  writesAllowed: boolean;
  code: "production_write_fence_active" | null;
  reason: "open" | "maintenance" | "configuration_invalid";
};
export function getWriteFenceState(env?: WriteFenceEnvironment): WriteFenceState;
export function assertWritesAllowed(env?: WriteFenceEnvironment): void;
export function isFenceSafeRead(method: string, pathname: string): boolean;
export function createWriteFenceResponse(method: string, pathname: string, env?: WriteFenceEnvironment): Response | null;
