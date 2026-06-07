import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Account Deletion | Native Minute",
  description: "Native Minute account deletion request"
};

export default function AccountDeletionSupportPage() {
  return (
    <LegalPageShell
      eyebrow="Account deletion"
      title="Account and data deletion"
      summary="ログイン済みユーザーは Settings から削除リクエストを作成し、内容を確認できます。現在の画面では、リクエスト作成、内容確認、削除対象の概要確認までを扱います。録音・音声ファイル、練習記録、外部サービス上の音声データ、ログイン情報の実際の削除は、このページからは実行しません。"
    >
      <LegalSection
        title="このページで確認できること"
        items={[
          "ログイン済みユーザーは Settings から削除リクエストを作成し、内容確認へ進めます。",
          "削除対象の件数と状態を、安全な概要として確認できます。",
          "表示するのは件数や状態だけで、録音そのもの、台本文、保存先パス、機密情報は表示しません。",
          "このページ自体は削除を実行しません。録音・音声ファイル、練習記録、外部サービス上の音声データ、ログイン情報はここから削除されません。"
        ]}
      />

      <LegalSection
        title="削除対象の概要"
        items={[
          "ログイン情報、プロフィール / アカウント情報",
          "台本、録音、練習結果、文字起こし、発音スコア、弱点語、コーチングメモ",
          "保存済みベスト録音、保存済みお手本音声、台本用お手本音声",
          "音声サンプル、同意録音、ボイス設定、通常のお手本ボイス関連情報",
          "利用量メモ、外部サービス上の音声データの処理メモ、削除リクエストの管理記録",
          "ElevenLabs 側の通常のお手本ボイス関連情報は、必要に応じて削除確認の対象として扱います。",
          "保存済みベスト録音を使った追加のお手本生成データは、現在の機能では扱いません。"
        ]}
      />

      <LegalSection
        title="削除リクエストの流れ"
        items={[
          "1. リクエスト作成: Settings から削除リクエストを作成します。",
          "2. 内容確認: 誤操作防止のため、確認欄に指定された文字を入力します。",
          "3. 概要確認: 外部サービス上の音声データ、録音・音声ファイル、練習記録、ログイン情報の候補件数と状態だけを確認します。",
          "4. 安全確認: サポート側で対象と順序を確認します。",
          "5. 削除手続き: 別の安全な手順で、対象と順序を確認してから扱います。",
          "6. 削除後の確認: 完了後の状態とユーザー向け説明が一致しているか確認します。"
        ]}
      />

      <LegalSection
        title="現在このページから実行しないこと"
        items={[
          "削除リクエストはアプリ内で受け付けますが、外部サービス上の音声データ、録音・音声ファイル、練習記録、ログイン情報の実削除はこのページから自動実行しません。",
          "サポート対応の一次返信目安は 3 business days、完了目安は 30 days です。",
          "録音・音声ファイル、練習記録、外部サービス上の音声データ、ログイン情報の実削除は、別の安全な手順で確認してから進めます。",
          "削除完了後に短期保持する可能性があるのは、匿名化した参照とリクエスト状態など、サポート対応に必要な最小情報だけです。"
        ]}
      />

      <LegalSection
        title="support へ連絡するとき"
        summary="サポート連絡先は nativeminutes.support@gmail.com です。"
        items={[
          "削除リクエストについて問い合わせる場合は、Settings でリクエストを開始したうえで、support contact に連絡してください。",
          "パスワード、API key、認証ヘッダー、magic link URL、外部ボイスID、保存先パス、署名付きURL、録音そのもの、文字起こし全文は送らないでください。",
          "ログインできる場合は Settings からリクエストを開始してください。ログインできない場合は、このページを参照したうえで support contact に連絡してください。"
        ]}
      />

      <LegalSection
        title="公開前に最終確認する項目"
        items={[
          "Account deletion request の最終URL",
          "運営者情報と削除説明の最終確認",
          "実削除に進む前の確認結果",
          "通常のお手本ボイス関連情報の削除確認"
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
            Privacy Policy
          </Link>
          {" "}も確認してください。
        </p>
      </div>
    </LegalPageShell>
  );
}
