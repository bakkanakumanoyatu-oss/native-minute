import { QuotaPreflightNotice } from "@/components/scripts/quota-preflight-notice";

type VoiceGenerationPreflightNoticeProps = {
  provider: string;
  providerReadiness: string;
  providerSupported: boolean;
  providerMessage?: string | null;
  hasConsent: boolean;
  defaultVoiceLabel?: string | null;
  cachedVoiceLabel?: string | null;
  hasCachedAudio: boolean;
  canGenerateAudio: boolean;
};

export function VoiceGenerationPreflightNotice({
  provider,
  providerReadiness,
  providerSupported,
  providerMessage = null,
  hasConsent,
  defaultVoiceLabel = null,
  cachedVoiceLabel = null,
  hasCachedAudio,
  canGenerateAudio
}: VoiceGenerationPreflightNoticeProps) {
  const activeVoiceLabel = defaultVoiceLabel ?? cachedVoiceLabel ?? null;
  const voiceSetupLabel = canGenerateAudio ? "設定済み" : hasCachedAudio ? "不足あり / 再生可" : "未設定";
  const defaultVoiceStatus = defaultVoiceLabel ? "あり" : "なし";
  const savedAudioLabel = hasCachedAudio ? "保存済みあり" : "保存済みなし";
  const cacheBehaviorLabel = hasCachedAudio ? "cache reuse あり" : "cache miss なら生成";
  const providerLabel = providerSupported ? provider : `${provider} 要確認`;
  const setupSummary = canGenerateAudio
    ? "voice setup / default voice / provider availability は、この画面で見本音声を作る前提としてそろっています。"
    : hasCachedAudio
      ? "新しい見本音声を作るには前提の確認が必要ですが、保存済み音声がある場合は再生だけ続けられます。"
      : "新しい見本音声を作るには、voice setup / default voice / provider availability を先に整えます。";
  const cacheSummary = hasCachedAudio
    ? "同じ saved script / voice / style なら、保存済み音声を再利用することがあります。"
    : "同じ条件の保存済み音声がなければ、既存の listen flow で生成を試します。";
  const regenerationSummary =
    "更新は再生成を試す導線ですが、force regeneration ではありません。同じ条件で cache が一致すれば、同じ音声に見える場合があります。";

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">Voice generation preflight</p>
          <h2 className="mt-2 text-lg font-semibold text-ink-900">音声生成前の確認</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">保存済み script から見本音声を作る前の read-only 確認です。</p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-700">
          preflight only
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <StatusPill label="source" value="saved script" />
        <StatusPill label="voice setup" value={voiceSetupLabel} tone={canGenerateAudio ? "ok" : "warn"} />
        <StatusPill label="default voice" value={defaultVoiceStatus} tone={defaultVoiceLabel ? "ok" : "warn"} />
        <StatusPill label="saved audio" value={savedAudioLabel} tone={hasCachedAudio ? "ok" : "neutral"} />
        <StatusPill label="cache" value={cacheBehaviorLabel} />
        <StatusPill label="provider" value={providerLabel} tone={providerSupported ? "ok" : "warn"} />
      </div>

      <details className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">cache / quota / provider の補足を見る</summary>
        <dl className="mt-4 grid gap-2 text-sm md:grid-cols-3">
          <StatusDetail label="Provider readiness" value={providerReadiness} />
          <StatusDetail label="Voice" value={activeVoiceLabel ?? "未設定"} />
          <StatusDetail label="Quota" value="境界だけ表示" />
        </dl>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">確認済みの境界</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-700">
              <li>・音声は保存済み script の内容をもとに扱います。</li>
              <li>・この表示は保存や freeze ではありません。</li>
              <li>・cache が一致すれば、既存音声を再利用することがあります。</li>
              <li>・生成はユーザー操作後に、既存の listen flow で行います。</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">注意して見ること</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-700">
              <li>・{setupSummary}</li>
              <li>・{cacheSummary}</li>
              <li>・{regenerationSummary}</li>
              <li>・provider quality / voice quality は完全には制御できません。</li>
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <QuotaPreflightNotice context="listen" compact />
        </div>
      </details>

      {!providerSupported && providerMessage ? (
        <p className="mt-4 text-xs leading-5 text-ink-500">Provider note: {providerMessage}</p>
      ) : null}
      {!hasConsent ? (
        <p className="mt-2 text-xs leading-5 text-ink-500">
          Consent note: 新しい見本音声の生成には、現在の provider に合う consent / voice setup が必要です。
        </p>
      ) : null}
      {defaultVoiceLabel ? (
        <p className="mt-2 text-xs leading-5 text-ink-500">Default voice: {defaultVoiceLabel}</p>
      ) : null}

      <p className="mt-3 text-xs leading-5 text-ink-500">この card 自体では音声生成を止めません。</p>
    </section>
  );
}

function StatusPill({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  const toneClasses =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-[var(--line)] bg-ink-50 text-ink-900";

  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneClasses}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function StatusDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
