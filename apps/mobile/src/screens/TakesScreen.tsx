import { useState } from "react";
import type { PracticeApi } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { recentPractice, TakeRows, useSavedProgress } from "./HomeScreen";
import { LoadingState, RequestError } from "./ScreenParts";

export function TakesScreen({ api, isOnline, scriptId, favorites = false, onNavigate, onBack }: { api: PracticeApi; isOnline: boolean; scriptId?: string; favorites?: boolean; onNavigate: (route: PracticeRoute) => void; onBack: () => void }) {
  const [favoriteOnly, setFavoriteOnly] = useState(favorites);
  const { state, retry } = useSavedProgress(api, isOnline);
  const rows = state.kind === "ready" ? recentPractice(state.progress).filter(row => (!scriptId || row.item.script.id === scriptId) && (!favoriteOnly || row.take.favorite)) : [];
  return <section className="takes-screen personal-space" lang="ja">
    <button className="space-text" onClick={onBack}>← 戻る</button><h1>自分の録音</h1><p className="space-meta">録音を選ぶと、結果の確認・再生・共有ができます。</p>
    <div className="take-filters" role="group" aria-label="録音の絞り込み">
      <button type="button" className="space-text" aria-pressed={!favoriteOnly} onClick={() => setFavoriteOnly(false)}>すべて</button>
      <button type="button" className="space-text" aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly(true)}>お気に入り</button>
    </div>
    {state.kind === "loading" ? <LoadingState label="録音履歴を読み込んでいます…" /> : null}
    {state.kind === "error" ? <RequestError error={state.error} onRetry={retry} /> : null}
    {state.kind === "ready" && state.refreshing ? <p role="status" className="space-meta">前回取得した記録を表示しています。最新情報を確認中…</p> : null}
    {state.kind === "ready" ? rows.length ? <TakeRows rows={rows} onNavigate={onNavigate} /> : <p>{favoriteOnly ? "お気に入りの録音はまだありません。Reviewで♡を押すと、ここに表示されます。" : "保存済みTakeはまだありません。"}</p> : null}
  </section>;
}
