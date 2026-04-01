"use client";

import { ThemeToggle } from "@/components/dashboard/theme-toggle";

type Props = { title: string; subtitle?: string };

export function AppHeader({ title, subtitle }: Props) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/90 px-6 backdrop-blur-md dark:bg-card/80">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <ThemeToggle />
    </header>
  );
}
