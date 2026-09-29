"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PersonalGalleryItem } from "@/lib/gallery/personal-types";

export function PersonalGalleryForm({ initial }: { initial?: PersonalGalleryItem }) {
  const router = useRouter();
  const [sceneTitle, setSceneTitle] = useState(initial?.sceneTitle ?? "");
  const [workTitle, setWorkTitle] = useState(initial?.workTitle ?? "");
  const [sourceType, setSourceType] = useState(initial?.sourceType ?? "");
  const [speaker, setSpeaker] = useState(initial?.speaker ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [personalNote, setPersonalNote] = useState(initial?.personalNote ?? "");
  const [excerptText, setExcerptText] = useState(initial?.excerptText ?? "");
  const [expanded, setExpanded] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = "mt-1 w-full rounded-xl border border-[var(--line-inset)] bg-[var(--script-paper)] p-3";
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    const body = { sceneTitle, workTitle: workTitle || null, sourceType: sourceType || null,
      speaker: speaker || null, sourceUrl: sourceUrl || null, personalNote: personalNote || null,
      excerptText: excerptText || null, ...(initial ? { expectedLockVersion: initial.lockVersion } : {}) };
    try {
      const response = await fetch(initial ? `/api/personal-gallery/${initial.id}` : "/api/personal-gallery", {
        method: initial ? "PATCH" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.data?.id) throw new Error(result.message || "保存できませんでした。");
      router.push(`/gallery/mine/${result.data.id}`); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={event => void save(event)} className="mx-auto max-w-2xl space-y-5 rounded-[2rem] border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-6 sm:p-8" lang="ja">
    <Link className="text-sm font-semibold" href={initial ? `/gallery/mine/${initial.id}` : "/gallery"}>← Galleryへ</Link>
    <h1 className="text-3xl font-semibold">{initial ? "場面を編集" : "話したい場面を追加"}</h1>
    <p className="text-sm leading-6">場面の名前だけで保存できます。英文は後からでも大丈夫です。</p>
    <label className="block text-sm font-semibold">場面の名前 <span aria-hidden="true">*</span><input autoFocus required maxLength={240} value={sceneTitle} onChange={event => setSceneTitle(event.target.value)} className={field} placeholder="どんな場面・言葉を残したい？" /></label>
    <label className="block text-sm">作品名（任意）<input maxLength={240} value={workTitle} onChange={event => setWorkTitle(event.target.value)} className={field} placeholder="映画・本・スピーチなど" /></label>
    <button type="button" aria-expanded={expanded} className="rounded-xl border border-[var(--line-inset)] px-4 py-3 text-sm font-semibold" onClick={() => setExpanded(!expanded)}>{expanded ? "追加項目を閉じる" : "英文・URL・メモを追加"}</button>
    {expanded ? <div className="space-y-4">
      <label className="block text-sm">種類<input maxLength={80} value={sourceType} onChange={event => setSourceType(event.target.value)} className={field} placeholder="Movies, Books, Your Story…" /></label>
      <label className="block text-sm">話し手<input maxLength={160} value={speaker} onChange={event => setSpeaker(event.target.value)} className={field} /></label>
      <label className="block text-sm">出典 URL<input type="url" maxLength={2048} value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} className={field} placeholder="https://…" /></label>
      <label className="block text-sm">自分のメモ<textarea maxLength={4000} value={personalNote} onChange={event => setPersonalNote(event.target.value)} rows={4} className={field} /></label>
      <label className="block text-sm">利用できる英文<textarea maxLength={20000} value={excerptText} onChange={event => setExcerptText(event.target.value)} rows={8} className={field} /></label>
      <p className="text-xs leading-5">自分が利用できる英文を追加してください。保存した英文は自分のコレクションに保存されます。</p>
    </div> : null}
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
    <button type="submit" disabled={busy} className="w-full rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 font-semibold text-[var(--cta-primary-text)]">{busy ? "保存中…" : "コレクションに保存"}</button>
  </form>;
}
