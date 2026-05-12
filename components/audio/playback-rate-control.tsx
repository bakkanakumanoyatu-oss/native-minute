"use client";

export const PLAYBACK_RATE_OPTIONS = [
  { value: 0.75, label: "ゆっくり確認" },
  { value: 0.85, label: "まねる速度" },
  { value: 1, label: "通常" },
  { value: 1.15, label: "少し速め" }
] as const;

export type PlaybackRate = (typeof PLAYBACK_RATE_OPTIONS)[number]["value"];

type PlaybackRateControlProps = {
  value: PlaybackRate;
  onChange: (value: PlaybackRate) => void;
  label: string;
  description: string;
  disabled?: boolean;
  testId?: string;
};

export function PlaybackRateControl({
  value,
  onChange,
  label,
  description,
  disabled = false,
  testId
}: PlaybackRateControlProps) {
  return (
    <div data-testid={testId} className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
      <p className="text-xs uppercase tracking-[0.18em] text-ink-500">再生速度</p>
      <p className="mt-2 font-semibold text-ink-900">{label}</p>
      <p className="mt-1 text-xs leading-5 text-ink-600">{description}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {PLAYBACK_RATE_OPTIONS.map((option) => {
          const selected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              disabled={disabled}
              aria-pressed={selected}
              className={`rounded-2xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--line)] bg-white text-ink-800 hover:bg-ink-50"
              }`}
            >
              <span className={`block text-sm font-semibold ${selected ? "text-white" : "text-ink-900"}`}>{option.label}</span>
              <span className={`mt-1 block text-xs leading-5 ${selected ? "text-white/85" : "text-ink-500"}`}>{option.value.toFixed(2)}x</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
