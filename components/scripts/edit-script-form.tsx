"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ScriptListItem } from "@/services/scripts/types";
import { getScriptLength, getScriptLengthError, MAX_SCRIPT_CHARACTERS, MAX_SCRIPT_WORDS } from "@/lib/script-length";
export function EditScriptForm({ script }: { script: ScriptListItem }) {
  const router = useRouter();
  const [base, setBase] = useState(script);
  const [title, setTitle] = useState(script.title);
  const [content, setContent] = useState(script.content);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyChanged = content.trim() !== base.content.trim();
  const length = getScriptLength(content);
  const lengthError = bodyChanged ? getScriptLengthError(content) : null;
  async function save() {
    if (!base.archivedAt && lengthError) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/scripts/${script.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(base.archivedAt
        ? { archived: false, expectedLockVersion: base.lockVersion }
        : { title, ...(bodyChanged ? { content } : {}), expectedRevisionId: base.currentRevisionId, expectedLockVersion: base.lockVersion }) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.message ?? "保存できませんでした。"); return; }
      router.push("/scripts"); router.refresh();
    } catch { setMessage("通信に失敗しました。下書きは保持されています。"); }
    finally { setBusy(false); }
  }
  async function refresh() {
    try { const response = await fetch(`/api/scripts/${script.id}`, { cache: "no-store" }); const result = await response.json();
      if (response.ok && result.data?.script) { setBase(result.data.script); setMessage("最新状態を確認しました。下書きの内容で保存するには、もう一度保存してください。"); }
    } catch { setMessage("最新状態を確認できませんでした。"); }
  }
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <h1>{base.archivedAt ? "台本を復元" : "台本を編集"}</h1>
    <label className="block">タイトル<input className="block w-full" value={title} maxLength={120} required onChange={event => setTitle(event.target.value)} disabled={busy || !!base.archivedAt} /></label>
    <label className="block">英語台本<textarea className="block w-full" rows={10} value={content} required aria-describedby="edit-script-length-note" onChange={event => setContent(event.target.value)} disabled={busy || !!base.archivedAt} /></label>
    <div id="edit-script-length-note" className="space-y-1 text-sm">
      <p>{length.wordCount} / {MAX_SCRIPT_WORDS} words · {length.characterCount} / {MAX_SCRIPT_CHARACTERS.toLocaleString("en-US")}文字</p>
      <p>60秒目標の目安は約100〜130語。200語は保存上限で、60秒に収まる保証ではありません。</p>
      {lengthError ? <p role="alert">{lengthError} 入力は残ります。短くしてから保存してください。</p> : null}
      {!bodyChanged && length.exceedsLimit ? <p>既存本文は上限を超えています。本文を変えないタイトル編集は保存できます。</p> : null}
    </div>
    <p>本文を変更しても、以前の録音・結果は保存時の台本で残ります。</p>
    {message ? <p role="alert">{message}</p> : null}
    {message ? <button type="button" onClick={() => void refresh()}>下書きを残して最新状態を確認</button> : null}
    <button type="submit" disabled={busy || (!base.archivedAt && !!lengthError)}>{busy ? "保存中…" : base.archivedAt ? "復元する" : "変更を保存"}</button>
  </form>;
}
