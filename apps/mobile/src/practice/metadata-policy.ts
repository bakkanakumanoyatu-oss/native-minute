// Reconfirmation age is separate from retention. No expiry timers or polling.
export const METADATA_REFRESH_AGE_MS = 5 * 60_000;
export const METADATA_LIMITS = {
  scripts: { entries: 1, entryBytes: 64 * 1024, totalBytes: 64 * 1024 },
  progress: { entries: 1, entryBytes: 512 * 1024, totalBytes: 512 * 1024 },
  reviews: { entries: 5, entryBytes: 64 * 1024, totalBytes: 256 * 1024 }
} as const;
