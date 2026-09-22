import type { PracticeRequestFailure } from "../practice/api";

export function MetadataRefresh({ refreshing, reason, error, isOnline, onRefresh }: {
  refreshing: boolean; reason?: string; error?: PracticeRequestFailure; isOnline: boolean; onRefresh: () => void;
}) {
  return <div className="metadata-refresh">
    <button type="button" className="review-text-action" disabled={!isOnline || refreshing} onClick={onRefresh}>
      {error ? "更新を再試行" : "更新"}
    </button>
    {refreshing && reason === "manual" ? <span role="status">更新中…</span> : null}
    {error ? <p role="status" className="review-meta">更新できませんでした。前回取得した記録を表示しています。{error.kind === "rate-limited" ? `${error.retryAfterSeconds}秒ほど待ってから再試行してください。` : "通信を確認して再試行してください。"}</p> : null}
  </div>;
}
