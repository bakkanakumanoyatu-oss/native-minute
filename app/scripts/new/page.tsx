import Link from "next/link";
import { redirect } from "next/navigation";
import { buildLoginHref } from "@/lib/navigation";
import { getScriptListenPath } from "@/lib/script-routes";
import { getCurrentUser } from "@/lib/supabase/auth";
import { NewScriptWorkspace } from "@/components/scripts/new-script-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getScript } from "@/services/scripts/scripts.service";
import { scriptIdSchema } from "@/schemas/script";

type PageProps = {
  searchParams?: {
    from?: string;
  };
};

export default async function NewScriptPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(buildLoginHref("/scripts/new", "login_required", "/scripts"));
  }

  const sourceScriptId = typeof searchParams?.from === "string" ? searchParams.from : null;
  const parsedSourceId = sourceScriptId ? scriptIdSchema.safeParse(sourceScriptId) : null;
  const supabase = createSupabaseServerClient();
  const sourceScript = parsedSourceId?.success ? await getScript(supabase, user.id, parsedSourceId.data) : null;
  const sourceScriptMissing = Boolean(sourceScriptId) && !sourceScript;
  const initialValues = sourceScript
    ? {
        title: `${sourceScript.title} の複製`,
        content: sourceScript.content,
        targetSeconds: sourceScript.targetSeconds,
        locale: sourceScript.locale
      }
    : undefined;

  return (
    <section className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-[var(--line)] bg-white shadow-soft">
      <div className="bg-[radial-gradient(circle_at_top_left,rgba(28,160,138,0.16),transparent_36%),linear-gradient(135deg,rgba(255,255,255,1),rgba(244,248,255,0.94))] p-6 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Add practice</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">新しい練習を追加する</h1>
      <p className="mt-3 text-sm leading-6 text-ink-600">
        テンプレ、自由入力、AI draft は、練習を増やすための入口です。最後は下のフォームで自分の言葉に直してから保存します。
      </p>
      <p className="mt-2 text-sm leading-6 text-ink-600">
        保存後は新しい script の listen に進み、短く見本を聞いて record に入れます。
      </p>
      <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
        <Link href="/scripts" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
          scripts
        </Link>
        <Link href="/progress" className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
          progress
        </Link>
        {sourceScript ? (
          <Link href={getScriptListenPath(sourceScript.id)} className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-ink-800">
            元 script
          </Link>
        ) : null}
      </div>
      {sourceScriptMissing ? (
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
          複製元の script を見つけられなかったため、空の新規作成として開いています。
        </div>
      ) : null}
      </div>
      <div className="p-6 sm:p-8">
        <NewScriptWorkspace initialValues={initialValues} sourceTitle={sourceScript?.title ?? null} />
      </div>
    </section>
  );
}
