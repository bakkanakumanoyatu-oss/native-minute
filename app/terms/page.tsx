import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Terms Draft | Native Minute",
  description: "Native Minute v1 terms release candidate draft"
};

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Terms release candidate draft"
      title="Native Minute Terms"
      summary="このページは Native Minute v1 Store release に向けた利用条件ドラフトです。正式公開や Store submission の前に、release owner と legal review による final human approval が必要です。"
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
          "voice sample / consent recording は、通常のお手本ボイス作成のために使います。通常録音の同意を、将来の Brush-up 素材利用の同意として扱いません。",
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
        title="v1 に含まれないもの"
        summary="Brush-up は v1.1 に延期しています。v1 の Store metadata、screenshot、reviewer note、privacy / terms copy では、利用可能な v1 機能として扱いません。"
        items={[
          "best take を script 専用 voice material として provider に送る機能は v1 に含みません。",
          "Brush-up 用の同意、revoke、script-scoped voice variant、generated Brush-up audio、Brush-up cleanup proof は v1.1 の対象です。",
          "v1 の account deletion は実際に v1 で扱う通常録音、評価、通常 voice setup、normal model audio を対象にします。"
        ]}
      />

      <LegalSection
        title="account deletion / support"
        items={[
          "Web beta では Settings から account deletion request を開始できます。",
          "現時点の scaffold では actual destructive cleanup は self-serve 完了しません。削除 request と dry-run / proof の準備状態を確認する段階です。",
          "Store submission 前には actual account/data deletion completion path、disposable proof、provider cleanup proof が blocker です。",
          "privacy、support、account deletion の詳細は公開 draft route で確認できます。"
        ]}
      />

      <LegalSection
        title="human_required"
        items={[
          "Terms final URL: human_required",
          "Legal owner / final legal approval: human_required",
          "Reviewer instructions final approval: human_required"
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
