"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/components/auth/session-provider";

/**
 * Client fallback: if `/api/auth/session` returns no user, leave the app (Bitrix iframe included).
 */
export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || user) return;
    if (pathname.startsWith("/login")) return;
    window.location.replace("/login?access=denied");
  }, [loading, user, pathname]);

  if (!loading && !user) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  return <>{children}</>;
}
