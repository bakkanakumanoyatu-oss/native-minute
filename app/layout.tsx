import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppNav } from "@/components/navigation/app-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Native Minute",
  description: "固定1分の英語練習を毎日回すための MVP"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-screen max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-[var(--line)] bg-white/85 px-4 py-4 shadow-sm backdrop-blur sm:mb-8 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a4d37]">Native Minute</p>
              <p className="text-sm text-ink-600">今日の1分を練習する</p>
            </div>
            <AppNav />
          </header>
          <main>{children}</main>
          <footer className="mt-10 rounded-3xl border border-[var(--line)] bg-white/75 px-4 py-4 text-sm text-ink-600 shadow-sm sm:mt-12 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>Web beta draft. Practice-first core with public support links.</p>
              <nav className="flex flex-wrap gap-3 font-semibold text-ink-700">
                <Link href="/privacy" className="hover:text-[#8a4d37]">Privacy</Link>
                <Link href="/terms" className="hover:text-[#8a4d37]">Terms</Link>
                <Link href="/support" className="hover:text-[#8a4d37]">Support</Link>
                <Link href="/support/account-deletion" className="hover:text-[#8a4d37]">Account deletion</Link>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
