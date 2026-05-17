import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal/beta-legal-page";

export const metadata: Metadata = {
  title: "Support Draft | Native Minute",
  description: "Native Minute Web beta support draft"
};

export default function SupportPage() {
  return (
    <LegalPageShell
      eyebrow="Support draft"
      title="Native Minute Support"
      summary="Web beta / small cohort 用の support draft です。正式公開前に最終レビューが必要ですが、Web beta の問い合わせ先と削除 request の目安をここにまとめます。"
    >
      <LegalSection
        title="問い合わせ先"
        summary="Web beta の問い合わせ先は bakkanakuma@gmail.com です。正式公開前に support URL / inbox 運用は再レビューします。"
        items={[
          "account deletion request は、一次返信の目安が 3 business days、完了目安が 30 days です。",
          "問い合わせ時は、secret、API key、auth header、magic link URL、raw provider response を貼らないでください。",
          "録音や transcript を送る必要がある場合は、support 側から明示的に依頼された範囲だけ共有してください。",
          "問題の phase が分かる場合は、login / listen / record / transcription / Azure evaluation / review / progress のどこで止まったかを書いてください。"
        ]}
      />

      <LegalSection
        title="ログインできない"
        items={[
          "magic link は最新のメールだけを使ってください。古い link や期限切れ link は login 画面に戻ることがあります。",
          "短時間に何度も login email を送ると Supabase Auth の email rate limit に当たります。その場合はしばらく待ってから再試行してください。",
          "callback 後に戻れない場合は、同じブラウザで link を開いているか、戻り先が internal path になっているかを確認してください。"
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
        summary="v1 mainline の voice provider は ElevenLabs です。OpenAI は voice provider ではなく、transcription / script generation / coaching 側で使います。"
        items={[
          "voice setup が未完了の場合、listen 画面や Settings から setup/voice に進めます。",
          "ElevenLabs 側の rate limit、billing、verification、deleted voice などでお手本ボイス生成に失敗することがあります。",
          "provider kill switch が有効な場合は、お手本ボイス生成が一時停止されることがあります。"
        ]}
      />

      <LegalSection
        title="データ削除したい"
        items={[
          "ログイン済みの場合は Settings から account deletion request を開始できます。",
          "Web からの説明と support fallback は /support/account-deletion にまとめています。",
          "削除 request の一次返信目安は 3 business days、完了目安は 30 days です。",
          "Web beta では request-based + support/manual cleanup の暫定運用で、actual destructive cleanup はまだ self-serve 完了していません。"
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
