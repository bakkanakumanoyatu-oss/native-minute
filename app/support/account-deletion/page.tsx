import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Account Deletion Draft | Native Minute",
  description: "Native Minute v1 account deletion release candidate draft"
};

export default function AccountDeletionSupportPage() {
  return (
    <LegalPageShell
      eyebrow="Account deletion release candidate draft"
      title="Account and data deletion"
      summary="このページは v1 Store release に向けた削除 request 説明ドラフトです。現時点では actual destructive cleanup を実行せず、削除完了済みとも扱いません。Store submission 前には、削除完了 path、disposable proof、final human approval が必要です。"
    >
      <LegalSection
        title="現時点の scaffold でできること"
        items={[
          "ログイン済みユーザーは Settings から account deletion request を作成し、確認 step へ進めます。",
          "server-side の dry-run で、削除対象の安全な summary を確認できます。",
          "現時点では request-based deletion + dry-run / support fallback の scaffold です。",
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
          "ElevenLabs provider-side cloned voice は cleanup candidate として扱います。",
          "Brush-up-specific data は v1.1 の対象です。v1 では selected best take を script-scoped voice material として扱いません。"
        ]}
      />

      <LegalSection
        title="v1 scaffold の未完了部分"
        items={[
          "削除 request は app 内で受け付けますが、actual provider cleanup / Storage cleanup / DB cleanup / Supabase Auth deletion はこのページから自動実行しません。",
          "support/manual cleanup の一次返信目安は 3 business days、完了目安は 30 days です。",
          "Store submission 前には actual account/data deletion completion path、disposable proof、provider cleanup proof が blocker です。",
          "削除完了後に短期保持する可能性があるのは、anonymized reference と request status など、support tracking に必要な最小情報だけです。"
        ]}
      />

      <LegalSection
        title="support へ連絡するとき"
        summary="現在の support contact は bakkanakuma@gmail.com です。Store release 用の final support URL / inbox は human_required です。"
        items={[
          "削除 request について問い合わせる場合は、Settings で request を開始したうえで、support contact に連絡してください。",
          "password、API key、auth header、magic link URL、provider voice id、storage path、signed URL、raw audio、raw transcript は送らないでください。",
          "ログインできる場合は Settings から request を開始してください。ログインできない場合は、このページを参照したうえで support contact に連絡してください。"
        ]}
      />

      <LegalSection
        title="human_required"
        items={[
          "Final account deletion request URL: human_required",
          "Legal owner / final deletion copy approval: human_required",
          "Actual deletion disposable proof result: human_required",
          "Provider cleanup proof for normal v1 voice resources: human_required"
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
