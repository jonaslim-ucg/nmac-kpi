"use client";

import { Moon, Sun } from "lucide-react";
import { useAppTheme } from "@/components/app-theme-provider";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useAppTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted/50"
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme !== "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted/50 text-foreground shadow-sm transition hover:border-accent hover:bg-accent-muted/50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px] text-amber-300" strokeWidth={2} />
      ) : (
        <Moon className="h-[18px] w-[18px] text-accent" strokeWidth={2} />
      )}
    </button>
  );
}
