"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { getScriptLength } from "@/lib/script-length";
import { selectedStoredExcerpt } from "@/lib/gallery/range-selection";
import type { PersonalGalleryItem } from "@/lib/gallery/personal-types";

export function PersonalGalleryActions({ item }: { item: PersonalGalleryItem }) {
  const router = useRouter();
  const excerpt = item.excerptText ?? "";
  const long = Boolean(excerpt && getScriptLength(excerpt).exceedsLimit);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [scriptTitle, setScriptTitle] = useState(item.sceneTitle.length <= 120 ? item.sceneTitle : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  async function create() {
    if (busy || !excerpt) return;
    if (!scriptTitle.trim()) { setRangeOpen(true); titleRef.current?.focus(); return; }
    if (long && !selected) { setRangeOpen(true); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/personal-gallery/${item.id}/create-script`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedLockVersion: item.lockVersion, scriptTitle, selectedText: long ? selected : null })
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.data?.id) throw new Error(result.message || "台本を作成できませんでした。");
      router.push(`/scripts/${result.data.id}/listen?created=1`); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "台本を作成できませんでした。"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !window.confirm("この場面をコレクションから削除しますか？ 作成済みの台本は残ります。")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/personal-gallery/${item.id}`, { method: "DELETE", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedLockVersion: item.lockVersion }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "削除できませんでした。");
      router.push("/gallery"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "削除できませんでした。"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    {item.linkedScriptId ? <Link className="inline-flex rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 font-semibold text-[var(--cta-primary-text)]" href={item.linkedScriptArchivedAt ? "/scripts/archived" : `/scripts/${item.linkedScriptId}/listen`}>{item.linkedScriptArchivedAt ? "一覧から外した台本を見る" : "作成した台本を開く"}</Link> : !excerpt ? <Link className="inline-flex rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 font-semibold text-[var(--cta-primary-text)]" href={`/gallery/mine/${item.id}/edit`}>英文を追加する</Link> : <>
      {long ? <button type="button" className="rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 font-semibold text-[var(--cta-primary-text)]" onClick={() => setRangeOpen(true)}>練習する範囲を選ぶ</button> : <button type="button" disabled={busy} className="rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 font-semibold text-[var(--cta-primary-text)]" onClick={() => void create()}>{busy ? "作成中…" : scriptTitle.trim() ? "練習台本にする" : "台本名を入力する"}</button>}
      {(rangeOpen || item.sceneTitle.length > 120) ? <div className="space-y-3 rounded-xl border border-[var(--line-inset)] p-4">
        <label className="block text-sm">台本名（120文字以内）<input ref={titleRef} value={scriptTitle} maxLength={120} onChange={event => setScriptTitle(event.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>
        {long ? <><p className="text-sm">保存した英文の連続する一節を選択してください。200語・2,000文字以内で台本にできます。</p><textarea ref={textRef} readOnly value={excerpt} rows={9} className="w-full rounded-xl border bg-[var(--script-paper)] p-3" onSelect={() => { const element = textRef.current; if (element) setSelected(selectedStoredExcerpt(excerpt, element.selectionStart, element.selectionEnd)); }} aria-label="保存した英文から練習範囲を選択" /><p className="text-sm">選択範囲: {selected ? `${getScriptLength(selected).wordCount}語・${getScriptLength(selected).characterCount}文字` : "未選択"}</p></> : null}
        <button type="button" disabled={busy || !scriptTitle.trim() || (long && (!selected || getScriptLength(selected).exceedsLimit))} className="rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 font-semibold text-[var(--cta-primary-text)]" onClick={() => void create()}>{busy ? "作成中…" : long ? "選んだ範囲で台本を作る" : "台本を作る"}</button>
      </div> : null}
    </>}
    <div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href={`/gallery/mine/${item.id}/edit`}>編集</Link><button type="button" disabled={busy} className="underline" onClick={() => void remove()}>削除</button></div>
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
  </div>;
}
