import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Privacy | Native Minute",
  description: "Native Minute privacy and data handling"
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Privacy"
      title="Native Minute Privacy"
      summary="Native Minute は、固定1分スクリプトを聞く、録る、評価するための練習アプリです。このページでは、扱うデータ、外部サービス、削除リクエストの範囲を説明します。"
    >
      <LegalSection
        title="収集・保存する情報"
        items={[
          "アカウント / ログイン: Supabase Auth のアカウントとメールアドレスを使います。",
          "練習スクリプト: ユーザーが作成、貼り付け、または AI 補助で保存した練習スクリプトを保存します。",
          "録音: Record 画面でアップロードした録音を非公開の Storage に保存します。",
          "文字起こし: OpenAI による文字起こし結果を Review / Progress 表示のために保存します。",
          "発音スコア: Azure Speech の評価結果から、総合スコア、正確さ、流暢さ、リズムなどを保存します。",
          "弱点語: 次に直す単語や短い練習ポイントを保存します。",
          "コーチングフィードバック: 日本語の短いまとめや次の練習ポイントを保存します。",
          "お手本音声: ElevenLabs で生成したお手本ボイスを非公開 Storage に保存し、アプリ管理の再生導線から再生します。",
          "音声サンプル / 同意録音: Voice setup でアップロードした音声サンプルと同意録音を非公開 Storage に保存します。",
          "ボイス設定情報: ElevenLabs 側のボイスを呼び出すために必要な情報を server-side に保存します。",
          "利用量 / 処理メモ: 外部サービス呼び出しの安全な状態、件数、キャッシュ状態などのメモを保存することがあります。",
          "サポート / 削除リクエスト情報: 削除リクエストの状態やサポート対応に必要な最小情報を保存することがあります。"
        ]}
      />

      <LegalSection
        title="外部サービス"
        summary="Native Minute は、文字起こし、発音評価、お手本音声などに外部サービスを使う場合があります。"
        items={[
          "Supabase: ログイン、データベース、非公開 Storage、アプリ管理の再生に使います。",
          "OpenAI: 録音の文字起こし、スクリプト作成補助、コーチング補助に使います。",
          "Azure Speech: 発音評価に使います。",
          "ElevenLabs: お手本ボイスの準備と生成に使います。"
        ]}
      />

      <LegalSection
        title="音声サンプルと同意録音"
        summary="Voice setup では、通常のお手本ボイスを作るために音声サンプルや同意録音を扱う場合があります。保存済みベスト録音を、別のお手本ボイス素材として外部サービスへ送る機能は現在提供していません。"
        items={[
          "音声サンプルと同意録音は、client から外部サービスへ直接送らず、アプリ管理の Storage に保存してから server-side route 経由で処理します。",
          "通常のお手本ボイスやお手本音声のために使います。",
          "通常録音の同意と、音声サンプル / 同意録音の同意は別の意味を持ちます。",
          "保存済みベスト録音の別利用、専用ボイス作成、同意撤回は、現在提供していない追加機能の範囲です。"
        ]}
      />

      <LegalSection
        title="保存しない方針"
        items={[
          "外部サービスの詳細な応答本文は、通常の画面やユーザー向け情報に保存しません。",
          "API key や認証ヘッダーは client に表示しません。",
          "署名付きURLや保存先の詳細パスは画面に出さず、アプリ管理の再生導線で再生します。",
          "利用量メモには、全文の台本、全文の文字起こし、録音データそのものを入れない方針です。"
        ]}
      />

      <LegalSection
        title="削除リクエスト"
        summary="Settings からアカウント削除リクエストを開始できます。現在の画面では、リクエスト作成、確認、削除対象の件数確認までを扱います。保存ファイル、アプリデータ、外部サービス、ログインアカウントの実際の削除は、このページからは実行しません。"
        items={[
          "削除リクエストは Settings から作成・確認できます。",
          "Web からの削除リクエストの説明は /support/account-deletion に置きます。",
          "外部サービス、Storage、アプリデータ、ログインアカウントの削除はこのページから実行しません。",
          "削除対象やサポート連絡の詳細は Account deletion request を確認してください。"
        ]}
      />

      <LegalSection
        title="公開前に最終確認する項目"
        items={[
          "Privacy Policy の最終URL",
          "運営者情報と法務観点の最終確認",
          "App Privacy / Google Data Safety の回答",
          "アカウント削除の最終確認結果"
        ]}
      />

      <div className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm leading-6 text-ink-700">
          データ削除については{" "}
          <Link href="/support/account-deletion" className="font-semibold text-[var(--accent-strong)]">
            Account deletion request
          </Link>
          {" "}を確認してください。
        </p>
      </div>
    </LegalPageShell>
  );
}
