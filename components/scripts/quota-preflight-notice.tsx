type QuotaPreflightNoticeContext = "script_studio" | "manual_form" | "listen";

type QuotaPreflightNoticeProps = {
  context: QuotaPreflightNoticeContext;
  compact?: boolean;
};

type NoticeContent = {
  eyebrow: string;
  title: string;
  summary: string;
  futureQuotaItems: string[];
  nonQuotaItems: string[];
};

const NOTICE_CONTENT: Record<QuotaPreflightNoticeContext, NoticeContent> = {
  script_studio: {
    eyebrow: "Text quota boundary",
    title: "draft 作成前の quota 目安",
    summary:
      "この案内は quota enforcement ではありません。draft 作成や作り直しは、将来 text generation quota 対象になり得ます。",
    futureQuotaItems: [
      "draft 作成 / 作り直し",
      "requested variants を伴う生成",
      "もっと短く / 自然に、などの bounded adjustment"
    ],
    nonQuotaItems: [
      "draft をフォームへコピー",
      "コピー後の手動編集",
      "既存 flow での script 保存",
      "readiness / freeze preflight preview"
    ]
  },
  manual_form: {
    eyebrow: "Manual workflow",
    title: "保存前フォームの quota 境界",
    summary:
      "ここは手動編集の場所です。コピー、編集、保存は text generation quota の消費として扱いません。",
    futureQuotaItems: [],
    nonQuotaItems: [
      "コピー済み draft の編集",
      "手動で書いた script の保存",
      "manual revision hints",
      "保存前の freeze preflight preview"
    ]
  },
  listen: {
    eyebrow: "Voice quota boundary",
    title: "見本音声前の quota 目安",
    summary:
      "この案内は quota enforcement でも gating でもありません。新しく音声を作る操作は、将来 voice generation quota 対象になり得ます。",
    futureQuotaItems: [
      "cache miss の見本音声生成",
      "provider synthesize request",
      "明示的な regeneration / update",
      "voice clone creation"
    ],
    nonQuotaItems: [
      "cache hit / cache reuse",
      "保存済み音声の protected replay",
      "この preflight notice",
      "playbackRate の変更"
    ]
  }
};

export function QuotaPreflightNotice({ context, compact = false }: QuotaPreflightNoticeProps) {
  const content = NOTICE_CONTENT[context];

  if (compact) {
    if (context === "manual_form") {
      return (
        <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{content.eyebrow}</p>
          <p className="mt-2 text-sm font-semibold text-ink-900">コピー・手動編集・保存は quota 消費ではありません。</p>
          <p className="mt-1 text-xs leading-5 text-ink-600">
            この画面では残数表示、課金、制限はありません。保存後の script が練習の本線になります。
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{content.eyebrow}</p>
        <p className="mt-2 text-sm font-semibold text-ink-900">{content.title}</p>
        <p className="mt-2 text-xs leading-5 text-ink-600">{content.summary}</p>
        <p className="mt-2 text-xs leading-5 text-ink-600">
          将来対象: {content.futureQuotaItems.length > 0 ? content.futureQuotaItems.join(" / ") : "この場面ではありません。"}
        </p>
        <p className="mt-1 text-xs leading-5 text-ink-600">
          消費なし: {content.nonQuotaItems.join(" / ")}
        </p>
        <p className="mt-2 text-xs leading-5 text-ink-500">残数表示、課金、quota event 書き込み、制限はまだありません。</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">{content.eyebrow}</p>
      <p className="mt-2 text-sm font-semibold text-ink-900">{content.title}</p>
      <p className="mt-2 text-xs leading-5 text-ink-600">{content.summary}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <QuotaList title="将来 quota 対象になり得る操作" items={content.futureQuotaItems} emptyLabel="この場面ではありません。" />
        <QuotaList title="quota 消費ではない操作" items={content.nonQuotaItems} />
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-500">
        現時点では残数表示、課金、quota event 書き込み、制限はまだ実装していません。
      </p>
    </div>
  );
}

function QuotaList({ title, items, emptyLabel = "まだありません。" }: { title: string; items: string[]; emptyLabel?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-50 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">{title}</p>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-ink-700">
        {items.length > 0 ? (
          items.map((item) => (
            <li key={item}>・{item}</li>
          ))
        ) : (
          <li>・{emptyLabel}</li>
        )}
      </ul>
    </div>
  );
}
