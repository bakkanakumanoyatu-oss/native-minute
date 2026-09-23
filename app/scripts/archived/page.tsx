import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listScripts } from "@/services/scripts/scripts.service";
export default async function ArchivedScriptsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const scripts = await listScripts(createSupabaseServerClient(), user.id, "archived");
  return <section><h1>削除済みの台本</h1><p>録音・結果は残っています。練習するには復元してください。</p>
    <ul>{scripts.map(script => <li key={script.id}><Link href={`/scripts/${script.id}/edit`}>{script.title} — 復元</Link> · <Link href={`/progress?scriptId=${script.id}`}>履歴</Link></li>)}</ul>
    {!scripts.length ? <p>削除済みの台本はありません。</p> : null}<Link href="/scripts">台本一覧へ</Link></section>;
}
