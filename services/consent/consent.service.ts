import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

export const CURRENT_PRONUNCIATION_CONSENT_VERSION = "2026-08-22.v1";
export const CURRENT_VOICE_CLONING_CONSENT_VERSION = "2026-08-22.v1";

export const PROCESSING_CONSENT_TYPES = ["pronunciation_processing", "voice_cloning"] as const;

export type ProcessingConsentType = (typeof PROCESSING_CONSENT_TYPES)[number];
export type ProcessingConsentStatus = "accepted" | "required" | "withdrawn";

type ProcessingConsentRow = Database["public"]["Tables"]["processing_consents"]["Row"];
type PostgrestErrorLike = { message: string };

type ConsentContract = {
  consentVersion: string;
  purposeId: string;
  purposeVersion: string;
  providerSet: string[];
  dataCategories: string[];
};

const CONSENT_CONTRACTS: Record<ProcessingConsentType, ConsentContract> = {
  pronunciation_processing: {
    consentVersion: CURRENT_PRONUNCIATION_CONSENT_VERSION,
    purposeId: "pronunciation_processing",
    purposeVersion: "v1",
    providerSet: ["openai", "azure"],
    dataCategories: ["recorded_audio", "transcript", "pronunciation_result"]
  },
  voice_cloning: {
    consentVersion: CURRENT_VOICE_CLONING_CONSENT_VERSION,
    purposeId: "voice_cloning",
    purposeVersion: "v1",
    providerSet: ["elevenlabs"],
    dataCategories: ["voice_sample", "consent_recording", "cloned_voice", "reference_audio"]
  }
};

function asMaybeSingle<TRow>(value: unknown) {
  return value as { data: TRow | null; error: PostgrestErrorLike | null };
}

function asSingle<TRow>(value: unknown) {
  return value as { data: TRow; error: PostgrestErrorLike | null };
}

function asMany<TRow>(value: unknown) {
  return value as { data: TRow[] | null; error: PostgrestErrorLike | null };
}

function isSameCanonicalArray(actual: string[], expected: string[]) {
  return actual.length === expected.length && expected.every((value, index) => actual[index] === value);
}

export function isCurrentProcessingConsentContract(
  row: Pick<ProcessingConsentRow, "consent_type" | "consent_version" | "purpose_id" | "purpose_version" | "provider_set" | "data_categories">,
  type: ProcessingConsentType
) {
  const contract = CONSENT_CONTRACTS[type];

  return (
    row.consent_type === type &&
    row.consent_version === contract.consentVersion &&
    row.purpose_id === contract.purposeId &&
    row.purpose_version === contract.purposeVersion &&
    isSameCanonicalArray(row.provider_set, contract.providerSet) &&
    isSameCanonicalArray(row.data_categories, contract.dataCategories)
  );
}

function mapConsentError(operation: string, error: PostgrestErrorLike) {
  void error;
  return new AppError(500, `${operation}に失敗しました。`);
}

function getContract(type: ProcessingConsentType) {
  return CONSENT_CONTRACTS[type];
}

async function getLatestCurrentVersionConsent(
  client: AppSupabaseClient,
  userId: string,
  type: ProcessingConsentType
) {
  const contract = getContract(type);
  const { data, error } = asMaybeSingle<ProcessingConsentRow>(
    await client
      .from("processing_consents")
      .select("*")
      .eq("user_id", userId)
      .eq("consent_type", type)
      .eq("consent_version", contract.consentVersion)
      .eq("purpose_id", contract.purposeId)
      .eq("purpose_version", contract.purposeVersion)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );

  if (error) {
    throw mapConsentError("同意状態の取得", error);
  }

  return data && isCurrentProcessingConsentContract(data, type) ? data : null;
}

export async function getCurrentProcessingConsent(
  client: AppSupabaseClient,
  userId: string,
  type: ProcessingConsentType
) {
  const row = await getLatestCurrentVersionConsent(client, userId, type);
  return row?.status === "active" ? row : null;
}

export async function getProcessingConsentStatus(
  client: AppSupabaseClient,
  userId: string,
  type: ProcessingConsentType
): Promise<{ type: ProcessingConsentType; status: ProcessingConsentStatus }> {
  const row = await getLatestCurrentVersionConsent(client, userId, type);

  return {
    type,
    status: row?.status === "active" ? "accepted" : row?.status === "withdrawn" ? "withdrawn" : "required"
  };
}

export async function acceptCurrentProcessingConsent(
  client: AppSupabaseClient,
  userId: string,
  type: ProcessingConsentType
) {
  const existing = await getCurrentProcessingConsent(client, userId, type);

  if (existing) {
    return existing;
  }

  const contract = getContract(type);
  const table = client.from("processing_consents") as unknown as {
    insert(values: Database["public"]["Tables"]["processing_consents"]["Insert"]): {
      select(columns?: string): { single(): Promise<{ data: ProcessingConsentRow; error: PostgrestErrorLike | null }> };
    };
  };
  const { data, error } = asSingle<ProcessingConsentRow>(
    await table
      .insert({
        user_id: userId,
        consent_type: type,
        consent_version: contract.consentVersion,
        purpose_id: contract.purposeId,
        purpose_version: contract.purposeVersion,
        provider_set: contract.providerSet,
        data_categories: contract.dataCategories,
        status: "active"
      })
      .select("*")
      .single()
  );

  if (error) {
    throw mapConsentError("同意記録の保存", error);
  }

  return data;
}

export async function withdrawCurrentProcessingConsent(
  client: AppSupabaseClient,
  userId: string,
  type: ProcessingConsentType
) {
  const contract = getContract(type);
  const table = client.from("processing_consents") as unknown as {
    update(values: Database["public"]["Tables"]["processing_consents"]["Update"]): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          eq(column: string, value: string): {
            eq(column: string, value: string): {
                eq(column: string, value: string): {
                eq(column: string, value: string): {
                  select(columns?: string): Promise<{ data: ProcessingConsentRow[] | null; error: PostgrestErrorLike | null }>;
                };
              };
            };
          };
        };
      };
    };
  };
  const { error } = asMany<ProcessingConsentRow>(
    await table
      .update({ status: "withdrawn" })
      .eq("user_id", userId)
      .eq("consent_type", type)
      .eq("consent_version", contract.consentVersion)
      .eq("purpose_id", contract.purposeId)
      .eq("purpose_version", contract.purposeVersion)
      .eq("status", "active")
      .select("*")
  );

  if (error) {
    throw mapConsentError("同意の撤回", error);
  }

  return getProcessingConsentStatus(client, userId, type);
}

export async function assertCurrentProcessingConsent(
  client: AppSupabaseClient,
  userId: string,
  type: ProcessingConsentType
) {
  const consent = await getCurrentProcessingConsent(client, userId, type);

  if (consent) {
    return consent;
  }

  const message = type === "pronunciation_processing"
    ? "録音の文字起こしと発音評価を行うには、現在の録音・発音評価への同意が必要です。"
    : "お手本ボイスを新しく作るには、現在のクローンボイス作成への同意が必要です。";
  throw new AppError(409, message);
}
