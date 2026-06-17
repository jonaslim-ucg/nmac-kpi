"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppBrand } from "@/components/dashboard/app-logo";
import { SIDEBAR_SECTIONS } from "@/components/dashboard/nmac-2026-nav";
import { useSession } from "@/components/auth/session-provider";
import { formatDisplayName } from "@/lib/auth/display-name";
import { canEditKpiData, canManageUsers } from "@/lib/auth/types";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import { isNmacNavHrefAllowed } from "@/lib/auth/role-nmac-nav";

function linkActive(pathname: string, href: string): boolean {
  if (href === "/practice/weekly") {
    return pathname === "/practice/weekly" || pathname.startsWith("/practice/weekly/");
  }
  if (href === "/admin") return pathname === "/admin";
  if (href.startsWith("/admin/")) return pathname === href || pathname.startsWith(href + "/");
  if (href.startsWith("/nmac-2026")) {
    if (href === "/nmac-2026") return pathname === "/nmac-2026" || pathname === "/nmac-2026/";
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, loading } = useSession();
  const { hideLegacyNav, ready: prefsReady, roleNmacNav } = useDashboardPreferences();

  const sections = SIDEBAR_SECTIONS.map((section) => {
    if (hideLegacyNav && section.legacySection) {
      return { ...section, items: [] as typeof section.items };
    }
    return {
      ...section,
      items: section.items.filter((item) => {
        if (hideLegacyNav && item.legacy) return false;
        if (item.href.startsWith("/nmac-2026") && prefsReady) {
          return isNmacNavHrefAllowed(user?.role, item.href, roleNmacNav);
        }
        if ("requireDataEntry" in item && item.requireDataEntry) {
          return !loading && canEditKpiData(user?.role);
        }
        if ("requireAdmin" in item && item.requireAdmin) {
          return !loading && canManageUsers(user?.role);
        }
        return true;
      }),
    };
  }).filter((s) => s.items.length > 0);

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-[4.25rem] items-center border-b border-border px-3">
        <AppBrand layout="sidebar" />
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2 pt-2">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = linkActive(pathname, item.href);
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className={
                      "flex items-center gap-2.5 border-l-2 py-2 pl-3 pr-2 text-[13px] font-medium transition " +
                      (active
                        ? "border-accent bg-nav-active-bg text-nav-active-fg"
                        : "border-transparent text-muted-foreground hover:bg-surface-muted/80 hover:text-foreground")
                    }
                  >
                    <span
                      className={
                        "h-1.5 w-1.5 shrink-0 rounded-full " +
                        (active ? "bg-accent" : "bg-muted-foreground/50")
                      }
                      aria-hidden
                    />
                    <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                    <span className="min-w-0 leading-snug">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <div className="rounded-lg border border-border bg-surface-muted/50 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">Signed in</p>
          <p className="truncate text-sm font-medium text-foreground">
            {loading ? "…" : formatDisplayName(user)}
          </p>
          <p className="truncate text-xs text-muted-foreground">{loading ? "" : (user?.email ?? "")}</p>
          <p className="truncate text-xs capitalize text-muted-foreground">
            {loading ? "" : user?.role ?? ""}
          </p>
        </div>
      </div>
    </aside>
  );
}
