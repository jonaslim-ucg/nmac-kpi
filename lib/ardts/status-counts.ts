import { loadEnvConfig } from "@next/env";
import type {
  ArdtsItemType,
  ArdtsRangePreset,
  ArdtsStatusCountsErrorBody,
  ArdtsStatusCountsResponse,
} from "@/lib/ardts/types";

export class ArdtsConfigError extends Error {
  constructor() {
    super("ARDTS integration is not configured.");
    this.name = "ArdtsConfigError";
  }
}

export type FetchArdtsStatusCountsParams = {
  range?: ArdtsRangePreset;
  from?: string;
  to?: string;
  year?: number;
  month?: number;
  itemType?: ArdtsItemType;
  status?: string | string[];
};

let envLoaded = false;

function ensureLocalEnvLoaded(): void {
  if (envLoaded || process.env.NODE_ENV === "production") return;
  envLoaded = true;
  loadEnvConfig(process.cwd());
}

function ardtsBaseUrl(): string {
  ensureLocalEnvLoaded();
  const base = process.env.ARDTS_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) throw new ArdtsConfigError();
  return base;
}

function ardtsToken(): string {
  ensureLocalEnvLoaded();
  const token = process.env.ARDTS_INTEGRATION_API_TOKEN?.trim();
  if (!token) throw new ArdtsConfigError();
  return token;
}

export async function fetchArdtsStatusCounts(
  params: FetchArdtsStatusCountsParams,
): Promise<ArdtsStatusCountsResponse> {
  const url = new URL(`${ardtsBaseUrl()}/api/reports/status-counts`);
  if (params.year !== undefined || params.month !== undefined) {
    if (!params.year || !params.month) {
      throw new Error("Month reporting requires year and month.");
    }
    url.searchParams.set("year", String(params.year));
    url.searchParams.set("month", String(params.month));
  } else {
    const range = params.range ?? "last_7_days";
    url.searchParams.set("range", range);

    if (range === "custom") {
      if (!params.from || !params.to) {
        throw new Error("Custom range requires from and to (YYYY-MM-DD).");
      }
      url.searchParams.set("from", params.from);
      url.searchParams.set("to", params.to);
    }
  }

  if (params.itemType) {
    url.searchParams.set("item_type", params.itemType);
  }

  if (params.status) {
    const statuses = Array.isArray(params.status) ? params.status : [params.status];
    for (const s of statuses) {
      url.searchParams.append("status", s);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${ardtsToken()}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  let body: ArdtsStatusCountsResponse | ArdtsStatusCountsErrorBody;
  try {
    body = (await res.json()) as ArdtsStatusCountsResponse | ArdtsStatusCountsErrorBody;
  } catch {
    throw new Error(`ARDTS API HTTP ${res.status} (non-JSON response)`);
  }

  if (!res.ok) {
    const message =
      typeof body === "object" && body && "error" in body && typeof body.error === "string"
        ? body.error
        : `ARDTS API HTTP ${res.status}`;
    throw new Error(message);
  }

  return body as ArdtsStatusCountsResponse;
}
