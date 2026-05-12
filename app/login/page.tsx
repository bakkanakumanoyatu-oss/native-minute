import Link from "next/link";
import { getOptionalInternalPath } from "@/lib/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const ERROR_MESSAGES: Record<string, string> = {
  login_required: "ログインが必要です。続けるにはメールリンクでサインインしてください。",
  supabase_not_configured: "Supabase の環境変数が未設定です。まず `.env.local` を確認してください。",
  missing_code: "認証コードが見つかりませんでした。もう一度ログインをやり直してください。",
  callback_failed: "サインインの完了に失敗しました。もう一度お試しください。",
  callback_pkce_missing:
    "サインインの完了に失敗しました。callback 時に PKCE verifier cookie を確認できませんでした。ログインを開始したのと同じブラウザセッションで、もう一度メールリンクを開いてください。",
  callback_exchange_failed:
    "サインインの完了に失敗しました。callback では verifier cookie を確認できましたが、Supabase の session 交換で失敗しました。server log の `Auth callback exchange failed` を確認してください。"
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
      title: `希望する戻り先: ${nextPath}`,
      summary: "許可された app page のときだけ、この戻り先を login 完了後にも引き継ぎます。callback 失敗時も同じ戻り先を保ったまま login に戻します。"
    };
  }

  if (rawNextPath) {
    return {
      nextPath: null,
      title: "希望する戻り先: /scripts",
      summary: "受け取った戻り先は internal path ではなかったため引き継ぎません。login 完了後は安全に `/scripts` へ戻します。"
    };
  }

  return {
    nextPath: null,
    title: "希望する戻り先: /scripts",
    summary: "戻り先が指定されていないため、login 完了後は `/scripts` へ戻します。"
  };
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const message = searchParams?.error ? ERROR_MESSAGES[searchParams.error] ?? "ログインを続けられませんでした。" : null;
  const returnTarget = getLoginReturnTargetState(searchParams?.next);
  const configReady = hasSupabaseConfig();

  return (
    <section className="mx-auto max-w-xl rounded-[2rem] border border-[var(--line)] bg-white p-8 shadow-soft">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">login</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900">メールリンクで login</h1>
      <p className="mt-3 text-sm leading-6 text-ink-600">
        まずはメールリンクだけの最小導線です。Phase 2 以降でセッション運用と権限周りを詰めます。
      </p>
      {!configReady ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Supabase の環境変数が未設定です。`NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定するとログインできます。
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
          home
        </Link>
        <Link href="/scripts" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
          scripts
        </Link>
      </div>
      <div className="mt-8">
        <LoginForm nextPath={returnTarget.nextPath} />
      </div>
    </section>
  );
}
