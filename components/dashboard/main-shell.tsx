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
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background/80 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6 xl:px-8 xl:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
