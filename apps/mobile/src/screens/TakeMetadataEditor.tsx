import { useEffect, useRef, useState } from "react";
import type { MobileTakeMetadata, TakeMetadataPatch } from "../lib/api";
import type { MobileReview, PracticeApi, PracticeRequestFailure } from "../practice/api";
import { RequestError } from "./ScreenParts";

export function TakeMetadataEditor({ api, review, onSaved, onReload }: {
  api: PracticeApi; review: MobileReview;
  onSaved: (metadata: MobileTakeMetadata) => void; onReload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(review.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<PracticeRequestFailure | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    return () => { generation.current += 1; };
  }, [api, review.takeId]);

  async function save(input: TakeMetadataPatch) {
    if (lock.current) return;
    lock.current = true;
    const current = generation.current;
    setSaving(true);
    setError(null);
    try {
      const result = await api.updateTakeMetadata(review.takeId, input);
      if (current !== generation.current) return;
      if (result.kind === "success") {
        onSaved(result.metadata);
        setName(result.metadata.displayName ?? "");
        setEditing(false);
      } else setError(result);
    } catch {
      if (current === generation.current) setError({ kind: "network-error" });
    } finally {
      if (current === generation.current) {
        lock.current = false;
        setSaving(false);
      }
    }
  }

  return <section className="review-section take-metadata" aria-labelledby="take-metadata-title" aria-busy={saving}>
    <h2 id="take-metadata-title">自分の録音</h2>
    <div className="take-metadata-actions">
      <button type="button" className="review-text-action" aria-pressed={review.favorite} disabled={saving || error !== null}
        onClick={() => void save({ favorite: !review.favorite })}>{review.favorite ? "♥ お気に入り" : "♡ お気に入り"}</button>
      {!editing ? <button type="button" className="review-text-action" disabled={saving || error !== null}
        onClick={() => { setName(review.displayName ?? ""); setEditing(true); }}>{review.displayName ? "名前を変更" : "名前をつける"}</button> : null}
    </div>
    {editing ? <form onSubmit={event => { event.preventDefault(); void save({ displayName: name }); }}>
      <label htmlFor="take-display-name">録音名（60文字まで）</label>
      <input id="take-display-name" value={name} maxLength={60} disabled={saving || error !== null}
        onChange={event => setName(event.target.value)} aria-describedby="take-name-help" />
      <p id="take-name-help" className="review-meta">空欄で保存すると名前を消せます。台本名は変わりません。</p>
      <div className="take-metadata-actions">
        <button type="submit" className="review-text-action" disabled={saving || error !== null}>保存</button>
        <button type="button" className="review-text-action" disabled={saving} onClick={() => setEditing(false)}>キャンセル</button>
      </div>
    </form> : null}
    {saving ? <p role="status">保存しています…</p> : null}
    {error ? <><p role="status">保存を確認できませんでした。再読み込みして状態を確認してください。</p><RequestError error={error} onRetry={onReload} /></> : null}
  </section>;
}
