import { useEffect, useState } from "react";
import type { MobileProgress, PracticeApi, PracticeRequestFailure } from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { LoadingState, RequestError, formatReviewDate } from "./ScreenParts";

export function recentPractice(progress: MobileProgress) {
  return progress.scripts.flatMap(item => item.takeHistory.map(take => ({ take, item })))
    .sort((a, b) => b.take.createdAt.localeCompare(a.take.createdAt) || b.take.id.localeCompare(a.take.id));
}

export function useSavedProgress(api: PracticeApi, isOnline: boolean) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; progress: MobileProgress } | { kind: "error"; error: PracticeRequestFailure }>({ kind: "loading" });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    if (isOnline) {
      void api.getProgress().then(result => {
        if (active) setState(result.kind === "success" ? { kind: "ready", progress: result.progress } : { kind: "error", error: result });
      }).catch(() => {
        if (active) setState({ kind: "error", error: { kind: "network-error" } });
      });
    }
    return () => { active = false; };
  }, [api, isOnline, version]);
  return { state: isOnline ? state : { kind: "error" as const, error: { kind: "offline" as const } }, retry: () => { setState({ kind: "loading" }); setVersion(v => v + 1); } };
}

type Navigation = { onNavigate: (route: PracticeRoute) => void };

export function HomeContent({ progress, onNavigate }: { progress: MobileProgress } & Navigation) {
  // One row per practiced script; latest/best stay server-selected.
  const recent = progress.scripts.flatMap(item => item.latestTake ? [{ item, take: item.latestTake }] : [])
    .sort((a, b) => b.take.createdAt.localeCompare(a.take.createdAt) || b.take.id.localeCompare(a.take.id));
  const latest = recent[0];
  const allTakes = recentPractice(progress);
  const savedTakes = allTakes.slice(0, 2);
  const favorites = allTakes.filter(row => row.take.favorite);
  if (!latest && progress.totalReviewedTakes === 0) return <section className="space-first">
    <p className="space-meta">練習すると、ここに結果と録音が残ります。</p>
    <button className="space-primary" onClick={() => onNavigate({ name: "scripts" })}>
      最初の台本を選ぶ <span aria-hidden="true">→</span>
    </button>
    <section className="space-section space-script-preview" aria-labelledby="space-script-preview-title">
      <div className="space-section-heading">
        <h1 id="space-script-preview-title">台本から選ぶ</h1>
        <button className="space-text" onClick={() => onNavigate({ name: "scripts" })}>すべて見る →</button>
      </div>
      {/* Progress includes the owned scripts even before their first saved Take. */}
      {progress.scripts.length ? <ul className="space-takes" aria-label="台本から選ぶ">
        {progress.scripts.slice(0, 3).map(({ script }) => <li key={script.id}>
          <h2 className="space-script-title" lang={script.locale}>{script.title}</h2>
          <p className="space-meta">目標 {script.targetSeconds}秒 · <span lang="en">{script.locale}</span></p>
          <button className="space-text" aria-label={`${script.title}を練習する`} onClick={() => onNavigate({ name: "listen", scriptId: script.id })}>練習する →</button>
        </li>)}
      </ul> : <p className="space-meta">まだ台本がありません。台本一覧で作成できます。</p>}
    </section>
  </section>;
  return <>
    <p className="space-eyebrow">YOUR SPACE</p><h1>おかえりなさい。</h1><p className="space-meta">今日も、自分のペースで。</p>
    {latest ? <>
      <section className="space-hero"><p className="space-eyebrow">CONTINUE YOUR PRACTICE</p><h2>{latest.item.script.title}</h2><p className="space-meta">保存済みの台本から · 録音は手動で開始</p>
        <button className="space-primary" onClick={() => onNavigate({ name: "listen", scriptId: latest.item.script.id })}>練習を続ける <span aria-hidden="true">→</span></button>
      </section>
      <section className="space-last" aria-labelledby="space-last-title">
        <h2 id="space-last-title">前回の結果</h2>
        <button className="space-text" onClick={() => onNavigate({ name: "review", scriptId: latest.item.script.id, takeId: latest.take.id })}>
          <strong className="space-script-title" lang={latest.item.script.locale}>{latest.item.script.title}</strong>
          <span className="space-result-scores">
            <span>前回 <strong>{latest.take.score}点</strong></span>
            {latest.item.bestTake ? <span>同じ台本の最高点 <strong>{latest.item.bestTake.score}点</strong></span> : null}
          </span>
          <span className="space-meta"><time dateTime={latest.take.createdAt}>{formatReviewDate(latest.take.createdAt)}</time> · 結果を見る →</span>
        </button>
      </section>
    </> : <p>前回の台本を表示できません。台本から練習を始められます。</p>}
    <div className="space-counts"><button onClick={() => onNavigate({ name: "progress" })}><strong>{new Set(progress.scripts.filter(item => item.takeCount > 0).map(item => item.script.id)).size}</strong><span>練習した台本</span></button><button onClick={() => onNavigate({ name: "takes" })}><strong>{progress.totalReviewedTakes}</strong><span>保存済み録音</span></button><button onClick={() => onNavigate({ name: "takes", favorites: true })}><strong>{favorites.length}</strong><span>お気に入り</span></button></div>
    <p className="space-meta space-count-note">録音数は評価して保存したTakeの件数です。</p>
    <section className="space-section"><div className="space-section-heading"><h2>最近の練習</h2><button className="space-text" onClick={() => onNavigate({ name: "takes" })}>履歴へ →</button></div><ol className="space-takes space-recent" aria-label="最近練習した台本">
      {recent.slice(0, 3).map(({ item, take }) => <li key={item.script.id}>
        <button className="space-text" onClick={() => onNavigate({ name: "review", scriptId: item.script.id, takeId: take.id })}>
          <strong className="space-script-title" lang={item.script.locale}>{item.script.title}</strong>
          <span className="space-result-scores">
            <span>前回 <strong>{take.score}点</strong></span>
            {item.bestTake ? <span>最高点 <strong>{item.bestTake.score}点</strong></span> : null}
          </span>
          <span className="space-meta"><time dateTime={take.createdAt}>{formatReviewDate(take.createdAt)}</time> · {item.takeCount} Takes</span>
        </button>
      </li>)}
    </ol></section>
    {favorites.length > 0 ? <section className="space-section" aria-labelledby="space-favorites-title">
      <div className="space-section-heading"><h2 id="space-favorites-title">お気に入りの録音</h2>
        <button className="space-text" onClick={() => onNavigate({ name: "takes", favorites: true })}>すべて見る →</button></div>
      <TakeRows rows={favorites.slice(0, 2)} onNavigate={onNavigate} />
    </section> : null}
    {savedTakes.length > 0 ? <section className="space-section space-own-takes" aria-labelledby="space-own-takes-title">
      <div className="space-section-heading">
        <h2 id="space-own-takes-title">自分の録音</h2>
        <button className="space-text" onClick={() => onNavigate({ name: "takes" })}>録音履歴へ →</button>
      </div>
      <TakeRows rows={savedTakes} onNavigate={onNavigate} />
    </section> : null}
  </>;
}

export function TakeRows({ rows, onNavigate }: { rows: ReturnType<typeof recentPractice> } & Navigation) {
  return <ol className="space-takes">{rows.map(({ take, item }) => <li key={take.id}><button className="space-text" onClick={() => onNavigate({ name: "review", scriptId: item.script.id, takeId: take.id })}><span className="space-meta">{formatReviewDate(take.reviewedAt ?? take.createdAt)}</span><strong>{take.displayName ?? item.script.title}</strong>{take.displayName ? <span className="space-meta">台本: {item.script.title}</span> : null}{take.favorite ? <span className="space-meta">♥ お気に入り</span> : null}<span className="space-meta">スコア {take.score} · 結果を見る →</span></button></li>)}</ol>;
}

export function HomeScreen({ api, isOnline, onNavigate }: { api: PracticeApi; isOnline: boolean } & Navigation) {
  const { state, retry } = useSavedProgress(api, isOnline);
  return <section className="home-screen personal-space" lang="ja">
    {state.kind === "loading" ? <LoadingState label="記録を読み込んでいます…" /> : null}
    {state.kind === "error" ? <><h1>おかえりなさい。</h1><h2>記録を読み込めませんでした</h2><p>台本や録音がなくなったわけではありません。</p><RequestError error={state.error} onRetry={retry} /></> : null}
    {state.kind === "ready" ? <HomeContent progress={state.progress} onNavigate={onNavigate} /> : null}
  </section>;
}
