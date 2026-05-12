import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { createScript, listScripts } from "@/services/scripts/scripts.service";

const E2E_SCRIPT_TITLE = "E2E Smoke Script";
const E2E_SCRIPT_CONTENT =
  "Good morning. This is my one-minute Native Minute practice. I am speaking clearly, keeping the rhythm steady, and finishing every sentence with intention.";

export async function ensureE2ESmokeScript(client: AppSupabaseClient, userId: string) {
  const scripts = await listScripts(client, userId);
  const existing = scripts.find((script) => script.title === E2E_SCRIPT_TITLE && script.content === E2E_SCRIPT_CONTENT);

  if (existing) {
    return {
      script: existing,
      reused: true as const
    };
  }

  try {
    const script = await createScript(client, userId, {
      title: E2E_SCRIPT_TITLE,
      content: E2E_SCRIPT_CONTENT,
      targetSeconds: 60,
      locale: "en-US"
    });

    return {
      script,
      reused: false as const
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(500, "E2E 用 script の作成に失敗しました。");
  }
}
