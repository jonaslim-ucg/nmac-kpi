"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

type Props = { title: string; subtitle?: string };

export function AppHeader({ title, subtitle }: Props) {
  return (
    <header
      className="sticky top-0 z-40 flex h-[4.25rem] shrink-0 items-center justify-between border-b border-border px-6 backdrop-blur-md"
      style={{
        background: `linear-gradient(135deg, var(--header-gradient-start) 0%, var(--header-gradient-end) 100%)`,
      }}
    >
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? (
          <p className="line-clamp-2 max-w-3xl text-sm leading-snug text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden rounded-full border border-border bg-surface-muted px-3.5 py-1 font-mono text-xs font-medium text-accent sm:inline-block">
          FY 2026
        </span>
        <Link
          href="/settings"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted/50 text-foreground shadow-sm transition hover:border-accent hover:bg-accent-muted/50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
