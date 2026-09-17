import type { PracticeApi } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { recentPractice, TakeRows, useSavedProgress } from "./HomeScreen";
import { LoadingState, RequestError } from "./ScreenParts";

export function TakesScreen({ api, isOnline, scriptId, onNavigate, onBack }: { api: PracticeApi; isOnline: boolean; scriptId?: string; onNavigate: (route: PracticeRoute) => void; onBack: () => void }) {
  const { state, retry } = useSavedProgress(api, isOnline);
  const rows = state.kind === "ready" ? recentPractice(state.progress).filter(row => !scriptId || row.item.script.id === scriptId) : [];
  return <section className="takes-screen personal-space" lang="ja">
    <button className="space-text" onClick={onBack}>← 戻る</button><h1>録音履歴</h1><p className="space-meta">評価して保存したTakeの結果を振り返れます。</p>
    {state.kind === "loading" ? <LoadingState label="録音履歴を読み込んでいます…" /> : null}
    {state.kind === "error" ? <RequestError error={state.error} onRetry={retry} /> : null}
    {state.kind === "ready" ? rows.length ? <TakeRows rows={rows} onNavigate={onNavigate} /> : <p>保存済みTakeはまだありません。</p> : null}
  </section>;
}
