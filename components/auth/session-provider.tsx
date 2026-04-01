"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth/session-user";

type User = SessionUser;

type Ctx = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

type Props = {
  children: React.ReactNode;
  /** Set from the server layout so the sidebar shows email/role without relying on a cached client fetch. */
  initialUser?: User | null;
};

export function SessionProvider({ children, initialUser = null }: Props) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(initialUser == null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json()) as { user: User | null };
      setUser(j.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUser(initialUser ?? null);
    setLoading(initialUser == null);
  }, [initialUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      refresh,
      logout,
    }),
    [user, loading, refresh, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
