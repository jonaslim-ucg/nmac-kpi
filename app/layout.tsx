import type { Metadata } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import { ThemeInitScript } from "@/components/theme-init-script";
import { Providers } from "@/components/providers";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";
import { getSessionUserForClient } from "@/lib/auth/session-user";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "NMAC KPI",
  description: "Weekly practice KPI dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [initialSessionUser, initialDashboardSettings] = await Promise.all([
    getSessionUserForClient(),
    getAppDashboardSettings(),
  ]);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="flex h-screen min-h-0 flex-col overflow-hidden bg-background font-sans text-foreground">
        <ThemeInitScript />
        <Providers
          initialSessionUser={initialSessionUser}
          initialDashboardSettings={initialDashboardSettings}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
