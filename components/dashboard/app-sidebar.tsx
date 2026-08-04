"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Check, ChevronDown, Menu, X } from "lucide-react";
import { AppBrand } from "@/components/dashboard/app-logo";
import { SIDEBAR_SECTIONS, type SidebarLink, type SidebarSection } from "@/components/dashboard/nmac-2026-nav";
import { useSession } from "@/components/auth/session-provider";
import { formatDisplayName } from "@/lib/auth/display-name";
import { canAccessDev, canEditKpiData, canManageUsers, formatRoleLabel } from "@/lib/auth/types";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import { isNmacNavHrefAllowed } from "@/lib/auth/role-nmac-nav";

function linkActive(pathname: string, href: string): boolean {
  if (href === "/practice/weekly") {
    return pathname === "/practice/weekly" || pathname.startsWith("/practice/weekly/");
  }
  if (href === "/admin") return pathname === "/admin";
  if (href.startsWith("/admin/")) return pathname === href || pathname.startsWith(href + "/");
  if (href === "/dev") return pathname === "/dev";
  if (href.startsWith("/dev/")) return pathname === href || pathname.startsWith(href + "/");
  if (href.startsWith("/nmac-2026")) {
    if (href === "/nmac-2026") return pathname === "/nmac-2026" || pathname === "/nmac-2026/";
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

function isNavItemVisible(
  item: SidebarLink,
  navReady: boolean,
  hideLegacyNav: boolean,
  userRole: string | null | undefined,
  roleNmacNav: Parameters<typeof isNmacNavHrefAllowed>[2],
  customRoles: Parameters<typeof canEditKpiData>[1],
): boolean {
  if (!navReady) {
    return item.href === "/settings";
  }

  if (hideLegacyNav && item.legacy) return false;
  if (item.href.startsWith("/nmac-2026") || item.href === "/admin/appointment-reviews") {
    return isNmacNavHrefAllowed(userRole, item.href, roleNmacNav);
  }
  if ("requireDataEntry" in item && item.requireDataEntry) {
    return canEditKpiData(userRole, customRoles);
  }
  if ("requireDev" in item && item.requireDev) {
    return canAccessDev(userRole);
  }
  if ("requireAdmin" in item && item.requireAdmin) {
    return canManageUsers(userRole);
  }
  return true;
}

function buildSections(
  navReady: boolean,
  hideLegacyNav: boolean,
  userRole: string | null | undefined,
  roleNmacNav: Parameters<typeof isNmacNavHrefAllowed>[2],
  customRoles: Parameters<typeof canEditKpiData>[1],
): SidebarSection[] {
  return SIDEBAR_SECTIONS.map((section) => {
    if (!navReady && section.legacySection) {
      return { ...section, items: [] as SidebarLink[] };
    }
    if (hideLegacyNav && section.legacySection) {
      return { ...section, items: [] as SidebarLink[] };
    }
    return {
      ...section,
      items: section.items.filter((item) =>
        isNavItemVisible(item, navReady, hideLegacyNav, userRole, roleNmacNav, customRoles),
      ),
    };
  }).filter((section) => section.items.length > 0);
}

export function AppSidebar() {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user, loading } = useSession();
  const { hideLegacyNav, ready: prefsReady, roleNmacNav, customRoles } = useDashboardPreferences();

  const navReady = !loading && prefsReady;
  const sections = buildSections(navReady, hideLegacyNav, user?.role ?? null, roleNmacNav, customRoles);
  const mobileNavItems = sections.flatMap((section) =>
    section.items.map((item) => ({ item, sectionTitle: section.title })),
  );
  const activeMobileNavItem =
    mobileNavItems.find(({ item }) => linkActive(pathname, item.href)) ?? mobileNavItems[0] ?? null;

  return (
    <>
      <div
        className="relative z-50 border-b border-border bg-sidebar lg:hidden"
        onKeyDown={(event) => {
          if (event.key === "Escape") setMobileNavOpen(false);
        }}
      >
        <div className="px-3 py-1.5 sm:py-2">
          {!navReady ? (
            <div
              className="h-12 animate-pulse rounded-xl border border-border bg-muted-foreground/10"
              aria-busy="true"
              aria-label="Loading navigation"
            />
          ) : (
            <div className="flex h-12 items-center justify-between gap-3 rounded-xl border border-border bg-card/80 px-3 shadow-sm">
              <AppBrand layout="sidebar" />
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 text-xs font-semibold text-foreground shadow-sm transition hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-dashboard-navigation"
                onClick={() => setMobileNavOpen((open) => !open)}
              >
                <Menu className="h-4 w-4" aria-hidden />
                Menu
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${mobileNavOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
            </div>
          )}
        </div>

        {navReady && mobileNavOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default bg-black/20 backdrop-blur-[1px]"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
            />
            <div
              id="mobile-dashboard-navigation"
              role="dialog"
              aria-modal="true"
              aria-label="Dashboard navigation"
              className="absolute left-3 right-3 top-[calc(100%+0.25rem)] z-50 mx-auto max-h-[min(72vh,34rem)] max-w-5xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur-md">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Navigation</p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {activeMobileNavItem?.item.label ?? "Choose a page"}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-muted-foreground transition hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  aria-label="Close navigation"
                  onClick={() => setMobileNavOpen(false)}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="grid gap-3 p-3 sm:grid-cols-2 md:grid-cols-3">
                {sections.map((section) => (
                  <section key={section.title} className="rounded-xl border border-border bg-surface-muted/35 p-2">
                    <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                      {section.title}
                    </p>
                    <div className="space-y-0.5">
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const active = linkActive(pathname, item.href);
                        return (
                          <Link
                            key={item.href + item.label}
                            href={item.href}
                            onClick={() => setMobileNavOpen(false)}
                            className={
                              "flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition " +
                              (active
                                ? "bg-nav-active-bg text-nav-active-fg"
                                : "text-muted-foreground hover:bg-card hover:text-foreground")
                            }
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                            {active ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
      <div className="flex h-[4.25rem] items-center border-b border-border px-3">
        <AppBrand layout="sidebar" />
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2 pt-2">
        {!navReady ? (
          <div className="px-2 py-3" aria-busy="true" aria-label="Loading navigation">
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded-md bg-muted-foreground/10" />
              ))}
            </div>
          </div>
        ) : (
          sections.map((section) => (
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
          ))
        )}
      </nav>
      <div className="border-t border-border p-3">
        <div className="rounded-lg border border-border bg-surface-muted/50 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">Signed in</p>
          <p className="truncate text-sm font-medium text-foreground">
            {loading ? "…" : formatDisplayName(user)}
          </p>
          <p className="truncate text-xs text-muted-foreground">{loading ? "" : (user?.email ?? "")}</p>
          <p className="truncate text-xs text-muted-foreground">
            {loading ? "" : formatRoleLabel(user?.role, customRoles)}
          </p>
        </div>
      </div>
      </aside>
    </>
  );
}
