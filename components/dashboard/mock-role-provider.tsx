"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type AppRole = "admin" | "user";

type Ctx = { role: AppRole; setRole: (r: AppRole) => void };

const RoleContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "kpi-dashboard-role";

export function MockRoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<AppRole>("admin");

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY) as AppRole | null;
    if (raw === "admin" || raw === "user") setRoleState(raw);
  }, []);

  const setRole = (r: AppRole) => {
    setRoleState(r);
    window.localStorage.setItem(STORAGE_KEY, r);
  };

  return (
    <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>
  );
}

export function useAppRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useAppRole must be used within MockRoleProvider");
  return ctx;
}
