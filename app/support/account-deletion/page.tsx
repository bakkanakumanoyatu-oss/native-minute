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
      summary="このページは v1 Store release に向けた削除リクエスト説明ドラフトです。ユーザーは Settings から削除リクエストを作成し、確認できます。現時点ではこのページから実際の削除は実行されず、削除が終わった状態としても扱いません。Store submission 前には、削除完了 path と final human approval が必要です。"
    >
      <LegalSection
        title="現時点の scaffold でできること"
        items={[
          "ログイン済みユーザーは Settings から削除リクエストを作成し、誤操作防止の確認へ進めます。",
          "削除対象の件数と状態を、安全な summary として確認できます。",
          "表示するのは件数や状態だけで、録音そのもの、台本文、保存先パス、secret は表示しません。",
          "このページ自体は削除を実行しません。保存ファイル、アプリデータ、外部音声サービス、ログインアカウントはここから削除されません。"
        ]}
      />

      <LegalSection
        title="削除対象の概要"
        items={[
          "auth user、profile / account rows",
          "scripts、recordings、takes、transcripts、pronunciation scores、weak words、coaching feedback",
          "saved best takes、saved model audios、generated script audios / script-audios",
          "voice samples、consent recordings、voices、normal v1 provider voice resources",
          "quota events、provider processing metadata、account deletion request records",
          "ElevenLabs provider-side normal v1 voice resources は cleanup candidate として扱います。",
          "Brush-up-specific data は v1.1 の対象です。v1 では selected best take を script-scoped voice material として扱いません。"
        ]}
      />

      <LegalSection
        title="proof-first の進め方"
        items={[
          "1. リクエスト作成: Settings から削除リクエストを作成します。",
          "2. 確認: 誤操作防止のため、確認欄に指定された文字を入力します。",
          "3. 件数確認: 外部音声サービス、保存ファイル、アプリデータ、ログインアカウントの候補件数と状態だけを確認します。",
          "4. 使い捨てアカウントでの確認: Store submission 前に、安全な proof package を残します。",
          "5. 実削除の実装確認: 外部サービス、保存ファイル、アプリデータ、ログインアカウントの順序を守って扱います。",
          "6. 削除後の確認 / Store release QA: 完了後の safe status と Store-facing claim の整合を確認します。"
        ]}
      />

      <LegalSection
        title="v1 scaffold の未完了部分"
        items={[
          "削除リクエストは app 内で受け付けますが、外部サービス、保存ファイル、アプリデータ、ログインアカウントの実削除はこのページから自動実行しません。",
          "support/manual cleanup の一次返信目安は 3 business days、完了目安は 30 days です。",
          "Store submission 前には actual account/data deletion completion path と provider cleanup proof が blocker です。",
          "削除完了後に短期保持する可能性があるのは、anonymized reference と request status など、support tracking に必要な最小情報だけです。"
        ]}
      />

      <LegalSection
        title="support へ連絡するとき"
        summary="正式 support contact は nativeminutes.support@gmail.com です。Store release 用の account deletion request URL は human check で開けることを確認済みです。"
        items={[
          "削除リクエストについて問い合わせる場合は、Settings でリクエストを開始したうえで、support contact に連絡してください。",
          "password、API key、auth header、magic link URL、provider voice id、storage path、signed URL、raw audio、raw transcript は送らないでください。",
          "ログインできる場合は Settings からリクエストを開始してください。ログインできない場合は、このページを参照したうえで support contact に連絡してください。"
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
