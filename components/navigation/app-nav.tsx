"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Home", href: "/", match: (pathname: string) => pathname === "/" },
  { label: "Practice", href: "/scripts", match: (pathname: string) => pathname.startsWith("/scripts") },
  { label: "Progress", href: "/progress", match: (pathname: string) => pathname.startsWith("/progress") },
  { label: "Voice", href: "/setup/voice", match: (pathname: string) => pathname.startsWith("/setup/voice") },
  { label: "Settings", href: "/settings", match: (pathname: string) => pathname.startsWith("/settings") }
];

export function AppNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-700 sm:justify-end" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-2 transition ${
              active
                ? "bg-[var(--studio-ink)] text-white shadow-sm"
                : "border border-[var(--studio-line)] bg-[var(--studio-surface)] text-ink-700 hover:bg-[var(--studio-surface-strong)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
