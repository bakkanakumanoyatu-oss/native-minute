import Link from "next/link";
import { getGuidanceToneClasses, type GuidanceTone } from "@/lib/guidance-ui";

export type StateActionLink = {
  label: string;
  href: string;
  tone?: "primary" | "secondary";
};

type StateActionEyebrow = "Next action" | "Other actions" | "次にやること" | "その他の操作" | "設定・管理";

function getActionClasses(tone: "primary" | "secondary", eyebrow: StateActionEyebrow) {
  if (tone === "primary") {
    return "inline-flex w-full justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-sm sm:w-auto";
  }

  return eyebrow === "Other actions" || eyebrow === "その他の操作" || eyebrow === "設定・管理"
    ? "inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-ink-50 px-4 py-3 text-sm font-medium text-ink-700 sm:w-auto"
    : "inline-flex w-full justify-center rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-ink-800 sm:w-auto";
}

export function StateStepSection({
  eyebrow = "Current step",
  title,
  summary,
  tone = "steady"
}: {
  eyebrow?: string;
  title: string;
  summary: string;
  tone?: GuidanceTone;
}) {
  return (
    <section className={`rounded-[2rem] border p-5 shadow-sm sm:p-6 ${getGuidanceToneClasses(tone)}`}>
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-ink-900 sm:text-2xl">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-ink-700">{summary}</p>
    </section>
  );
}

export function StateActionSection({
  eyebrow,
  title,
  summary,
  actions
}: {
  eyebrow: StateActionEyebrow;
  title: string;
  summary?: string;
  actions: StateActionLink[];
}) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-ink-900 sm:text-2xl">{title}</h2>
      {summary ? <p className="mt-3 text-sm leading-6 text-ink-600">{summary}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {actions.map((action) => (
          <Link key={`${action.href}:${action.label}`} href={action.href} className={getActionClasses(action.tone ?? "secondary", eyebrow)}>
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
