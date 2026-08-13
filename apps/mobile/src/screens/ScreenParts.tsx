import type { ReactNode } from "react";
import { getPracticeErrorCopy, type PracticeRequestFailure } from "../practice/api";

export type NavigateOptions = { replace?: boolean };

export function LoadingState({ label }: { label: string }) {
  return <p className="practice-loading" role="status">{label}</p>;
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

export function RequestError({
  error,
  onRetry,
  retryLabel = "再試行"
}: {
  error: PracticeRequestFailure;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="auth-error" role="alert">
      <p>{getPracticeErrorCopy(error)}</p>
      {onRetry ? (
        <button type="button" className="secondary-button" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ScreenHeading({
  eyebrow,
  title,
  detail
}: {
  eyebrow: string;
  title: string;
  detail?: string;
}) {
  return (
    <header className="practice-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {detail ? <p>{detail}</p> : null}
    </header>
  );
}

export function formatSeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function formatReviewDate(value: string | null) {
  if (!value) {
    return "保存済み";
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? "保存済み"
    : new Intl.DateTimeFormat("ja-JP", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(timestamp);
}
