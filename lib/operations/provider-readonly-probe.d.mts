export type ProbeProvider = "elevenlabs" | "openai" | "mock" | "<other>" | "UNKNOWN";
export type ProviderHttpClassification = "SUCCESS" | "AUTH_FAILED" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "HTTP_REJECTED" | "NETWORK_FAILURE" | "INVALID_RESPONSE" | "REQUEST_BLOCKED";
export type ProbeSelector = {
  effectiveProvider: ProbeProvider;
  selector: string;
  credentials: { ELEVENLABS_API_KEY_PRESENT: boolean; OPENAI_API_KEY_PRESENT: boolean };
};
export type ProbeInventory = {
  paginationComplete: boolean;
  pageCount: number;
  totalVoiceCount: number;
  ownedVoiceCount: number;
  customVoiceCount: number;
  ownedCustomCount: number;
  nonAppResourceCount: number;
  unknownClassificationCount: number;
  categoryCounts: { premade: number; cloned: number; generated: number; professional: number; other: number };
  voiceIdHashes: string[];
  ownedCustomIdHashes: string[];
  unknownIdHashes: string[];
  digest: string;
  createdAtRange: { minUnix: number | null; maxUnix: number | null; knownCount: number; unknownCount: number };
};
export type ProviderProbeResult = ProbeSelector & {
  requestedAt: string;
  completedAt?: string;
  status: "PASS" | "BLOCKED";
  reasonCode: string;
  account: { status: ProviderHttpClassification; identityHash: string | null } | null;
  inventory: ProbeInventory | null;
  inventoryHttpStatusClass?: ProviderHttpClassification;
};
export function sha256(value: string): string;
export function getProbeSelector(env?: NodeJS.ProcessEnv): ProbeSelector;
export function isReadOnlyProviderRequestAllowed(url: string, method?: string): boolean;
/** Payload remains transient in server process memory; HTTP routes must only return runProbe results. */
export function readOnlyProviderRequest(input: { url: string; method?: string; apiKey: string }, fetchImpl?: typeof fetch, timeoutMs?: number): Promise<
  { ok: true; classification: "SUCCESS"; payload: unknown } |
  { ok: false; classification: ProviderHttpClassification; reasonCode: string }
>;
export function runProbe(mode: "selector" | "inventory", env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch): Promise<ProviderProbeResult>;
