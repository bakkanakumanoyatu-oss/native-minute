import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { getGalleryItem } from "@/lib/gallery/public";
import { getCurrentUser } from "@/lib/supabase/auth";
import { buildLoginHref } from "@/lib/navigation";
import { getGalleryPracticePayload } from "@/services/gallery/gallery-content.service";
import { GalleryCreateButton } from "@/components/gallery/gallery-create-button";
import { GallerySaveButton } from "@/components/gallery/gallery-save-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { personalGalleryEnabled } from "@/lib/gallery/personal-rollout";

export const dynamic = "force-dynamic";

export default async function GalleryDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { return?: string } }) {
  const item = getGalleryItem(params.id);
  if (!item) notFound();
  const user = await getCurrentUser();
  const back = searchParams?.return?.startsWith("/gallery?") ? searchParams.return : "/gallery?scope=examples";
  let personalId: string | null = null;
  if (user && personalGalleryEnabled()) {
    const { data } = await createSupabaseServerClient().from("personal_gallery_items").select("id").eq("user_id", user.id).eq("source_example_id", item.id).maybeSingle();
    personalId = (data as { id: string } | null)?.id ?? null;
  }
  let practice: Awaited<ReturnType<typeof getGalleryPracticePayload>> | null = null;
  if (item.publicationMode === "PRACTICE") {
    if (!user) redirect(buildLoginHref(`/gallery/${encodeURIComponent(item.id)}`, "login_required", "/gallery"));
    try { practice = await getGalleryPracticePayload(item.id); } catch { practice = null; }
  }
  return <article lang="ja" className="mx-auto max-w-3xl space-y-6 rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-6 sm:p-8">
    <Link href={back} className="text-sm font-semibold text-ink-700">← Galleryへ</Link>
    <header><p className="text-sm text-ink-600">{item.sourceType} · {item.themes.join(" / ")}</p><h1 className="mt-2 break-words text-3xl font-semibold text-ink-900">{item.title}</h1><p className="mt-2 text-sm text-ink-600">{item.workTitle} · {item.speaker}</p></header>
    <section><h2 className="text-xl font-semibold">What was happening?</h2><p className="mt-2 text-sm leading-7">{item.moment}</p><p className="mt-2 text-sm leading-7">{item.contextJa}</p></section>
    <section><h2 className="text-xl font-semibold">Why this moment matters</h2><p className="mt-2 text-sm leading-7">{item.whyItMattersJa}</p></section>
    {item.publicationMode === "PRACTICE" ? <section><h2 className="text-xl font-semibold">The words</h2>{practice ? <><p lang={practice.locale} className="mt-3 whitespace-pre-wrap rounded-2xl bg-[var(--script-paper)] p-4 text-base leading-8">{practice.practiceTextEn}</p>{practice.translationJa ? <p className="mt-3 text-sm leading-7">{practice.translationJa}</p> : null}</> : <p role="status" className="mt-3 text-sm">練習文は現在表示できません。後で試してください。</p>}</section> : null}
    {item.speakingNotes.length ? <section><h2 className="text-xl font-semibold">Listen for</h2><ul className="mt-2 list-inside list-disc text-sm leading-7">{item.speakingNotes.map(note => <li key={note}>{note}</li>)}</ul></section> : null}
    <section><h2 className="text-xl font-semibold">Try it yourself</h2>{personalGalleryEnabled() ? <><p className="mt-2 text-sm leading-7">場面を保存しておき、利用できる英文を後から追加できます。</p><div className="mt-4"><GallerySaveButton itemId={item.id} initialPersonalId={personalId} loggedIn={Boolean(user)} /></div></> : item.publicationMode === "DISCOVERY" ? <Link className="mt-4 inline-flex rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 text-sm font-semibold text-[var(--cta-primary-text)]" href="/scripts/new">自分の台本を作る</Link> : null}{item.publicationMode === "PRACTICE" && practice ? <div className="mt-5"><p className="mb-2 text-sm">この一節をすぐ練習する</p><GalleryCreateButton itemId={item.id} /></div> : null}</section>
    <section><h2 className="text-xl font-semibold">Original source</h2>{item.primarySourceUrl ? <a className="mt-2 inline-block break-all text-sm underline" href={item.primarySourceUrl} target="_blank" rel="noopener noreferrer">原典を開く</a> : <p className="mt-2 text-sm">出典の場所: {item.canonicalSourceLocator}</p>}</section>
    <section><h2 className="text-xl font-semibold">Source & Credits</h2><p className="mt-2 text-sm leading-7">{item.workTitle} · {item.speaker}{item.year ? ` · ${item.year}` : ""}</p><p className="text-sm leading-7">出典: {item.canonicalSourceLocator}</p></section>
    {item.moreLikeThis.length ? <section><h2 className="text-xl font-semibold">More like this</h2><ul className="mt-2 space-y-2">{item.moreLikeThis.map(id => { const related = getGalleryItem(id); return related ? <li key={id}><Link className="text-sm underline" href={`/gallery/${id}`}>{related.title}</Link></li> : null; })}</ul></section> : null}
  </article>;
}
