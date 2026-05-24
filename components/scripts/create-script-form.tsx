"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ScriptFormInitialValues = {
  title: string;
  content: string;
  targetSeconds: number;
  locale: string;
};

export type ScriptFormDraftCopy = ScriptFormInitialValues & {
  id: number;
  sourceLabel?: string;
};

type CreateScriptFormProps = {
  initialValues?: ScriptFormInitialValues;
  sourceTitle?: string | null;
  draftCopy?: ScriptFormDraftCopy | null;
};

export function CreateScriptForm({ initialValues, sourceTitle = null, draftCopy = null }: CreateScriptFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [targetSeconds, setTargetSeconds] = useState(initialValues?.targetSeconds ?? 60);
  const [locale, setLocale] = useState(initialValues?.locale ?? "en-US");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();
  const trimmedLocale = locale.trim();
  const wordCount = trimmedContent ? trimmedContent.split(/\s+/).filter(Boolean).length : 0;
  const estimatedSeconds = Math.max(1, Math.round(wordCount / 2.2));
  const showLengthWarning = wordCount > 0 && estimatedSeconds > targetSeconds;
  const isMissingRequiredFields = trimmedTitle.length === 0 || trimmedContent.length === 0 || trimmedLocale.length < 2;
  const canResetToInitial =
    Boolean(initialValues) &&
    (title !== (initialValues?.title ?? "") ||
      content !== (initialValues?.content ?? "") ||
      targetSeconds !== (initialValues?.targetSeconds ?? 60) ||
      locale !== (initialValues?.locale ?? "en-US"));

  useEffect(() => {
    if (!draftCopy) {
      return;
    }

    setTitle(draftCopy.title);
    setContent(draftCopy.content);
    setTargetSeconds(draftCopy.targetSeconds);
    setLocale(draftCopy.locale);
    setMessage(`${draftCopy.sourceLabel ?? "下書き"} をフォームへコピーしました。保存前に編集できます。`);
  }, [draftCopy]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/scripts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: trimmedTitle,
          content: trimmedContent,
          targetSeconds,
          locale: trimmedLocale
        })
      });

      const payload = (await response.json()) as {
        ok: boolean;
        message?: string;
        data?: { id: string };
      };

      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "台本の保存に失敗しました。");
        return;
      }

      router.push(`/scripts/${payload.data?.id ?? ""}/listen?created=1`);
      router.refresh();
    } catch {
      setMessage("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {sourceTitle ? (
        <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
          「{sourceTitle}」を複製しています。元の保存済み結果はそのまま残り、新しい script として保存されます。
        </div>
      ) : null}

      <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4 text-sm leading-6 text-ink-700">
        <p className="text-xs font-semibold text-ink-500">最後に整える</p>
        <p className="mt-2 font-semibold text-ink-900">ここで自分の言葉に直して保存します。</p>
        <p className="mt-1 text-xs leading-5 text-ink-500">保存後はそのまま「聞く」へ進みます。</p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink-700">タイトル</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          placeholder="朝の1分練習"
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink-700">英文</span>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          required
          rows={8}
          placeholder="ここに1分で話したい英文を入れます。"
          className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink-700">目標秒数</span>
          <input
            value={targetSeconds}
            onChange={(event) => setTargetSeconds(Number(event.target.value))}
            type="number"
            min={15}
            max={120}
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink-700">英語の種類</span>
          <input
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            placeholder="en-US"
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>
      </div>

      {showLengthWarning ? (
        <p className="text-sm text-amber-700">
          台本が長めです。約 {estimatedSeconds} 秒想定なので、1分目標なら少し短くすると安定します。
        </p>
      ) : null}
      {initialValues && canResetToInitial ? (
        <button
          type="button"
          onClick={() => {
            setTitle(initialValues.title);
            setContent(initialValues.content);
            setTargetSeconds(initialValues.targetSeconds);
            setLocale(initialValues.locale);
            setMessage(null);
          }}
          className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
        >
          複製元の内容に戻す
        </button>
      ) : null}

      <button
        type="submit"
        disabled={loading || isMissingRequiredFields}
        className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "保存中..." : "保存して聞くへ進む"}
      </button>

      <p className="text-xs leading-5 text-ink-500">
        保存後は、そのまま新しい台本の「聞く」に移動します。
      </p>

      {message ? (
        <button
          type="button"
          onClick={() => setMessage(null)}
          className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
        >
          メッセージを閉じる
        </button>
      ) : null}

      {message ? <p className="text-sm text-ink-600">{message}</p> : null}
    </form>
  );
}
