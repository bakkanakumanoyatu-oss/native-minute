import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { buildLoginHref, getInternalPath } from "@/lib/navigation";
import { getAuthState } from "@/lib/supabase/auth";
import { StateActionSection, StateStepSection } from "@/components/guidance/state-sections";

export default async function ScriptsLayout({ children }: { children: ReactNode }) {
  const authState = await getAuthState();
  const requestHeaders = headers();
  const nextPath = getInternalPath(requestHeaders.get("x-invoke-path") ?? requestHeaders.get("next-url"), "/scripts");

  if (authState.kind === "config_error") {
    return (
      <section className="space-y-6">
        <StateStepSection
          title="scripts を開く前に前提確認が必要な状態"
          summary="いまは main loop に戻る段階ではなく、Supabase の前提を整える段階です。"
          tone="alert"
        />
        <StateStepSection
          eyebrow="Recovery plan"
          title="Supabase の設定を確認する"
          summary={`${authState.message} \`NEXT_PUBLIC_SUPABASE_URL\` と \`NEXT_PUBLIC_SUPABASE_ANON_KEY\` を設定してから戻ります。`}
          tone="alert"
        />
        <StateActionSection
          eyebrow="Next action"
            title="次に押す操作を決める"
            summary="まず login か設定確認に進み、元の scripts 系 route に戻るのは復旧後で十分です。"
            actions={[
            { label: "login", href: buildLoginHref(nextPath, "supabase_not_configured", "/scripts"), tone: "primary" }
          ]}
        />
        <StateActionSection
          eyebrow="Other actions"
          title="補助導線"
          actions={[
            { label: "home", href: "/" },
            { label: "progress", href: "/progress" }
          ]}
        />
      </section>
    );
  }

  if (!authState.user) {
    redirect(buildLoginHref(nextPath, "login_required", "/scripts"));
  }

  return <>{children}</>;
}
