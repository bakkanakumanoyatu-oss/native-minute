import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildLoginHref } from "@/lib/navigation";
import { getPersonalGalleryItem } from "@/services/gallery/personal-gallery.service";
import { PersonalGalleryActions } from "@/components/gallery/personal-gallery-actions";
import { personalGalleryEnabled } from "@/lib/gallery/personal-rollout";

export const dynamic = "force-dynamic";
export default async function PersonalGalleryDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { return?: string } }) {
  if (!personalGalleryEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(buildLoginHref(`/gallery/mine/${params.id}`, "login_required", "/gallery"));
  const item = await getPersonalGalleryItem(createSupabaseServerClient(), user.id, params.id);
  if (!item) notFound();
  const back = searchParams?.return?.startsWith("/gallery?") ? searchParams.return : "/gallery";
  return <article lang="ja" className="mx-auto max-w-3xl space-y-6 rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-6 sm:p-8">
    <Link className="text-sm font-semibold" href={back}>← 自分のコレクション</Link>
    <header><p className="text-sm text-ink-600">{item.workTitle || item.sourceType || "自分の場面"}</p><h1 className="mt-2 break-words text-3xl font-semibold">{item.sceneTitle}</h1>{item.speaker ? <p className="mt-2 text-sm">{item.speaker}</p> : null}</header>
    <PersonalGalleryActions item={item} />
    {item.context ? <section><h2 className="text-lg font-semibold">この場面</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{item.context}</p></section> : null}
    {item.personalNote ? <section><h2 className="text-lg font-semibold">自分のメモ</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{item.personalNote}</p></section> : null}
    {item.excerptText ? <section><h2 className="text-lg font-semibold">保存した英文</h2><p lang={item.locale} className="mt-2 whitespace-pre-wrap break-words rounded-2xl bg-[var(--script-paper)] p-4 leading-8">{item.excerptText}</p></section> : <p className="text-sm">英文はまだありません。場面はこのまま保存されています。</p>}
    {item.speakingNotes.length ? <section><h2 className="text-lg font-semibold">Listen for</h2><ul className="mt-2 list-inside list-disc text-sm leading-7">{item.speakingNotes.map(note => <li key={note}>{note}</li>)}</ul></section> : null}
    {item.sourceUrl ? <a className="inline-block break-all text-sm underline" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">出典を開く</a> : item.sourceLocator ? <p className="text-sm">出典: {item.sourceLocator}</p> : null}
  </article>;
}
