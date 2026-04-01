import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { getSessionUserForClient } from "@/lib/auth/session-user";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  const initialSessionUser = await getSessionUserForClient();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-screen min-h-0 flex-col overflow-hidden bg-background font-sans text-foreground">
        <Providers initialSessionUser={initialSessionUser}>{children}</Providers>
      </body>
    </html>
  );
}
