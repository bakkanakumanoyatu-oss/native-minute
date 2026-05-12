import { AppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getVoiceProviderName } from "@/providers/voice";

type DeleteResult = {
  count: number | null;
  error: { message: string } | null;
};

function asDeleteResult(value: unknown) {
  return value as DeleteResult;
}

function mapAdminDeleteError(operation: string, error: { message: string } | null) {
  if (!error) {
    return null;
  }

  return new AppError(500, `${operation}に失敗しました。${error.message}`);
}

export async function resetCurrentProviderVoiceSetupState(userId: string) {
  const provider = getVoiceProviderName();
  const admin = createSupabaseAdminClient();

  const voicesDelete = asDeleteResult(
    await admin
      .from("voices")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("provider", provider)
  );

  const voicesError = mapAdminDeleteError("voice state の初期化", voicesDelete.error);

  if (voicesError) {
    throw voicesError;
  }

  const consentDelete = asDeleteResult(
    await admin
      .from("voice_consents")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("provider", provider)
  );

  const consentError = mapAdminDeleteError("consent state の初期化", consentDelete.error);

  if (consentError) {
    throw consentError;
  }

  return {
    provider,
    deletedVoiceCount: voicesDelete.count ?? 0,
    deletedConsentCount: consentDelete.count ?? 0
  };
}
