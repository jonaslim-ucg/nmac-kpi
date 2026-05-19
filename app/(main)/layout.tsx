import { redirect } from "next/navigation";
import { SessionGuard } from "@/components/auth/session-guard";
import { clearSessionCookie } from "@/lib/auth/sync-session";
import { getSessionUserForClient } from "@/lib/auth/session-user";

export default async function MainGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUserForClient();
  if (!user) {
    await clearSessionCookie();
    redirect("/login?access=denied");
  }

  return (
    <SessionGuard>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
        {children}
      </div>
    </SessionGuard>
  );
}
