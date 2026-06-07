import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountDeletionPanel } from "@/components/account/account-deletion-panel";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { StateActionSection, StateStepSection } from "@/components/guidance/state-sections";
import { buildLoginHref } from "@/lib/navigation";
import { getAuthState } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountDeletionStatus } from "@/services/account-deletion";

export default async function SettingsPage() {
  const authState = await getAuthState();

  if (authState.kind === "config_error") {
    return (
      <section className="space-y-6">
        <StateStepSection
          title="Settings を開く前に前提確認が必要です"
          summary={authState.message}
          tone="alert"
        />
        <StateActionSection
          eyebrow="Next action"
          title="login に戻る"
          actions={[{ label: "login", href: buildLoginHref("/settings", "supabase_not_configured", "/settings"), tone: "primary" }]}
        />
      </section>
    );
  }

  if (!authState.user) {
    redirect(buildLoginHref("/settings", "login_required", "/settings"));
  }

  const supabase = createSupabaseServerClient();
  const deletionRequest = await getAccountDeletionStatus(supabase, authState.user.id);

  return (
    <section className="space-y-6">
      <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-950 sm:text-4xl">練習の設定</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
          普段の練習は Home から始めます。ここではお手本ボイスの準備、サポート情報、アカウント削除リクエストなど、必要なときだけ使う設定を確認します。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/setup/voice" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-800 sm:w-auto">
            voice 設定を開く
          </Link>
          <Link href="/" className="inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-sm sm:w-auto">
            Home に戻る
          </Link>
        </div>
      </section>

      <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ink-500">Session</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink-950">ログアウト</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
          ログアウトすると、このブラウザのセッションを終了します。別のメールでログインし直すときにも使えます。
        </p>
        <div className="mt-5">
          <SignOutButton />
        </div>
      </section>

      <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ink-500">Privacy and support</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink-950">サポートとデータの扱い</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
          Privacy Policy、Terms、Support、Account deletion request を確認できます。アカウント削除はリクエスト作成、確認、削除対象の件数確認までこの画面で進められます。実際の削除は、別の安全な手順で確認してから実行します。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/privacy" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-800 sm:w-auto">
            Privacy Policy
          </Link>
          <Link href="/terms" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-800 sm:w-auto">
            Terms
          </Link>
          <Link href="/support" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-800 sm:w-auto">
            Support
          </Link>
          <Link href="/support/account-deletion" className="inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-800 sm:w-auto">
            Account deletion
          </Link>
        </div>
      </section>

      <AccountDeletionPanel initialDeletionRequest={deletionRequest} />
    </section>
  );
}
