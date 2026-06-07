import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Support | Native Minute",
  description: "Native Minute support"
};

export default function SupportPage() {
  return (
    <LegalPageShell
      eyebrow="Support"
      title="Native Minute Support"
      summary="困ったときの連絡先と、ログイン、録音、評価、データ削除の確認方法をまとめています。Store 提出前に、サポートURLと運営者情報を最終確認します。"
    >
      <LegalSection
        title="問い合わせ先"
        summary="サポート連絡先は nativeminutes.support@gmail.com です。"
        items={[
          "アカウント削除リクエストは、一次返信の目安が 3 business days、完了目安が 30 days です。",
          "問い合わせ時は、API key、認証ヘッダー、magic link URL、外部サービスの詳細な応答本文を貼らないでください。",
          "録音や文字起こしを送る必要がある場合は、Support 側から明示的に依頼された範囲だけ共有してください。",
          "問題の場所が分かる場合は、login / listen / record / transcription / Azure evaluation / review / progress のどこで止まったかを書いてください。"
        ]}
      />

      <LegalSection
        title="ログインできない"
        items={[
          "magic link は最新のメールだけを使ってください。古い link や期限切れ link は login 画面に戻ることがあります。",
          "短時間に何度も login email を送ると Supabase Auth の email rate limit に当たります。その場合はしばらく待ってから再試行してください。",
          "ログイン後に戻れない場合は、同じブラウザでリンクを開いているか、戻り先がアプリ内のページになっているかを確認してください。"
        ]}
      />

      <LegalSection
        title="録音・評価できない"
        items={[
          "browser の microphone permission を許可してください。",
          "30〜60秒程度の明瞭な英語で録音してください。短すぎる、無音が多い、聞き取りにくい録音は empty transcript になることがあります。",
          "OpenAI transcription と Azure pronunciation evaluator のどちらで止まったかは、画面の recovery message を確認してください。",
          "Safari / mobile browser では録音形式や再生 permission の影響を受けることがあります。別 browser でも再確認してください。"
        ]}
      />

      <LegalSection
        title="お手本ボイス・voice setup"
        summary="お手本ボイスには ElevenLabs を使う場合があります。OpenAI は音声 provider ではなく、文字起こし、スクリプト作成補助、コーチング補助に使う場合があります。"
        items={[
          "voice setup が未完了の場合、listen 画面や Settings から setup/voice に進めます。",
          "音声サンプル / 同意録音は通常のお手本ボイス作成のために扱います。保存済みベスト録音を使った追加のお手本生成は、現在のサポート対象機能として案内しません。",
          "ElevenLabs 側の rate limit、billing、verification、deleted voice などでお手本ボイス生成に失敗することがあります。",
          "外部サービスの一時停止設定が有効な場合は、お手本ボイス生成が一時停止されることがあります。"
        ]}
      />

      <LegalSection
        title="データ削除したい"
        items={[
          "ログイン済みの場合は Settings からアカウント削除リクエストを開始できます。",
          "Web からの説明とサポート連絡先は /support/account-deletion にまとめています。",
          "削除リクエストの一次返信目安は 3 business days、完了目安は 30 days です。",
          "現在の画面では、リクエスト作成、確認、削除対象の件数確認までを扱います。保存ファイル、アプリデータ、外部サービス、ログインアカウントの実削除はこの画面からは実行しません。"
        ]}
      />

      <LegalSection
        title="公開前に最終確認する項目"
        items={[
          "Support URL と受信先",
          "運営者情報",
          "Store reviewer account と審査向け手順",
          "アカウント削除リクエストの最終確認結果"
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
