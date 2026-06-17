import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Calendar,
  ClipboardList,
  Database,
  HeartPulse,
  LayoutDashboard,
  Phone,
  ScrollText,
  Settings,
  Share2,
  Stethoscope,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

export type SidebarLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  requireDataEntry?: boolean;
  requireAdmin?: boolean;
  requireDev?: boolean;
  /** Weekly KPIs / legacy admin entry — hidden when “Hide legacy navigation” is on in Settings. */
  legacy?: boolean;
};

export type SidebarSection = {
  title: string;
  items: SidebarLink[];
  /** Whole block (e.g. Practice) hidden with legacy nav preference. */
  legacySection?: boolean;
};

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    title: "NMAC master KPI",
    items: [
      { href: "/nmac-2026", label: "Performance overview", icon: BarChart3 },
      { href: "/nmac-2026/visits", label: "Visit volume", icon: Activity },
      { href: "/nmac-2026/scheduling", label: "Scheduling", icon: Calendar },
      { href: "/nmac-2026/finance", label: "Finance & revenue", icon: Wallet },
      { href: "/nmac-2026/calls", label: "Call performance", icon: Phone },
      { href: "/nmac-2026/nursing", label: "Nursing KPIs", icon: HeartPulse },
      { href: "/nmac-2026/specialty", label: "Specialty clinics", icon: Stethoscope },
      { href: "/nmac-2026/compliance", label: "Compliance & quality", icon: ClipboardList },
      { href: "/nmac-2026/referrals", label: "Referral KPI", icon: Share2 },
    ],
  },
  {
    title: "Practice",
    legacySection: true,
    items: [
      { href: "/practice/weekly", label: "Weekly KPIs", icon: LayoutDashboard },
      { href: "/doctors", label: "Doctors", icon: Stethoscope },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        href: "/admin",
        label: "Data entry (Supabase)",
        icon: UserCog,
        requireDataEntry: true,
        legacy: true,
      },
      { href: "/admin/nmac-master", label: "NMAC master", icon: Database, requireDataEntry: true },
      { href: "/admin/users", label: "Users", icon: Users, requireAdmin: true },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    title: "Dev",
    items: [{ href: "/dev/logs", label: "Activity", icon: ScrollText, requireDev: true }],
  },
];
