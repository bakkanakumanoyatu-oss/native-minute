"use client";

import { useMemo, useState } from "react";
import {
  SCRIPT_STUDIO_AUDIENCE_OPTIONS,
  SCRIPT_STUDIO_DIFFICULTY_OPTIONS,
  SCRIPT_STUDIO_LENGTH_OPTIONS,
  SCRIPT_STUDIO_PRIORITY_OPTIONS,
  SCRIPT_STUDIO_SITUATION_OPTIONS,
  SCRIPT_STUDIO_TONE_OPTIONS,
  SCRIPT_STUDIO_TOPIC_CATEGORY_OPTIONS
} from "@/lib/script-studio";
import type {
  ScriptBrief,
  ScriptQualityReport,
  ScriptStudioAudience,
  ScriptStudioDifficulty,
  ScriptStudioFocusWord,
  ScriptStudioPriority,
  ScriptStudioRevisionHint,
  ScriptStudioSituation,
  ScriptStudioTone,
  ScriptStudioTopicCategory
} from "@/lib/script-studio";

const MOCK_NOTE = "これは編集前提の下書きです。保存前に必ず自分の言葉へ直します。";

const AI_SEED_EXAMPLES = [
  {
    label: "仕事で小さく成功した話",
    text: "昨日の会議で、短い提案をしました。大きな成果ではないけれど、前より落ち着いて話せてうれしかったです。"
  },
  {
    label: "最近少し困ったこと",
    text: "最近、予定が詰まりすぎて少し疲れました。自分の時間を守るために、断る練習をしたいです。"
  },
  {
    label: "自分の好きなもの",
    text: "私は朝のコーヒーが好きです。忙しい日でも、数分だけ気持ちを整えられるからです。"
  },
  {
    label: "これから挑戦したいこと",
    text: "これから英語で自分の考えをもっと自然に話せるようになりたいです。完璧より、続けることを大事にしたいです。"
  },
  {
    label: "感情がある短い出来事",
    text: "友だちから久しぶりに連絡が来て、少し安心しました。小さな会話でも、人とのつながりを感じました。"
  }
] as const;

type GenerationIssue = {
  severity: "blocking" | "warning" | "info";
  code: string;
  messageJa: string;
  candidateIndex?: number;
};

type GeneratedDraft = {
  candidateIndex: number;
  title: string;
  englishScript: string;
  japaneseSummary: string;
  qualityReport: ScriptQualityReport;
  freezePreflight: {
    canFreeze: boolean;
    blockingReasons: string[];
    warnings: string[];
    nextAction: string;
  };
  focusWords: ScriptStudioFocusWord[];
  generationNotes: string[];
  issues: GenerationIssue[];
};

type ScriptStudioGenerateResponse = {
  provider: "mock" | "openai";
  acceptedDrafts: GeneratedDraft[];
  rejectedCandidates: Array<{
    candidateIndex: number;
    issues: GenerationIssue[];
  }>;
  issues: GenerationIssue[];
  promptPackSummary: {
    requestedVariants: number;
    maxVariants: number;
    guardrails: Array<{
      id: string;
      labelJa: string;
    }>;
  };
  nextAction: string;
};

type JsonApiResponse<TData> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      message: string;
    };

export type ScriptStudioDraftCopyInput = {
  title: string;
  content: string;
  targetSeconds: number;
};

type ScriptStudioMockPanelProps = {
  onCopyDraft?: (draft: ScriptStudioDraftCopyInput) => void;
};

export function ScriptStudioMockPanel({ onCopyDraft }: ScriptStudioMockPanelProps) {
  const [userSeedText, setUserSeedText] = useState("");
  const [topicCategory, setTopicCategory] = useState<ScriptStudioTopicCategory>("daily_life");
  const [situation, setSituation] = useState<ScriptStudioSituation>("small_talk");
  const [audience, setAudience] = useState<ScriptStudioAudience>("general_listener");
  const [tone, setTone] = useState<ScriptStudioTone>("friendly");
  const [targetLengthSeconds, setTargetLengthSeconds] = useState(60);
  const [difficulty, setDifficulty] = useState<ScriptStudioDifficulty>("standard");
  const [priority, setPriority] = useState<ScriptStudioPriority>("speakability");
  const [mustInclude, setMustInclude] = useState("");
  const [avoid, setAvoid] = useState("");
  const [generationResult, setGenerationResult] = useState<ScriptStudioGenerateResponse | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastRequestKey, setLastRequestKey] = useState<string | null>(null);
  const [selectedDraftIndex, setSelectedDraftIndex] = useState(0);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const briefInput = useMemo<ScriptBrief>(
    () => ({
      userSeedText,
      topicCategory,
      situation,
      audience,
      tone,
      targetLengthSeconds,
      difficulty,
      priority,
      mustInclude: parseListInput(mustInclude),
      avoid: parseListInput(avoid),
      languagePreference: "japanese_summary_supported"
    }),
    [audience, avoid, difficulty, mustInclude, priority, situation, targetLengthSeconds, tone, topicCategory, userSeedText]
  );
  const generationRequest = useMemo(
    () => ({
      ...briefInput,
      requestedVariants: 2
    }),
    [briefInput]
  );
  const requestKey = useMemo(() => JSON.stringify(generationRequest), [generationRequest]);
  const acceptedDrafts = generationResult?.acceptedDrafts ?? [];
  const selectedDraft = acceptedDrafts[selectedDraftIndex] ?? acceptedDrafts[0] ?? null;
  const qualityReport = selectedDraft?.qualityReport ?? null;
  const pipelineIssues = generationResult ? [...generationResult.issues, ...(selectedDraft?.issues ?? [])] : [];
  const hasInputChangedAfterGenerate = Boolean(generationResult && lastRequestKey && lastRequestKey !== requestKey);

  async function handleGenerateDraft() {
    setIsGenerating(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/script-studio/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(generationRequest)
      });
      const payload = (await response.json().catch(() => null)) as JsonApiResponse<ScriptStudioGenerateResponse> | null;

      if (!payload) {
        throw new Error("Script Studio draft を作れませんでした。");
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Script Studio draft を作れませんでした。" : payload.message);
      }

      setGenerationResult(payload.data);
      setLastRequestKey(requestKey);
      setSelectedDraftIndex(0);
      setCopyMessage(null);
    } catch (error) {
      setGenerationError(error instanceof Error && error.message ? error.message : "Script Studio draft を作れませんでした。");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleCopySelectedDraft() {
    if (!selectedDraft || !onCopyDraft) {
      return;
    }

    onCopyDraft({
      title: selectedDraft.title,
      content: selectedDraft.englishScript,
      targetSeconds: selectedDraft.qualityReport.estimatedSpeakingTime.targetSeconds
    });
    setCopyMessage("フォームへコピーしました。保存前に下のフォームで編集できます。");
  }

  return (
    <section className="rounded-2xl border border-dashed border-[var(--accent)] bg-ink-50 px-4 py-5 text-sm leading-6 text-ink-700">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[var(--accent-strong)]">下書き</p>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">AIに1分スクリプトを書かせる</h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            言いたいことから、1分英語の候補と日本語の意味を出します。完成品ではないので、保存前に必ずフォームで編集します。
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          編集前提
        </span>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink-700">言いたいこと</span>
          <textarea
            value={userSeedText}
            onChange={(event) => setUserSeedText(event.target.value)}
            rows={4}
            placeholder="日本語でも短文でもOK。例: 最近、英語学習を続ける理由について話したい。"
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
          />
          <span className="block text-xs leading-5 text-ink-500">
            短くても大丈夫です。場面や気分を自分の言葉で書きます。
          </span>
          <details className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-ink-700">seed 例を見る</summary>
            <div className="mt-3 grid gap-2">
              {AI_SEED_EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => setUserSeedText(example.text)}
                  className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-3 text-left text-xs leading-5 text-ink-700 transition hover:bg-white"
                >
                  <span className="block font-semibold text-ink-900">{example.label}</span>
                  <span className="mt-1 block">{example.text}</span>
                </button>
              ))}
            </div>
          </details>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="テーマ"
            value={topicCategory}
            options={SCRIPT_STUDIO_TOPIC_CATEGORY_OPTIONS}
            onChange={(value) => setTopicCategory(value)}
          />
          <SelectField label="場面" value={situation} options={SCRIPT_STUDIO_SITUATION_OPTIONS} onChange={(value) => setSituation(value)} />
          <SelectField label="相手" value={audience} options={SCRIPT_STUDIO_AUDIENCE_OPTIONS} onChange={(value) => setAudience(value)} />
          <SelectField label="話し方" value={tone} options={SCRIPT_STUDIO_TONE_OPTIONS} onChange={(value) => setTone(value)} />
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink-700">長さ</span>
            <select
              value={targetLengthSeconds}
              onChange={(event) => setTargetLengthSeconds(Number(event.target.value))}
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
            >
              {SCRIPT_STUDIO_LENGTH_OPTIONS.map((option) => (
                <option key={option.id} value={option.targetLengthSeconds}>
                  {option.labelJa} / {option.targetLengthSeconds}秒
                </option>
              ))}
            </select>
            <span className="block text-xs leading-5 text-ink-500">
              {SCRIPT_STUDIO_LENGTH_OPTIONS.find((option) => option.targetLengthSeconds === targetLengthSeconds)?.descriptionJa}
            </span>
          </label>
          <SelectField label="難しさ" value={difficulty} options={SCRIPT_STUDIO_DIFFICULTY_OPTIONS} onChange={(value) => setDifficulty(value)} />
          <SelectField label="優先すること" value={priority} options={SCRIPT_STUDIO_PRIORITY_OPTIONS} onChange={(value) => setPriority(value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink-700">入れたい言葉</span>
            <input
              value={mustInclude}
              onChange={(event) => setMustInclude(event.target.value)}
              placeholder="例: learning, confidence"
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
            />
            <span className="block text-xs leading-5 text-ink-500">カンマ区切りで最大3個まで。</span>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink-700">避けたいこと</span>
            <input
              value={avoid}
              onChange={(event) => setAvoid(event.target.value)}
              placeholder="例: too formal, long sentence"
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
            />
            <span className="block text-xs leading-5 text-ink-500">長すぎる文、硬すぎる言い方など。</span>
          </label>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-ink-500">AI生成</p>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                結果は保存されません。良さそうな候補だけフォームへコピーします。
              </p>
              <p className="mt-2 inline-flex rounded-full border border-[var(--line)] bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-600">
                ベータでは AIスクリプト生成は10回まで
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={isGenerating}
              className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "作成中..." : generationResult ? "AIに1分スクリプトを書かせる" : "AIに1分スクリプトを書かせる"}
            </button>
          </div>
          {generationError ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              <p className="font-semibold">draft を作れませんでした</p>
              <p className="mt-1">{generationError}</p>
              <p className="mt-1 text-xs">ログイン状態やサーバー側の設定を確認してから再試行します。</p>
            </div>
          ) : null}
          {hasInputChangedAfterGenerate ? (
            <p className="mt-3 text-xs leading-5 text-amber-700">入力が変わっています。表示中の draft は前回の request 結果なので、必要なら作り直してください。</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <details className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-700">入力内容のまとめを見る</summary>
          <div className="mt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Metric label="topic" value={briefInput.topicCategory ?? "未指定"} />
            <Metric label="situation" value={briefInput.situation ?? "未指定"} />
            <Metric label="audience" value={briefInput.audience ?? "未指定"} />
            <Metric label="priority" value={briefInput.priority ?? "未指定"} />
          </div>
          <p className="mt-3 text-xs leading-5 text-ink-500">
            seed: {briefInput.userSeedText ? `入力済み（${briefInput.userSeedText.trim().length}文字）` : "未入力。placeholder seed として扱います。"}
          </p>
          </div>
        </details>

        <InfoBlock title="下書きの見方">
          <p className="text-sm leading-6 text-ink-600">
            英文と日本語訳を見比べて、良さそうならフォームへコピーします。日本語訳は英文と突き合わせやすさを優先します。
          </p>
          <details className="mt-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-xs leading-5 text-ink-600">
            <summary className="cursor-pointer font-semibold text-ink-800">詳しい見方</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>45〜75秒で、1テーマに絞れている。</li>
              <li>自分が本当に言いそうな英語になっている。</li>
              <li>1文が長すぎず、意味の塊でまねしやすい。</li>
              <li>long chunk warning はエラーではなく、コピー後に comma や period で区切る目安。</li>
              <li>固有名詞や難しい語が多いときは、フォームへコピー後に削る。</li>
              <li>固有名詞や難しい語が多いときは、フォームへコピー後に削る。</li>
            </ul>
          </details>
          {generationResult ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                <p className="text-xs font-semibold text-ink-500">作成状態</p>
                <p className="mt-2 text-sm font-semibold text-ink-900">作成済み</p>
                <p className="mt-1 text-xs leading-5 text-ink-500">
                  {generationResult.provider === "mock"
                    ? "確認用の下書きです。"
                    : "サーバー側で作成しました。"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
                <p className="text-xs font-semibold text-ink-500">候補数</p>
                <p className="mt-2 text-sm font-semibold text-ink-900">
                  {generationResult.promptPackSummary.requestedVariants} / max {generationResult.promptPackSummary.maxVariants}
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-500">候補数は server 側の上限内に収めます。</p>
              </div>
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <ListBlock title="守る条件" emptyLabel="AI生成後に表示します。">
              {generationResult?.promptPackSummary.guardrails.slice(0, 4).map((guardrail) => (
                <li key={guardrail.id}>・{guardrail.labelJa}</li>
              ))}
            </ListBlock>
            <ListBlock title="気になる点" emptyLabel="AI生成後に表示します。">
              {pipelineIssues.slice(0, 5).map((issue) => (
                <li key={`${issue.code}-${issue.messageJa}-${issue.candidateIndex ?? "global"}`} className="text-xs leading-5">
                  ・{issue.severity}: {issue.messageJa}
                </li>
              ))}
            </ListBlock>
          </div>
        </InfoBlock>

        {generationResult && !selectedDraft ? (
          <InfoBlock title="Draft result">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              accepted draft がありません。raw candidate は表示せず、issues だけを確認します。
            </div>
            <ListBlock title="rejected candidates" emptyLabel="rejected candidate はありません。">
              {generationResult.rejectedCandidates.map((candidate) => (
                <li key={candidate.candidateIndex} className="rounded-2xl border border-[var(--line)] bg-white px-3 py-3">
                  <p className="text-xs font-semibold text-ink-500">candidate #{candidate.candidateIndex + 1}</p>
                  {candidate.issues.map((issue) => (
                    <p key={`${issue.code}-${issue.messageJa}`} className="mt-1 text-xs leading-5 text-ink-700">
                      ・{issue.severity}: {issue.messageJa}
                    </p>
                  ))}
                </li>
              ))}
            </ListBlock>
          </InfoBlock>
        ) : null}

        {selectedDraft && qualityReport ? (
          <>
            <InfoBlock title={selectedDraft.title}>
              {acceptedDrafts.length > 1 ? (
                <label className="mb-4 block space-y-2">
                  <span className="text-sm font-medium text-ink-700">draft を選ぶ</span>
                  <select
                    value={selectedDraftIndex}
                    onChange={(event) => {
                      setSelectedDraftIndex(Number(event.target.value));
                      setCopyMessage(null);
                    }}
                    className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
                  >
                    {acceptedDrafts.map((draft, index) => (
                      <option key={`${draft.candidateIndex}-${draft.title}`} value={index}>
                        #{draft.candidateIndex + 1} {draft.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">{MOCK_NOTE}</div>
              <p className="mt-4 whitespace-pre-wrap rounded-2xl border border-[var(--line)] bg-white px-4 py-4 text-sm leading-7 text-ink-800">
                {selectedDraft.englishScript}
              </p>
              <div className="mt-3 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4">
                <p className="text-xs font-semibold text-ink-500">日本語訳</p>
                <p className="mt-2 text-sm leading-6 text-ink-700">{selectedDraft.japaneseSummary}</p>
              </div>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-ink-500">
                {selectedDraft.generationNotes.map((note) => (
                  <li key={note}>・{note}</li>
                ))}
              </ul>
              {onCopyDraft ? (
                <div className="mt-4 rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold text-ink-500">フォームへコピー</p>
                      <p className="mt-2 text-sm leading-6 text-ink-600">
                        タイトル、英文、目標秒数だけを下のフォームへコピーします。日本語訳は確認用です。
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-500">
                        コピー後に編集したフォーム内容が、保存される最終版です。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopySelectedDraft}
                      className="inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 transition hover:bg-ink-50"
                    >
                      この下書きを使う
                    </button>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-ink-500">コピー後にフォーム内で編集してから保存します。</p>
                  {copyMessage ? <p className="mt-2 text-sm leading-6 text-ink-700">{copyMessage}</p> : null}
                </div>
              ) : null}
            </InfoBlock>

            <InfoBlock title="Quality report">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="words" value={`${qualityReport.wordCount}`} />
                <Metric
                  label="1分目安"
                  value={`${qualityReport.estimatedSpeakingTime.practiceSeconds}秒 / 通常 ${qualityReport.estimatedSpeakingTime.naturalSeconds}秒`}
                />
                <Metric label="chunks" value={`${qualityReport.chunkCount}`} />
                <Metric label="readiness" value={qualityReport.readinessStatus} />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Metric label="長い文" value={`${qualityReport.longSentenceCount}`} compact />
                <Metric label="長い塊" value={`${qualityReport.longChunkCount}`} compact />
                <Metric label="息継ぎ" value={`${qualityReport.breathPointCount}`} compact />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ListBlock title="chunks" emptyLabel="chunk はまだありません。">
                  {qualityReport.chunks.slice(0, 5).map((chunk) => (
                    <li key={chunk.index} className="rounded-2xl border border-[var(--line)] bg-white px-3 py-3">
                      <p className="text-xs font-semibold text-ink-500">#{chunk.index} / {chunk.wordCount} words / {chunk.cueJa}</p>
                      <p className="mt-1 text-sm leading-6 text-ink-800">{chunk.text}</p>
                    </li>
                  ))}
                </ListBlock>
                <ListBlock title="revision hints" emptyLabel="大きな hint はありません。">
                  {qualityReport.revisionHints.map((hint: ScriptStudioRevisionHint) => (
                    <li key={`${hint.kind}-${hint.labelJa}-${hint.summaryJa}`} className="rounded-2xl border border-[var(--line)] bg-white px-3 py-3">
                      <p className="text-xs font-semibold text-ink-500">{hint.labelJa} / {hint.blockingLevel}</p>
                      <p className="mt-1 text-sm leading-6 text-ink-800">{hint.summaryJa}</p>
                      {hint.excerptJa ? <p className="mt-1 text-xs leading-5 text-ink-500">{hint.excerptJa}</p> : null}
                    </li>
                  ))}
                </ListBlock>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ListBlock title="focus words" emptyLabel="must include を入れると候補が出ます。">
                  {selectedDraft.focusWords.map((word) => (
                    <li key={word.text} className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-ink-800">
                      {word.text}
                    </li>
                  ))}
                </ListBlock>
                <ListBlock title="placeholder checks" emptyLabel="">
                  {[...qualityReport.ttsFriendliness.notesJa, ...qualityReport.userIntentPreservation.notesJa].map((note) => (
                    <li key={note} className="text-xs leading-5 text-ink-600">
                      ・{note}
                    </li>
                  ))}
                </ListBlock>
              </div>
            </InfoBlock>

            <InfoBlock title="保存前チェック">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {selectedDraft.freezePreflight.canFreeze ? "保存前チェックでは概ね良さそうです" : "保存前にまだ確認が必要です"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-ink-600">次にやること: {selectedDraft.freezePreflight.nextAction}</p>
                  {generationResult ? <p className="mt-1 text-xs leading-5 text-ink-500">画面の案内: {generationResult.nextAction}</p> : null}
                </div>
                <button
                  type="button"
                  disabled
                  className="inline-flex cursor-not-allowed items-center justify-center rounded-2xl bg-ink-300 px-4 py-3 text-sm font-semibold text-white opacity-70"
                >
                  この台本で練習開始（未接続）
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ListBlock title="確認が必要な点" emptyLabel="大きな問題はありません。">
                  {selectedDraft.freezePreflight.blockingReasons.map((reason) => (
                    <li key={reason}>・{reason}</li>
                  ))}
                </ListBlock>
                <ListBlock title="気になる点" emptyLabel="気になる点はありません。">
                  {selectedDraft.freezePreflight.warnings.map((warning) => (
                    <li key={warning}>・{warning}</li>
                  ))}
                </ListBlock>
              </div>
              <p className="mt-3 text-xs leading-5 text-ink-500">
                これは下書きの保存前チェックです。コピー後にフォームで編集した場合は、下のフォーム側の保存前チェックが最終候補の目安になります。
                実際の保存や音声生成は、下のフォームで保存したあとに進みます。
                保存前に、英文の長さや話しやすさをもう一度確認します。
              </p>
            </InfoBlock>
          </>
        ) : null}
      </div>
    </section>
  );
}

function SelectField<TValue extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: TValue;
  options: readonly { value: TValue; labelJa: string; descriptionJa: string }[];
  onChange: (value: TValue) => void;
}) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
        className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-[var(--accent)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.labelJa}
          </option>
        ))}
      </select>
      <span className="block text-xs leading-5 text-ink-500">{selectedOption?.descriptionJa}</span>
    </label>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-[var(--line)] bg-ink-50 px-3 ${compact ? "py-2" : "py-3"}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-500">{label}</p>
      <p className={`${compact ? "mt-1 text-sm" : "mt-2 text-base"} font-semibold text-ink-900`}>{value}</p>
    </div>
  );
}

function ListBlock({ title, emptyLabel, children }: { title: string; emptyLabel: string; children: React.ReactNode }) {
  const childCount = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{title}</p>
      {childCount > 0 ? <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-700">{children}</ul> : <p className="mt-2 text-sm text-ink-500">{emptyLabel}</p>}
    </div>
  );
}

function parseListInput(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
