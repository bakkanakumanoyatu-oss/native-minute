import { reviewDisplayMemory } from "../practice/display-loaders";
import { MetadataRefresh } from "./MetadataRefresh";
import { useDisplayMemory } from "../practice/use-display-memory";
import { useMemo, type ReactNode } from "react";
import type {
  MobileReview,
  PracticeApi
} from "../practice/api";
import type { PracticeRoute } from "../practice/routes";
import { TakeMetadataEditor } from "./TakeMetadataEditor";
import { SavedTakeAudio } from "./SavedTakeAudio";
import { LoadingState, RequestError, formatReviewDate } from "./ScreenParts";
function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt lang="en">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ReviewContent({
  review,
  onNavigate,
  metadataActions,
  scriptArchived = false
}: {
  review: MobileReview;
  metadataActions?: ReactNode;
  scriptArchived?: boolean;
  onNavigate: (route: PracticeRoute) => void;
}) {
  return (
    <>
      <section className="review-section"><h2>保存時の台本{review.recordStatus === "completed" ? "（旧形式記録）" : ""}</h2><p>{review.scriptSnapshot?.content ?? "当時の台本は未保存です（未検証の旧形式記録）。"}</p></section>
      <p className="review-date">{formatReviewDate(review.reviewedAt ?? review.createdAt)}</p>
      <section className="review-next-step" aria-labelledby="review-next-title">
        <h2 id="review-next-title">次の一歩</h2>
        {review.coach.focusWords.length > 0 ? (
          <ul className="review-focus" lang="en" aria-label="次に意識する語">
            {review.coach.focusWords.map((word, index) => (
              <li key={`${index}-${word}`}>
                {review.coach.focusWords.length === 2 && index === 1 ? (
                  <span className="review-focus-separator" aria-hidden="true">/</span>
                ) : null}
                <span className="review-focus-word">{word}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {scriptArchived ? <p>削除済みの台本です。練習を再開するには台本一覧から復元してください。</p> : null}
        <p className="review-advice">{review.coach.nextStepJa}</p>
        <button type="button" className="review-primary" disabled={scriptArchived} onClick={() => onNavigate({ name: "record", scriptId: review.scriptId })}>
          <span>次のTakeを録る</span><span className="review-arrow" aria-hidden="true">→</span>
        </button>
        <div className="review-listen">
          <button type="button" className="review-text-action" disabled={scriptArchived} onClick={() => onNavigate({ name: "listen", scriptId: review.scriptId })}>
            お手本を聞き直す
          </button>
        </div>
      </section>

      {metadataActions}
      <section className="review-results" aria-labelledby="review-result-title">
        <div className="review-result-top">
          <h2 id="review-result-title">今回の結果</h2>
          <p className="review-score" aria-label={`総合スコア ${review.evaluation.score} / 100`}>
            <span className="review-score-value">{review.evaluation.score}</span>
            <span className="review-meta">/ 100</span>
          </p>
        </div>
        <dl className="review-metrics">
          <Score label="Accuracy" value={review.evaluation.accuracyScore} />
          <Score label="Fluency" value={review.evaluation.fluencyScore} />
          <Score label="Rhythm" value={review.evaluation.rhythmScore} />
        </dl>
      </section>

      <section className="review-section review-weak" aria-labelledby="review-weak-title">
        <div className="review-result-top">
          <h2 id="review-weak-title">改善ワード</h2>
          {review.evaluation.weakWords.length > 0 ? <span className="review-meta">単語スコア</span> : null}
        </div>
        {review.evaluation.weakWords.length > 0 ? (
          <ul className="review-weak-list">
            {review.evaluation.weakWords.map((item, index) => (
              <li key={`${index}-${item.word}`}>
                <div className="review-weak-heading">
                  <strong lang="en">{item.word}</strong>
                  <span className="review-meta" aria-label={`単語スコア ${item.score}`}>{item.score}</span>
                </div>
                <p>{item.note}</p>
              </li>
            ))}
          </ul>
        ) : <p className="review-empty">今回、優先して直す単語はありません。</p>}
      </section>

      <section className="review-section review-transcript-section" aria-labelledby="review-transcript-title">
        <h2 id="review-transcript-title" lang="en">Transcript</h2>
        <p className="review-transcript" lang={review.transcriptText ? "en" : "ja"}>
          {review.transcriptText || "文字起こしは保存されませんでした。"}
        </p>
      </section>

      <section className="review-section review-feedback" aria-labelledby="review-feedback-title">
        <h2 id="review-feedback-title">詳細feedback</h2>
        <div className="review-feedback-block">
          <h3>評価</h3>
          <p>{review.evaluation.summaryJa}</p>
          {review.evaluation.strengthsJa.length > 0 ? (
            <ul>
              {review.evaluation.strengthsJa.map((strength, index) => <li key={`${index}-${strength}`}>{strength}</li>)}
            </ul>
          ) : null}
        </div>
        <div className="review-feedback-block">
          <h3>{review.coach.titleJa}</h3>
          <p>{review.coach.summaryJa}</p>
          {review.coach.bulletPointsJa.length > 0 ? (
            <ul>{review.coach.bulletPointsJa.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          ) : null}
        </div>
      </section>
    </>
  );
}

export function ReviewScreen({
  api,
  scriptId,
  takeId,
  isOnline,
  onNavigate
}: {
  api: PracticeApi;
  scriptId: string;
  takeId: string;
  isOnline: boolean;
  onNavigate: (route: PracticeRoute) => void;
}) {
  const memory = useMemo(() => api.reviewMemory ?? reviewDisplayMemory(api), [api]);
  const { state: visibleState, retry: reload } = useDisplayMemory(memory, `${scriptId}/${takeId}`, isOnline);

  return (
    <section className="review-screen">
      <p className="review-kicker">結果</p>
      {visibleState.kind === "ready" ? <MetadataRefresh refreshing={visibleState.refreshing} reason={visibleState.refreshReason} error={visibleState.updateError} isOnline={isOnline} onRefresh={reload} /> : null}
      {visibleState.kind === "loading" ? <LoadingState label="Reviewを読み込んでいます…" /> : null}
      {visibleState.kind === "error" ? <RequestError error={visibleState.error} onRetry={reload} /> : null}
      {visibleState.kind === "ready" ? (
        <>
          <div className="take-identity">
            <h1 className={visibleState.data.review.displayName ? "take-name" : "take-script-title"}>{visibleState.data.review.displayName ?? (visibleState.data.scriptTitle || "練習結果")}</h1>
            {visibleState.data.review.displayName ? <p className="review-meta">台本: <span lang="en">{visibleState.data.scriptTitle}</span></p> : null}
          </div>
          <ReviewContent scriptArchived={visibleState.data.scriptArchived} review={visibleState.data.review} onNavigate={onNavigate} metadataActions={<TakeMetadataEditor key={takeId} api={api} review={visibleState.data.review} onReload={reload}
            disabled={!isOnline} onSaved={metadata => memory.update((_key, data) => data.review.takeId === metadata.takeId &&
              (data.review.favorite !== metadata.favorite || data.review.displayName !== metadata.displayName), data => ({ ...data, review: { ...data.review, ...metadata } }))}>
              <p className="saved-take-name">{visibleState.data.review.displayName ?? visibleState.data.scriptTitle}</p>
              {visibleState.data.review.displayName ? <p className="review-meta">台本: {visibleState.data.scriptTitle}</p> : null}
              <p className="review-meta">{formatReviewDate(visibleState.data.review.reviewedAt ?? visibleState.data.review.createdAt)} · スコア {visibleState.data.review.evaluation.score}</p>
              <SavedTakeAudio key={takeId} api={api} takeId={takeId} review={visibleState.data.review} isOnline={isOnline && (!visibleState.refreshing || !!visibleState.data.review.audioVisit)} prefetchEnabled={visibleState.prefetchAllowed} />
            </TakeMetadataEditor>} />
        </>
      ) : (
        <button type="button" className="review-primary" disabled>
          <span>次のTakeを録る</span><span className="review-arrow" aria-hidden="true">→</span>
        </button>
      )}
      <div className="review-progress">
        <button type="button" className="review-text-action" onClick={() => onNavigate({ name: "takes", scriptId })}>
          録音履歴を見る
        </button>
      </div>
    </section>
  );
}
