import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Terms | Native Minute",
  description: "Native Minute terms"
};

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Terms"
      title="Native Minute Terms"
      summary="Native Minute を安心して使うための基本的な利用条件です。Store 提出前に、運営者情報と法務観点の最終確認を行います。"
    >
      <LegalSection
        title="サービスの位置づけ"
        items={[
          "Native Minute は英語練習を支援するアプリです。発音能力、語学力、試験結果を完全または公式に判定するものではありません。",
          "現在は無料公開を前提にしています。ただし外部サービス側の障害、利用制限、メンテナンスにより一時的に使えない場合があります。",
          "スコアやコーチングは練習の目安です。録音環境、マイク、発話内容、外部サービスの状態によって結果が変わることがあります。"
        ]}
      />

      <LegalSection
        title="ユーザーが守ること"
        items={[
          "自分が使う権利のあるスクリプト、録音、音声サンプルだけを使ってください。",
          "他人の声を使う場合は、本人の明確な許可が必要です。まずは自分の声を使う前提を推奨します。",
          "音声サンプル / 同意録音は、通常のお手本ボイス作成のために使います。通常録音の同意を、別機能の音声素材利用の同意として扱いません。",
          "映画のセリフ、近年の有名スピーチ、著作権上危険な本文を大量に貼り付けたり、配布目的で使ったりしないでください。",
          "セキュリティ、利用制限、アプリ管理の再生、削除リクエストの流れを回避する操作をしないでください。",
          "違法、差別的、嫌がらせ、なりすまし、第三者の権利侵害につながる使い方をしないでください。"
        ]}
      />

      <LegalSection
        title="外部サービスと結果の変動"
        summary="Native Minute は、お手本ボイス、文字起こし、スクリプト作成補助、コーチング補助、発音評価に外部サービスを使う場合があります。"
        items={[
          "外部サービスの障害、利用制限、地域やネットワークの状態により、お手本ボイス生成、文字起こし、発音評価が失敗することがあります。",
          "同じ録音でも、外部サービスや録音環境の変化によりスコアや弱点語が変わることがあります。",
          "失敗時は画面上の案内に従い、必要に応じて録り直し、時間を置いて再試行、または Support に連絡してください。"
        ]}
      />

      <LegalSection
        title="v1 に含まれないもの"
        summary="現在提供していない追加機能は、Store 説明や審査向け手順でも利用可能な機能として扱いません。"
        items={[
          "保存済みベスト録音を、専用のお手本ボイス素材として外部サービスへ送る機能は現在提供していません。",
          "その追加機能に必要な同意、撤回、専用ボイス、生成音声、削除対応は今後の対象です。",
          "現在のアカウント削除リクエストは、通常録音、評価、通常の voice setup、お手本音声を対象にします。"
        ]}
      />

      <LegalSection
        title="アカウント削除とサポート"
        items={[
          "Settings からアカウント削除リクエストを開始できます。",
          "現在の画面では、削除リクエストの作成、確認、削除対象の件数確認までを扱います。",
          "保存ファイル、アプリデータ、外部サービス、ログインアカウントの実際の削除は、この画面からは実行しません。",
          "Privacy、Support、Account deletion request の詳細は各ページで確認できます。"
        ]}
      />

      <LegalSection
        title="公開前に最終確認する項目"
        items={[
          "Terms の最終URL",
          "運営者情報と法務観点の最終確認",
          "審査向け手順の最終確認"
        ]}
      />

      <div className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm leading-6 text-ink-700">
          削除リクエストの詳細は{" "}
          <Link href="/support/account-deletion" className="font-semibold text-[var(--accent-strong)]">
            Account deletion request
          </Link>
          {" "}を確認してください。
        </p>
      </div>
    </LegalPageShell>
  );
}
