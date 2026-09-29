"use client";

import Link from "next/link";
import { useState } from "react";

export function GallerySaveButton({ itemId, initialPersonalId, loggedIn }: { itemId: string; initialPersonalId?: string | null; loggedIn: boolean }) {
  const [personalId, setPersonalId] = useState(initialPersonalId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (personalId) return <Link className="inline-flex rounded-xl border border-[var(--line-inset)] px-5 py-3 text-sm font-semibold" href={`/gallery/mine/${personalId}`}>保存済み · 自分のコレクションで開く</Link>;
  if (!loggedIn) return <Link className="inline-flex rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 text-sm font-semibold text-[var(--cta-primary-text)]" href={`/login?next=${encodeURIComponent(`/gallery/${itemId}`)}`}>ログインしてコレクションに保存</Link>;
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/personal-gallery/examples/${encodeURIComponent(itemId)}`, { method: "POST", credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !payload.data?.id) throw new Error(payload?.message || "保存できませんでした。");
      setPersonalId(payload.data.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }
  return <div><button className="rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 text-sm font-semibold text-[var(--cta-primary-text)]" type="button" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "＋ コレクションに保存"}</button>{error ? <p role="alert" className="mt-2 text-sm">{error}</p> : null}</div>;
}
