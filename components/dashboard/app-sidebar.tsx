"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  Settings,
  Stethoscope,
  UserCog,
} from "lucide-react";
import { useAppRole } from "@/components/dashboard/mock-role-provider";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/doctors", label: "Doctors", icon: Stethoscope },
  { href: "/admin", label: "Data entry", icon: UserCog, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { role } = useAppRole();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center border-b border-border px-4">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Activity className="h-5 w-5 text-accent" aria-hidden />
          <span>NMAC KPI</span>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {nav
          .filter((item) => !(item as { adminOnly?: boolean }).adminOnly || role === "admin")
          .map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition " +
                  (active
                    ? "bg-nav-active-bg text-nav-active-fg"
                    : "text-muted-foreground hover:bg-accent-muted/60 hover:text-foreground")
                }
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                {item.label}
              </Link>
            );
          })}
      </nav>
      <div className="border-t border-border p-3">
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Signed in</p>
          <p className="truncate text-sm font-medium text-foreground">
            {role === "admin" ? "Admin" : "Viewer"}
          </p>
          <p className="truncate text-xs text-muted-foreground">Sign-in — coming soon</p>
        </div>
      </div>
    </aside>
  );
}
