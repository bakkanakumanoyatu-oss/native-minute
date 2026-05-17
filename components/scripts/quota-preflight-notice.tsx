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
    eyebrow: "利用回数",
    title: "AIスクリプト生成",
    summary:
      "ベータでは AIスクリプト生成は10回まで使えます。",
    futureQuotaItems: [
      "AIに1分スクリプトを書かせる"
    ],
    nonQuotaItems: [
      "下書きをフォームへコピー",
      "コピー後に手で直す",
      "保存する"
    ]
  },
  manual_form: {
    eyebrow: "利用回数",
    title: "手動作成",
    summary:
      "手動で書く、直す、保存する操作は生成回数に含めません。",
    futureQuotaItems: [],
    nonQuotaItems: [
      "直接書く",
      "下書きをフォームへコピーする",
      "保存する"
    ]
  },
  listen: {
    eyebrow: "利用回数",
    title: "お手本ボイス生成",
    summary:
      "ベータでは お手本ボイス生成は10回まで使えます。",
    futureQuotaItems: [
      "お手本ボイスを作る",
      "お手本ボイスを作り直す"
    ],
    nonQuotaItems: [
      "作ったお手本を聞く",
      "聞く速さを変える"
    ]
  }
};

export function QuotaPreflightNotice({ context, compact = false }: QuotaPreflightNoticeProps) {
  const content = NOTICE_CONTENT[context];

  if (compact) {
    if (context === "manual_form") {
      return (
        <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
          <p className="text-xs font-semibold text-ink-500">{content.eyebrow}</p>
          <p className="mt-2 text-sm font-semibold text-ink-900">コピー・手動編集・保存は生成回数に含めません。</p>
          <p className="mt-1 text-xs leading-5 text-ink-600">
            保存後の台本が練習の本線になります。
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
        <p className="text-xs font-semibold text-ink-500">{content.eyebrow}</p>
        <p className="mt-2 text-sm font-semibold text-ink-900">{content.title}</p>
        <p className="mt-2 text-xs leading-5 text-ink-600">{content.summary}</p>
        <p className="mt-2 text-xs leading-5 text-ink-600">
          回数に含む: {content.futureQuotaItems.length > 0 ? content.futureQuotaItems.join(" / ") : "この場面ではありません。"}
        </p>
        <p className="mt-1 text-xs leading-5 text-ink-600">
          含まない: {content.nonQuotaItems.join(" / ")}
        </p>
        <p className="mt-2 text-xs leading-5 text-ink-500">残り回数は、正しく数えられる仕組みがそろうまで表示しません。</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-4">
      <p className="text-xs font-semibold text-ink-500">{content.eyebrow}</p>
      <p className="mt-2 text-sm font-semibold text-ink-900">{content.title}</p>
      <p className="mt-2 text-xs leading-5 text-ink-600">{content.summary}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <QuotaList title="回数に含む操作" items={content.futureQuotaItems} emptyLabel="この場面ではありません。" />
        <QuotaList title="含まない操作" items={content.nonQuotaItems} />
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-500">
        残り回数は、正しく数えられる仕組みがそろうまで表示しません。
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
