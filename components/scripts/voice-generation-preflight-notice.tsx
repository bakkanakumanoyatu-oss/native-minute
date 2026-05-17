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
  const cacheBehaviorLabel = hasCachedAudio ? "保存済みあり" : "新しく作成";
  const providerLabel = providerSupported ? "準備済み" : "確認が必要";
  const setupSummary = canGenerateAudio
    ? "お手本ボイスを作る前提はそろっています。"
    : hasCachedAudio
      ? "新しいお手本ボイスを作るには前提の確認が必要ですが、保存済み音声がある場合は再生だけ続けられます。"
      : "新しいお手本ボイスを作るには、声の設定を先に整えます。";
  const cacheSummary = hasCachedAudio
    ? "同じ台本、声、雰囲気なら、保存済み音声を再利用することがあります。"
    : "同じ条件の保存済み音声がなければ、新しく作成します。";
  const regenerationSummary =
    "作り直しても、同じ条件なら同じ音声に見える場合があります。";

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-ink-500">作成前チェック</p>
          <h2 className="mt-2 text-lg font-semibold text-ink-900">音声生成前の確認</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">保存済み台本からお手本ボイスを作る前の確認です。</p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-700">
          確認のみ
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <StatusPill label="台本" value="保存済み" />
        <StatusPill label="声の設定" value={voiceSetupLabel} tone={canGenerateAudio ? "ok" : "warn"} />
        <StatusPill label="使う声" value={defaultVoiceStatus} tone={defaultVoiceLabel ? "ok" : "warn"} />
        <StatusPill label="保存済み音声" value={savedAudioLabel} tone={hasCachedAudio ? "ok" : "neutral"} />
        <StatusPill label="作成状態" value={cacheBehaviorLabel} />
        <StatusPill label="接続状態" value={providerLabel} tone={providerSupported ? "ok" : "warn"} />
      </div>

      <details className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-800">詳しい状態を見る</summary>
        <dl className="mt-4 grid gap-2 text-sm md:grid-cols-3">
          <StatusDetail label="準備状態" value={providerReadiness} />
          <StatusDetail label="声" value={activeVoiceLabel ?? "未設定"} />
          <StatusDetail label="利用回数" value="10回まで" />
        </dl>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">確認済みの境界</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-700">
              <li>・音声は保存済み台本の内容をもとに扱います。</li>
              <li>・この表示では保存や音声作成は行いません。</li>
              <li>・同じ条件なら、前に作った音声を使うことがあります。</li>
              <li>・作成はユーザー操作後に行います。</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">注意して見ること</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-700">
              <li>・{setupSummary}</li>
              <li>・{cacheSummary}</li>
              <li>・{regenerationSummary}</li>
              <li>・声の聞こえ方は完全には制御できません。</li>
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <QuotaPreflightNotice context="listen" compact />
        </div>
      </details>

      {!providerSupported && providerMessage ? (
        <p className="mt-4 text-xs leading-5 text-ink-500">設定メモ: {providerMessage}</p>
      ) : null}
      {!hasConsent ? (
        <p className="mt-2 text-xs leading-5 text-ink-500">
          新しいお手本ボイスの生成には、声の設定が必要です。
        </p>
      ) : null}
      {defaultVoiceLabel ? (
        <p className="mt-2 text-xs leading-5 text-ink-500">Default voice: {defaultVoiceLabel}</p>
      ) : null}

      <p className="mt-3 text-xs leading-5 text-ink-500">このカード自体では音声生成を止めません。</p>
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
