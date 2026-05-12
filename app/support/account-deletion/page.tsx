import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Account Deletion Draft | Native Minute",
  description: "Native Minute Web beta account deletion draft"
};

export default function AccountDeletionSupportPage() {
  return (
    <LegalPageShell
      eyebrow="Account deletion draft"
      title="Account and data deletion"
      summary="このページは Web beta / small cohort 用の削除 request 説明ドラフトです。actual destructive cleanup はまだ実行しません。Store submission 前には、削除完了 path の実装と最終レビューが必要です。"
    >
      <LegalSection
        title="Web beta でできること"
        items={[
          "ログイン済みユーザーは Settings から account deletion request を作成し、確認 step へ進めます。",
          "server-side の dry-run で、削除対象の安全な summary を確認できます。",
          "Web beta では request-based deletion + support/manual cleanup の暫定運用です。",
          "このページ自体は削除を実行しません。Storage、DB、ElevenLabs voice、Supabase Auth user はここから削除されません。"
        ]}
      />

      <LegalSection
        title="削除対象の概要"
        items={[
          "account / profile / scripts",
          "recordings、transcripts、pronunciation scores、weak words、coaching feedback",
          "saved best takes、saved model audios、generated script audios",
          "voice samples、consent recordings、clone voice metadata",
          "quota events、provider processing metadata、account deletion request records",
          "ElevenLabs provider-side cloned voice は cleanup candidate として扱います。"
        ]}
      />

      <LegalSection
        title="Web beta の暫定運用"
        items={[
          "削除 request は app 内で受け付けますが、actual provider cleanup / Storage cleanup / DB cleanup / Supabase Auth deletion はまだ自動実行しません。",
          "support/manual cleanup の一次返信目安は 3 business days、完了目安は 30 days です。",
          "Store submission 前には actual account/data deletion completion path が blocker です。",
          "削除完了後に短期保持する可能性があるのは、anonymized reference と request status など、support tracking に必要な最小情報だけです。"
        ]}
      />

      <LegalSection
        title="support へ連絡するとき"
        summary="Web beta の support contact は bakkanakuma@gmail.com です。"
        items={[
          "削除 request について問い合わせる場合は、Settings で request を開始したうえで、support contact に連絡してください。",
          "password、API key、auth header、magic link URL、provider voice id、storage path、signed URL、raw audio、raw transcript は送らないでください。",
          "ログインできる場合は Settings から request を開始してください。ログインできない場合は、このページを参照したうえで support contact に連絡してください。"
        ]}
      />

      <div className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm leading-6 text-ink-700">
          ログイン済みの場合は{" "}
          <Link href="/settings" className="font-semibold text-[var(--accent-strong)]">
            Settings
          </Link>
          {" "}から account deletion request を開始できます。データの扱いは{" "}
          <Link href="/privacy" className="font-semibold text-[var(--accent-strong)]">
            Privacy draft
          </Link>
          {" "}も確認してください。
        </p>
      </div>
    </LegalPageShell>
  );
}
