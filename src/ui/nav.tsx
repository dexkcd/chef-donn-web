"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./kit";

const TABS = [
  { href: "/", label: "Overview", match: (p: string) => p === "/", icon: "M3 12h4v8H3zM10 4h4v16h-4zM17 9h4v11h-4z" },
  { href: "/receipts", label: "Receipts", match: (p: string) => p.startsWith("/receipts"), icon: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4" },
  { href: "/budget", label: "Budget", match: (p: string) => p.startsWith("/budget") || p.startsWith("/payments") || p.startsWith("/funding"), icon: "M3 6h18v12H3zM3 10h18M7 15h4" },
  { href: "/roadmap", label: "Roadmap", match: (p: string) => p.startsWith("/roadmap"), icon: "M4 4v16M4 5h11l-2 3 2 3H4M4 14h8" },
  { href: "/settings", label: "More", match: (p: string) => p.startsWith("/settings"), icon: "M4 7h16M4 12h16M4 17h16" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-ink bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-[64px] flex-col items-center justify-center gap-0.5 border-t-4",
                  active ? "border-green text-green" : "border-transparent text-muted",
                )}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                <span className="label text-[12px]">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
