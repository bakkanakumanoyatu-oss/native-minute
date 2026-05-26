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
    <section className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-[var(--line-inset)] bg-[linear-gradient(180deg,var(--studio-surface-secondary),var(--studio-surface-primary)_48%,var(--studio-surface-inset))] shadow-[var(--shadow-studio-soft)]">
      <div className="border-b border-[var(--line-subtle)] bg-[radial-gradient(circle_at_top_left,rgba(200,121,63,0.18),transparent_34%),linear-gradient(135deg,var(--studio-surface-secondary),var(--booth-wall-soft)_58%,var(--studio-surface-inset))] p-6 sm:p-8">
        <p className="text-sm font-semibold text-[var(--studio-accent-strong)]">今日の台本</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">1分スタジオに置く台本を用意する</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-700">テンプレート、自分の言葉、AI下書きから選んで、最後は自分が話す1分に整えます。</p>
        <div className="mt-5 grid gap-2 text-sm font-semibold sm:max-w-xs">
          <Link href="/scripts" className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-inset)] px-4 py-3 text-ink-800 transition hover:bg-[var(--surface-inset-strong)]">
            1分ストックへ戻る
          </Link>
          {sourceScript ? (
            <Link href={getScriptListenPath(sourceScript.id)} className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-inset)] px-4 py-3 text-ink-800 transition hover:bg-[var(--surface-inset-strong)]">
              元の台本を聞く
            </Link>
          ) : null}
        </div>
        {sourceScriptMissing ? (
          <div className="mt-6 rounded-2xl border border-[var(--line-inset)] bg-[var(--coach-note)] px-4 py-4 text-sm leading-6 text-ink-700">
            複製元を見つけられなかったため、新しい台本として開いています。
          </div>
        ) : null}
      </div>
      <div className="p-6 sm:p-8">
        <NewScriptWorkspace initialValues={initialValues} sourceTitle={sourceScript?.title ?? null} />
      </div>
    </section>
  );
}
