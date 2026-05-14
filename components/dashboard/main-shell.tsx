"use client";

import { AppHeader } from "@/components/dashboard/app-header";
import { AppSidebar } from "@/components/dashboard/app-sidebar";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function MainShell({ title, subtitle, children }: Props) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader title={title} subtitle={subtitle} />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background/80 px-5 py-7 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
