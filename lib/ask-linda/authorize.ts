import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function authorizeAskLindaKpiRequest(req: NextRequest): boolean {
  const secret = process.env.ASK_LINDA_KPI_API_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization")?.trim() ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function isAskLindaKpiBridgeConfigured(): boolean {
  return Boolean(process.env.ASK_LINDA_KPI_API_SECRET?.trim());
}
