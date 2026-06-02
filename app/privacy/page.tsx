import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Privacy Draft | Native Minute",
  description: "Native Minute v1 privacy release candidate draft"
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Privacy release candidate draft"
      title="Native Minute Privacy"
      summary="Native Minute は、固定1分 script を聞く、録る、評価するための練習アプリです。このページは v1 Store release に向けて、扱うデータ、外部 processor、削除 request の範囲をユーザー向けに整理したドラフトです。final legal / release owner approval はまだ必要です。"
    >
      <LegalSection
        title="収集・保存する情報"
        items={[
          "account / login: Supabase Auth の account と email を使います。",
          "script content: ユーザーが作成、貼り付け、または AI draft から保存した練習 script を保存します。",
          "recordings: record 画面でアップロードした録音を private Storage に保存します。",
          "transcripts: OpenAI transcription の結果を review / progress 表示のために保存します。",
          "pronunciation scores: Azure Speech の評価結果から、総合スコア、accuracy、fluency、rhythm などを保存します。",
          "weak words: 次に直す単語や短い練習ポイントを保存します。",
          "coaching feedback: 日本語の短い summary / next step を保存します。",
          "generated script audios: ElevenLabs で生成したお手本ボイスを private Storage に保存し、protected replay route から再生します。",
          "voice samples / consent recordings: voice setup でアップロードした sample と consent recording を private Storage に保存します。",
          "clone voice metadata: ElevenLabs 側の cloned voice を呼び出すための provider metadata を server-side に保存します。",
          "quota / processing metadata: provider call の安全な status、count、non-billable/cached などの metadata を保存することがあります。",
          "support / deletion request metadata: account deletion request の status や support tracking に必要な最小情報を保存することがあります。"
        ]}
      />

      <LegalSection
        title="外部 processor"
        summary="v1 の provider 役割は固定しています。voice provider は ElevenLabs、OpenAI は transcription / script generation / coaching、Azure は pronunciation evaluator です。"
        items={[
          "Supabase: Auth、database、private Storage、protected replay に使います。",
          "OpenAI: 録音の文字起こし、Script Studio の draft generation、coaching-adjacent generation に使います。",
          "Azure Speech: pronunciation assessment に使います。",
          "ElevenLabs: voice clone と model audio generation に使います。"
        ]}
      />

      <LegalSection
        title="voice sample と consent recording"
        summary="v1 の voice setup は、通常のお手本ボイスを作るための最小機能です。Brush-up は v1.1 に延期しており、v1 では best take を script 専用 voice material として provider に送る機能はありません。"
        items={[
          "voice sample と consent recording は、client から provider へ直接送らず、app-owned Storage に保存してから server-side route 経由で処理します。",
          "v1 では通常の default voice / model audio generation のために使います。",
          "通常録音の同意と、voice sample / consent recording の同意は別の意味を持ちます。",
          "Brush-up 用の selected best take reuse、script-scoped voice variant、Brush-up revoke / cleanup は v1.1 の対象です。"
        ]}
      />

      <LegalSection
        title="保存しない方針"
        items={[
          "raw provider response body は、通常の user-facing UI や DB metadata に保存しません。",
          "secret、API key、auth header は client に表示しません。",
          "signed URL や raw storage path は user-facing response に出さず、protected route で再生します。",
          "quota metadata には raw seed、generated full text、raw script、raw transcript、raw audio bytes を入れない方針です。"
        ]}
      />

      <LegalSection
        title="削除 request"
        summary="Settings から account deletion request を開始できます。ただし現時点の v1 scaffold では実削除を完了したとは扱いません。Store submission 前には actual deletion completion path、provider cleanup、Storage cleanup、DB cleanup、Supabase Auth deletion、disposable proof の human approval が必要です。"
        items={[
          "削除 request は Settings から作成・確認できます。",
          "公開 Web からの削除 request 導線は /support/account-deletion に置きます。",
          "actual provider cleanup / Storage cleanup / DB cleanup / Supabase Auth deletion はこのページから実行しません。",
          "削除完了を保証する final copy ではなく、release candidate draft として扱います。",
          "削除対象や support fallback の詳細は Account deletion draft を確認してください。"
        ]}
      />

      <LegalSection
        title="human_required"
        items={[
          "Privacy Policy final URL: human_required",
          "Legal owner / final legal approval: human_required",
          "App Privacy / Google Data Safety final answers: human_required",
          "Account deletion disposable proof result: human_required"
        ]}
      />

      <div className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm leading-6 text-ink-700">
          データ削除については{" "}
          <Link href="/support/account-deletion" className="font-semibold text-[var(--accent-strong)]">
            Account deletion draft
          </Link>
          {" "}を確認してください。
        </p>
      </div>
    </LegalPageShell>
  );
}
