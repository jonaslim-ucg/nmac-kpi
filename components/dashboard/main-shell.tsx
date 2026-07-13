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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background lg:flex-row">
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader title={title} subtitle={subtitle} />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background/80 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
