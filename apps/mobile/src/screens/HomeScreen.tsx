import "./HomeScreen.css";
import { MetadataRefresh } from "./MetadataRefresh";
import { useSavedProgress } from "../practice/use-saved-progress";
export { useSavedProgress } from "../practice/use-saved-progress";
import type { MobileProgress, PracticeApi } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, formatReviewDate } from "./ScreenParts";

export function recentPractice(progress: MobileProgress) {
  return progress.scripts.flatMap(item => item.takeHistory.map(take => ({ take, item })))
    .sort((a, b) => b.take.createdAt.localeCompare(a.take.createdAt) || b.take.id.localeCompare(a.take.id));
}

// Preview only the actual English script; blank/missing content has no invented fallback.
export function scriptFirstLine(content: string | null | undefined) {
  return content?.split(/\r\n|[\n\r\u2028\u2029]/).map(line => line.trim()).find(Boolean);
}

type Navigation = { onNavigate: (route: PracticeRoute) => void };

export function HomeContent({ progress, onNavigate }: { progress: MobileProgress } & Navigation) {
  // One row per practiced script; latest/best stay server-selected.
  const recent = progress.scripts.flatMap(item => !item.script.archivedAt && item.latestTake ? [{ item, take: item.latestTake }] : [])
    .sort((a, b) => b.take.createdAt.localeCompare(a.take.createdAt) || b.take.id.localeCompare(a.take.id));
  const latest = recent[0];
  const allTakes = recentPractice(progress);
  const savedTakes = allTakes.slice(0, 2);
  const favorites = allTakes.filter(row => row.take.favorite);
  if (!latest && progress.totalReviewedTakes === 0) return <section className="space-first">
    <p className="space-meta">練習すると、ここに結果と録音が残ります。</p>
    <button className="space-primary" onClick={() => onNavigate({ name: "scripts" })}>
      練習する <span aria-hidden="true">→</span>
    </button>
    <section className="space-section space-script-preview" aria-labelledby="space-script-preview-title">
      <div className="space-section-heading">
        <h1 id="space-script-preview-title">台本から選ぶ</h1>
        <button className="space-text" onClick={() => onNavigate({ name: "scripts" })}>すべて見る →</button>
      </div>
      {/* Progress includes the owned scripts even before their first saved Take. */}
      {progress.scripts.some(item => !item.script.archivedAt) ? <ul className="space-takes" aria-label="台本から選ぶ">
        {progress.scripts.filter(item => !item.script.archivedAt).slice(0, 3).map(({ script }) => <li key={script.id}>
          <h2 className="space-script-title" lang={script.locale}>{script.title}</h2>
          <p className="space-meta">目標 {script.targetSeconds}秒 · <span lang="en">{script.locale}</span></p>
          <button className="space-practice" aria-label={`${script.title}を練習する`} onClick={() => onNavigate({ name: "listen", scriptId: script.id })}>練習する →</button>
        </li>)}
      </ul> : <p className="space-meta">まだ台本がありません。台本一覧で作成できます。</p>}
    </section>
  </section>;
  return <>
    <header className="space-welcome"><h1>おかえりなさい。</h1><p className="space-meta">今日も、自分のペースで。</p></header>
    {latest ? <section className="space-hero" aria-labelledby="space-practice-title">
      <p className="space-eyebrow">今すぐ練習</p>
      <p className="space-selection-reason">最近練習した台本</p>
      <h2 id="space-practice-title" lang={latest.item.script.locale}>{latest.item.script.title}</h2>
      <button className="space-primary" onClick={() => onNavigate({ name: "listen", scriptId: latest.item.script.id })}>練習する <span aria-hidden="true">→</span></button>
    </section> : <><p>前回の台本を表示できません。台本から練習を始められます。</p><button className="space-primary" onClick={() => onNavigate({ name: "scripts" })}>練習する <span aria-hidden="true">→</span></button></>}
    <section className="space-section space-recent-section"><div className="space-section-heading"><h2>最近の練習</h2><button className="space-text" onClick={() => onNavigate({ name: "takes" })}>履歴へ →</button></div><ol className="space-takes space-recent" aria-label="最近練習した台本">
      {recent.slice(0, 3).map(({ item, take }) => <li key={item.script.id}>
        <div className="space-recent-info">
          <strong className="space-script-title" lang={item.script.locale}>{item.script.title}</strong>
          {scriptFirstLine(item.script.content) ? <p className="space-script-preview-line" lang={item.script.locale}>{scriptFirstLine(item.script.content)}</p> : null}
        </div>
        <div className="space-recent-actions">
        <button className="space-practice" aria-label={`${item.script.title}を練習する`} onClick={() => onNavigate({ name: "listen", scriptId: item.script.id })}>練習する <span aria-hidden="true">→</span></button>
        <button className="space-text space-result-link" aria-label={`${item.script.title}の前回の結果を見る`} onClick={() => onNavigate({ name: "review", scriptId: item.script.id, takeId: take.id })}>前回の結果を見る →</button>
        </div>
      </li>)}
    </ol></section>
    <div className="space-counts"><button onClick={() => onNavigate({ name: "progress" })}><strong>{new Set(progress.scripts.filter(item => (item.allTimeTakeCount ?? item.takeCount) > 0).map(item => item.script.id)).size}</strong><span>練習した<wbr />台本</span></button><button onClick={() => onNavigate({ name: "takes" })}><strong>{progress.totalReviewedTakes}</strong><span>録音・<wbr />評価済み</span></button><button onClick={() => onNavigate({ name: "takes", favorites: true })}><strong>{favorites.length}</strong><span>お気に入り</span></button></div>
    {favorites.length > 0 ? <section className="space-section space-favorites" aria-labelledby="space-favorites-title">
      <div className="space-section-heading"><h2 id="space-favorites-title">お気に入りの録音</h2>
        <button className="space-text" onClick={() => onNavigate({ name: "takes", favorites: true })}>すべて見る →</button></div>
      <HomeTakeRows variant="favorite" rows={favorites.slice(0, 2)} onNavigate={onNavigate} />
    </section> : null}
    {savedTakes.length > 0 ? <section className="space-section space-own-takes" aria-labelledby="space-own-takes-title">
      <div className="space-section-heading">
        <h2 id="space-own-takes-title">録音・評価済み <span className="space-preview-count" aria-label={`全${progress.totalReviewedTakes}件中${savedTakes.length}件を表示`}>{savedTakes.length} / {progress.totalReviewedTakes}</span></h2>
        <button className="space-text" onClick={() => onNavigate({ name: "takes" })}>録音履歴へ →</button>
      </div>
      <HomeTakeRows variant="history" rows={savedTakes} onNavigate={onNavigate} />
      {progress.totalReviewedTakes > savedTakes.length ? <p className="space-preview-more" aria-label="録音履歴に続きがあります">…</p> : null}
    </section> : null}
  </>;
}

function HomeTakeRows({ rows, variant, onNavigate }: { rows: ReturnType<typeof recentPractice>; variant: "favorite" | "history" } & Navigation) {
  return <ol className={`space-takes space-recordings-${variant}`}>{rows.map(({ take, item }) => <li key={take.id}>
    <button className="space-text space-recording-row" onClick={() => onNavigate({ name: "review", scriptId: item.script.id, takeId: take.id })}>
      <strong lang={take.displayName ? undefined : item.script.locale}>{take.displayName ?? take.scriptTitleSnapshot ?? `現在の台本名: ${item.script.title}`}</strong>
      {take.displayName ? <span className="space-recording-script" lang={item.script.locale}>{item.script.title}</span> : null}
      <span className="space-recording-detail">
        {variant === "history" ? <><span>スコア {take.score}</span><time dateTime={take.reviewedAt ?? take.createdAt}>{formatReviewDate(take.reviewedAt ?? take.createdAt)}</time></> : null}
        <span className="space-recording-result">結果を見る →</span>
      </span>
    </button>
  </li>)}</ol>;
}

export function TakeRows({ rows, onNavigate }: { rows: ReturnType<typeof recentPractice> } & Navigation) {
  return <ol className="space-takes">{rows.map(({ take, item }) => <li key={take.id}><button className="space-text" onClick={() => onNavigate({ name: "review", scriptId: item.script.id, takeId: take.id })}><span className="space-meta">{formatReviewDate(take.reviewedAt ?? take.createdAt)}</span><strong>{take.displayName ?? take.scriptTitleSnapshot ?? `現在の台本名: ${item.script.title}`}</strong>{take.displayName ? <span className="space-meta">台本: {item.script.title}</span> : null}{take.favorite ? <span className="space-meta">♥ お気に入り</span> : null}<span className="space-meta">スコア {take.score} · 結果を見る →</span></button></li>)}</ol>;
}

export function HomeScreen({ api, isOnline, onNavigate }: { api: PracticeApi; isOnline: boolean } & Navigation) {
  const { state, retry } = useSavedProgress(api, isOnline);
  return <section className="home-screen personal-space" lang="ja">
    {state.kind === "loading" ? <LoadingState label="記録を読み込んでいます…" /> : null}
    {state.kind === "error" ? <><h1>おかえりなさい。</h1><h2>記録を読み込めませんでした</h2><p>台本や録音がなくなったわけではありません。</p><RequestError error={state.error} onRetry={retry} /></> : null}
    {state.kind === "ready" ? <MetadataRefresh refreshing={state.refreshing} reason={state.refreshReason} error={state.updateError} isOnline={isOnline} onRefresh={retry} /> : null}
    {state.kind === "ready" ? <HomeContent progress={state.progress} onNavigate={onNavigate} /> : null}
  </section>;
}
