import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Privacy Draft | Native Minute",
  description: "Native Minute Web beta privacy draft"
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Privacy draft"
      title="Native Minute Privacy"
      summary="Native Minute は、固定1分 script を聞く、録る、評価するための Web beta アプリです。このページは、Web beta で扱うデータと外部 processor の範囲をユーザー向けに短く整理したドラフトです。"
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
          "quota / processing metadata: provider call の安全な status、count、non-billable/cached などの metadata を保存することがあります。"
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
        summary="Web beta では Settings から account deletion request を開始できます。実削除は request-based + support/manual cleanup の暫定運用で、Store submission 前には actual deletion completion path が blocker です。"
        items={[
          "削除 request は Settings から作成・確認できます。",
          "公開 Web からの削除 request 導線は /support/account-deletion に置きます。",
          "actual provider cleanup / Storage cleanup / DB cleanup / Supabase Auth deletion はまだ実装していません。",
          "削除対象や support fallback の詳細は Account deletion draft を確認してください。"
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
