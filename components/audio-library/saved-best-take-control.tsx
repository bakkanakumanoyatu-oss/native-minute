"use client";

import { BookmarkCheck, BookmarkPlus, X } from "lucide-react";
import { useEffect, useState } from "react";

type SavedBestTake = {
  id: string;
  take_id: string;
  slot: number;
  label: string;
};

type SavedBestTakesResponse = {
  ok: boolean;
  message?: string;
  code?: string;
  data?: {
    savedBestTakes?: SavedBestTake[];
    savedBestTake?: SavedBestTake;
    deleted?: boolean;
  };
};

type SavedBestTakeControlProps = {
  scriptId: string;
  takeId: string;
  isScoreBest?: boolean;
};

function getUserFacingBestTakeError(payload: SavedBestTakesResponse | null, fallback: string) {
  if (!payload) {
    return fallback;
  }

  if (payload.code === "library_full") {
    return "保存済みベスト録音は最大5件です。いずれかを外してから保存してください。";
  }

  if (payload.code === "already_saved") {
    return "この録音はすでにベスト保存されています。";
  }

  if (payload.code === "invalid_slot") {
    return "保存 slot を確認してください。";
  }

  if (payload.code === "saved_entry_not_found") {
    return "保存済みベスト録音が見つかりませんでした。ページを再読込してからもう一度お試しください。";
  }

  if (payload.code === "ownership_mismatch" || payload.code === "take_not_found") {
    return "保存対象の録音を確認できませんでした。";
  }

  return payload.message ?? fallback;
}

export function SavedBestTakeControl({ scriptId, takeId, isScoreBest = false }: SavedBestTakeControlProps) {
  const [savedBestTakes, setSavedBestTakes] = useState<SavedBestTake[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentSavedTake = savedBestTakes.find((take) => take.take_id === takeId) ?? null;

  async function refreshSavedBestTakes() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/saved-best-takes`, {
        credentials: "same-origin"
      });
      const payload = (await response.json().catch(() => null)) as SavedBestTakesResponse | null;

      if (!response.ok || !payload?.ok || !Array.isArray(payload.data?.savedBestTakes)) {
        setErrorMessage(getUserFacingBestTakeError(payload, "保存済みベスト録音を取得できませんでした。"));
        return;
      }

      setSavedBestTakes(payload.data.savedBestTakes);
    } catch {
      setErrorMessage("保存済みベスト録音の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMessage(null);
    setErrorMessage(null);
    void refreshSavedBestTakes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId, takeId]);

  async function handleSave() {
    setMutating(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/saved-best-takes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({
          takeId
        })
      });
      const payload = (await response.json().catch(() => null)) as SavedBestTakesResponse | null;

      if (!response.ok || !payload?.ok || !payload.data?.savedBestTake) {
        setErrorMessage(getUserFacingBestTakeError(payload, "録音をベスト保存できませんでした。"));
        return;
      }

      const savedBestTake = payload.data.savedBestTake;
      setSavedBestTakes((current) => {
        const withoutDuplicate = current.filter((take) => take.id !== savedBestTake.id);
        return [...withoutDuplicate, savedBestTake].sort((a, b) => a.slot - b.slot);
      });
      setMessage("ベストテイクとして保存しました。");
    } catch {
      setErrorMessage("録音をベスト保存できませんでした。通信状態を確認してもう一度お試しください。");
    } finally {
      setMutating(false);
    }
  }

  async function handleUnsave() {
    if (!currentSavedTake) {
      return;
    }

    setMutating(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/scripts/${encodeURIComponent(scriptId)}/saved-best-takes/${encodeURIComponent(currentSavedTake.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin"
        }
      );
      const payload = (await response.json().catch(() => null)) as SavedBestTakesResponse | null;

      if (!response.ok || !payload?.ok) {
        setErrorMessage(getUserFacingBestTakeError(payload, "ベスト保存を外せませんでした。"));
        return;
      }

      setSavedBestTakes((current) => current.filter((take) => take.id !== currentSavedTake.id));
      setMessage("ベストテイクから外しました。元の録音は残っています。");
    } catch {
      setErrorMessage("ベスト保存を外せませんでした。通信状態を確認してもう一度お試しください。");
    } finally {
      setMutating(false);
    }
  }

  return (
    <div data-testid="saved-best-take-control" className="border-t border-[var(--line-dark)] pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[rgba(255,241,221,0.58)]">ベストテイク</p>
          <p className="mt-2 text-sm leading-6 text-[rgba(255,241,221,0.78)]">
            {currentSavedTake
              ? `この録音は ${currentSavedTake.slot} 番目のベストテイクとして保存済みです。`
              : "あとで聞き返したい録音だけを、ベストテイクとして残せます。"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[rgba(255,241,221,0.58)]">
            {isScoreBest
              ? "この結果は現在のスコア上のベストです。残したいときは自分で保存します。"
              : "スコア上のベストとは別に、自分で残したい録音を選びます。"}
          </p>
        </div>
        {currentSavedTake ? (
          <button
            type="button"
            onClick={handleUnsave}
            disabled={mutating}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--line-dark)] bg-white/10 px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)] transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X aria-hidden className="h-4 w-4" />
            {mutating ? "処理中..." : "保存を外す"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={mutating || loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--record-accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--record-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <BookmarkCheck aria-hidden className="h-4 w-4" /> : <BookmarkPlus aria-hidden className="h-4 w-4" />}
            {mutating ? "保存中..." : "この録音をベスト保存"}
          </button>
        )}
      </div>
      {loading ? <p className="mt-3 text-sm text-[rgba(255,241,221,0.62)]">保存状態を確認しています。</p> : null}
      {message ? <p className="mt-3 text-sm leading-6 text-[rgba(255,241,221,0.72)]">{message}</p> : null}
      {errorMessage ? <p className="mt-3 text-sm leading-6 text-[#ffd3a3]">{errorMessage}</p> : null}
    </div>
  );
}
