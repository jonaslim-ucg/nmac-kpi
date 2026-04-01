import { NextResponse } from "next/server";
import { getSessionUserForClient } from "@/lib/auth/session-user";

/** Never cache: client must always see the current cookie session. */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUserForClient();
    if (!user) {
      return NextResponse.json(
        { user: null },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }
    return NextResponse.json(
      { user },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { user: null },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
