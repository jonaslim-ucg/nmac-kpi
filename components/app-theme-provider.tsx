"use client";

import * as React from "react";

import { APP_THEME_STORAGE_KEY } from "@/lib/app-theme";

export type AppThemeName = "light" | "dark";

type Ctx = {
  theme: AppThemeName | undefined;
  setTheme: (name: string) => void;
  resolvedTheme: AppThemeName | undefined;
  themes: readonly string[];
};

const ThemeCtx = React.createContext<Ctx>({
  theme: undefined,
  setTheme: () => {},
  resolvedTheme: undefined,
  themes: ["light", "dark"],
});

function applyThemeClass(theme: AppThemeName) {
  const el = document.documentElement;
  el.classList.remove("light", "dark");
  el.classList.add(theme);
  el.style.colorScheme = theme;
}

/** Theme context compatible with the small subset of `next-themes` this app uses. */
export function AppThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: React.ReactNode;
  defaultTheme?: AppThemeName;
}) {
  const [theme, setThemeState] = React.useState<AppThemeName | undefined>(undefined);

  React.useLayoutEffect(() => {
    let next: AppThemeName = defaultTheme;
    try {
      const raw = localStorage.getItem(APP_THEME_STORAGE_KEY);
      if (raw === "light" || raw === "dark") next = raw;
      else if (document.documentElement.classList.contains("light")) next = "light";
      else if (document.documentElement.classList.contains("dark")) next = "dark";
    } catch {
      next = defaultTheme;
    }
    setThemeState(next);
    applyThemeClass(next);
  }, [defaultTheme]);

  const setTheme = React.useCallback(
    (name: string) => {
      const next: AppThemeName = name === "light" || name === "dark" ? name : defaultTheme;
      setThemeState(next);
      try {
        localStorage.setItem(APP_THEME_STORAGE_KEY, next);
      } catch {
        /* private mode / quota */
      }
      applyThemeClass(next);
    },
    [defaultTheme],
  );

  const value = React.useMemo<Ctx>(
    () => ({
      theme,
      setTheme,
      resolvedTheme: theme,
      themes: ["light", "dark"],
    }),
    [theme, setTheme],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useAppTheme() {
  return React.useContext(ThemeCtx);
}
