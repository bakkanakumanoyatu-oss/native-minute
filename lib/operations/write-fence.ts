// The same authority is used by Edge middleware and plain-Node operator CLIs.
export {
  WRITE_FENCE_ENV,
  WRITE_FENCE_STATUS_PATH,
  WRITE_FENCE_MESSAGE,
  getWriteFenceState,
  assertWritesAllowed,
  isFenceSafeRead,
  createWriteFenceResponse
} from "./write-fence.mjs";
export type { WriteFenceEnvironment, WriteFenceState } from "./write-fence.mjs";
