import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Terms Draft | Native Minute",
  description: "Native Minute Web beta terms draft"
};

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Terms draft"
      title="Native Minute Terms"
      summary="このページは Native Minute v1 Web beta / small cohort 用の利用条件ドラフトです。正式公開や Store submission の前に、最終レビューと正式文面化が必要です。"
    >
      <LegalSection
        title="サービスの位置づけ"
        items={[
          "Native Minute は英語練習を支援するアプリです。発音能力、語学力、試験結果を完全または公式に判定するものではありません。",
          "v1 beta は無料公開を前提にしています。ただし provider 側の障害、rate limit、quota、メンテナンスにより一時的に使えない場合があります。",
          "score や coaching は練習の目安です。録音環境、マイク、発話内容、provider の状態によって結果が変わることがあります。"
        ]}
      />

      <LegalSection
        title="ユーザーが守ること"
        items={[
          "自分が使う権利のある script、録音、voice sample だけを使ってください。",
          "他人の声を clone する場合は、本人の明確な許可が必要です。v1 では自分の声を使う前提を推奨します。",
          "映画のセリフ、近年の有名スピーチ、著作権上危険な本文を大量に貼り付けたり、配布目的で使ったりしないでください。",
          "security、quota、provider guard、protected replay、account deletion flow を回避する操作をしないでください。",
          "違法、差別的、嫌がらせ、なりすまし、第三者の権利侵害につながる使い方をしないでください。"
        ]}
      />

      <LegalSection
        title="provider と結果の変動"
        summary="v1 の provider 役割は、ElevenLabs が voice clone / model audio generation、OpenAI が transcription / script generation / coaching、Azure が pronunciation evaluator です。"
        items={[
          "provider failure、rate limit、billing/quota、地域や network の状態により、お手本ボイス生成、文字起こし、発音評価が失敗することがあります。",
          "同じ録音でも、provider や録音環境の変化により score や weak words が変わることがあります。",
          "失敗時は画面上の recovery message に従い、必要に応じて録り直し、時間を置いて retry、または support に連絡してください。"
        ]}
      />

      <LegalSection
        title="account deletion / support"
        items={[
          "Web beta では Settings から account deletion request を開始できます。",
          "actual destructive cleanup はまだ self-serve 完了していません。Web beta では request-based + support/manual cleanup の暫定運用です。",
          "Store submission 前には actual account/data deletion completion path が blocker です。",
          "privacy、support、account deletion の詳細は公開 draft route で確認できます。"
        ]}
      />

      <div className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm leading-6 text-ink-700">
          削除 request の詳細は{" "}
          <Link href="/support/account-deletion" className="font-semibold text-[var(--accent-strong)]">
            Account deletion draft
          </Link>
          {" "}を確認してください。
        </p>
      </div>
    </LegalPageShell>
  );
}
