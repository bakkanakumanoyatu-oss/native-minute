import Link from "next/link";
import { redirect } from "next/navigation";
import { VoiceDeletionPanel } from "@/components/voice/voice-deletion-panel";
import { StateActionSection, StateStepSection } from "@/components/guidance/state-sections";
import { buildLoginHref } from "@/lib/navigation";
import { getAuthState } from "@/lib/supabase/auth";

export default async function VoiceDataSettingsPage() {
  const authState = await getAuthState();

  if (authState.kind === "config_error") {
    return (
      <section className="space-y-6">
        <StateStepSection title="Voice data を開く前に前提確認が必要です" summary={authState.message} tone="alert" />
        <StateActionSection
          eyebrow="Next action"
          title="login に戻る"
          actions={[{ label: "login", href: buildLoginHref("/settings/voice-data", "supabase_not_configured", "/settings/voice-data"), tone: "primary" }]}
        />
      </section>
    );
  }

  if (!authState.user) {
    redirect(buildLoginHref("/settings/voice-data", "login_required", "/settings/voice-data"));
  }

  return (
    <section className="space-y-6">
      <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Voice data</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-950 sm:text-4xl">クローンボイスの削除</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
          ここではクローンボイスと関連するボイスデータだけを削除できます。アカウントと英語学習の記録は残ります。
        </p>
      </section>

      <VoiceDeletionPanel />

      <Link href="/settings" className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800">
        Settings に戻る
      </Link>
    </section>
  );
}
