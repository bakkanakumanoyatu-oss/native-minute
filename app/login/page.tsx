import Link from "next/link";
import { getOptionalInternalPath } from "@/lib/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const ERROR_MESSAGES: Record<string, string> = {
  login_required: "続けるにはメールリンクでログインしてください。",
  supabase_not_configured: "ログインの準備がまだ完了していません。時間をおいてもう一度お試しください。",
  missing_code: "ログインリンクを確認できませんでした。もう一度メールを送ってください。",
  callback_failed: "ログインを完了できませんでした。もう一度お試しください。",
  callback_pkce_missing:
    "ログインを完了できませんでした。メールを開いたブラウザで、このページからもう一度ログインリンクを送ってください。",
  callback_exchange_failed:
    "ログインリンクを確認できませんでした。期限切れの可能性があるため、もう一度メールを送ってください。"
};

type LoginPageProps = {
  searchParams?: {
    error?: string;
    next?: string;
  };
};

function getLoginReturnTargetState(rawNextPath: string | undefined) {
  const nextPath = getOptionalInternalPath(rawNextPath);

  if (nextPath) {
    return {
      nextPath,
      title: "ログイン後に練習へ戻ります",
      summary: nextPath === "/scripts" ? "メールリンクを開くと、練習一覧へ進みます。" : "メールリンクを開くと、続きの画面へ戻ります。"
    };
  }

  if (rawNextPath) {
    return {
      nextPath: null,
      title: "ログイン後に練習へ戻ります",
      summary: "メールリンクを開くと、練習一覧へ進みます。"
    };
  }

  return {
    nextPath: null,
    title: "ログイン後に練習へ戻ります",
    summary: "メールリンクを開くと、練習一覧へ進みます。"
  };
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const message = searchParams?.error ? ERROR_MESSAGES[searchParams.error] ?? "ログインを続けられませんでした。" : null;
  const returnTarget = getLoginReturnTargetState(searchParams?.next);
  const configReady = hasSupabaseConfig();

  return (
    <section className="mx-auto max-w-xl rounded-[2rem] border border-[var(--line)] bg-white p-8 shadow-soft">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">login</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900">メールリンクでログイン</h1>
      <p className="mt-3 text-sm leading-6 text-ink-600">メールアドレスを入れて、届いたリンクを開くだけです。</p>
      {!configReady ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          ログインの準備がまだ完了していません。時間をおいてもう一度お試しください。
        </div>
      ) : null}
      {message ? (
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm leading-6 text-ink-700">
          {message}
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold text-ink-500">{returnTarget.title}</p>
        <p className="text-sm leading-6 text-ink-600">{returnTarget.summary}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link href="/" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
          ホーム
        </Link>
        <Link href="/scripts" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
          練習一覧
        </Link>
      </div>
      <div className="mt-8">
        <LoginForm nextPath={returnTarget.nextPath} />
      </div>
    </section>
  );
}
