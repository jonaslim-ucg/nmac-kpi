"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

type Props = { title: string; subtitle?: string };

export function AppHeader({ title, subtitle }: Props) {
  return (
    <header
      className="sticky top-0 z-40 flex min-h-[3.75rem] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5 backdrop-blur-md sm:px-5 lg:min-h-[4.25rem] lg:px-6 lg:py-3"
      style={{
        background: `linear-gradient(135deg, var(--header-gradient-start) 0%, var(--header-gradient-end) 100%)`,
      }}
    >
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-base font-semibold tracking-tight text-foreground sm:text-lg">{title}</h1>
        {subtitle ? (
          <p className="line-clamp-2 max-w-3xl text-sm leading-snug text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="hidden rounded-full border border-border bg-surface-muted px-3.5 py-1 font-mono text-xs font-medium text-accent lg:inline-block">
          FY 2023-2026
        </span>
        <Link
          href="/settings"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted/50 text-foreground shadow-sm transition hover:border-accent hover:bg-accent-muted/50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-10 sm:w-10"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
