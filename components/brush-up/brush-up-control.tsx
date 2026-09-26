"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedAudioPlayer } from "@/components/audio/protected-audio-player";
import type { BrushUpView } from "@/services/brush-up/brush-up.service";

type Props = { scriptId: string; takeId: string; revisionId: string; currentRevision: boolean };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: T; message?: string } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || "操作を確認できませんでした。");
  return payload.data as T;
}

export function BrushUpControl({ scriptId, takeId, revisionId, currentRevision }: Props) {
  const [view, setView] = useState<BrushUpView | null>(null);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const query = new URLSearchParams({ scriptId, takeId });
    setView(await api<BrushUpView | null>(`/api/script-brush-up/candidates?${query}`));
  }, [scriptId, takeId]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ scriptId, takeId });
    api<BrushUpView | null>(`/api/script-brush-up/candidates?${query}`)
      .then(data => { if (active) setView(data); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "候補を確認できませんでした。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scriptId, takeId]);

  async function createCandidate() {
    if (!consented || busy) return;
    setBusy(true); setError(null);
    try {
      const consent = await api<{ consentId: string }>("/api/script-brush-up/consent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId, takeId, revisionId })
      });
      await api("/api/script-brush-up/candidates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId, takeId, revisionId, consentId: consent.consentId, operationId: crypto.randomUUID() })
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "候補を作れませんでした。");
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function decide(decision: "adopt" | "reject" | "rollback" | "retry_cleanup") {
    if (!view || busy) return;
    setBusy(true); setError(null);
    try {
      await api(`/api/script-brush-up/candidates/${view.candidateId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision })
      });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "候補を変更できませんでした。"); }
    finally { setBusy(false); }
  }

  const canCreate = currentRevision && (!view || (["rejected", "rolled_back", "failed"].includes(view.status) && !view.cleanupPending));
  return (
    <section className="rounded-2xl border border-[var(--line-inset)] bg-[var(--surface-secondary)] p-5 text-ink-900" aria-label="台本専用のお手本候補">
      <h3 className="text-base font-semibold">このTakeから台本専用のお手本候補を作る</h3>
      <p className="mt-2 text-sm leading-6">選んだTakeを元に、同じ版の台本だけで使う別のお手本候補を作ります。聞き比べてから採用を選べます。</p>
      {loading ? <p className="mt-3 text-sm">候補を確認しています…</p> : null}
      {!currentRevision ? <p className="mt-3 text-sm">これは以前の台本の版です。新しい候補は現在の版のTakeから作れます。</p> : null}
      {canCreate && !loading ? (
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 text-sm leading-6">
            <input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} className="mt-1" />
            <span>この保存済みTakeの録音を外部音声サービスへ送り、一時的なvoiceと同じ台本のお手本候補を作ることに同意します。</span>
          </label>
          <button type="button" onClick={createCandidate} disabled={!consented || busy}
            className="rounded-xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)] disabled:opacity-50">
            {busy ? "候補を準備しています…" : "同意して候補を作る"}
          </button>
        </div>
      ) : null}
      {view?.status === "preparing" || view?.status === "audio_staged" ? <p className="mt-3 text-sm">候補を準備しています。しばらくしてから表示を更新してください。</p> : null}
      {view?.cleanupPending ? <p className="mt-3 text-sm">一時音声または候補音声の片付けを確認中です。新しい候補はまだ作れません。</p> : null}
      {view?.manualCleanupRequired ? <p className="mt-3 text-sm" role="alert">一時voiceの作成結果を確認できません。運営による確認が必要です。</p> : null}
      {view?.cleanupPending && !view.manualCleanupRequired ? <button type="button" disabled={busy} onClick={() => decide("retry_cleanup")}
        className="mt-3 rounded-xl border px-4 py-3 text-sm font-semibold">片付けを再確認</button> : null}
      {(view?.status === "ready" || view?.status === "adopted") && view.baselineAudioUrl && view.candidateAudioUrl ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><p className="mb-2 text-sm font-semibold">元のお手本</p><ProtectedAudioPlayer sourceUrl={view.baselineAudioUrl} /></div>
          <div><p className="mb-2 text-sm font-semibold">候補のお手本</p><ProtectedAudioPlayer sourceUrl={view.candidateAudioUrl} /></div>
        </div>
      ) : null}
      {view?.status === "ready" ? <div className="mt-4 flex gap-3">
        {currentRevision ? <button type="button" disabled={busy} onClick={() => decide("adopt")} className="rounded-xl bg-[var(--cta-primary-bg)] px-4 py-3 text-sm font-semibold text-[var(--cta-primary-text)]">この台本の版に採用</button> : null}
        <button type="button" disabled={busy} onClick={() => decide("reject")} className="rounded-xl border px-4 py-3 text-sm font-semibold">却下</button>
      </div> : null}
      {view?.status === "adopted" ? <button type="button" disabled={busy} onClick={() => decide("rollback")}
        className="mt-4 rounded-xl border px-4 py-3 text-sm font-semibold">元のお手本に戻す</button> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
