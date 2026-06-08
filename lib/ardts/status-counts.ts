import type {
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
  range: ArdtsRangePreset;
  from?: string;
  to?: string;
  status?: string | string[];
};

function ardtsBaseUrl(): string {
  const base = process.env.ARDTS_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) throw new ArdtsConfigError();
  return base;
}

function ardtsToken(): string {
  const token = process.env.ARDTS_INTEGRATION_API_TOKEN?.trim();
  if (!token) throw new ArdtsConfigError();
  return token;
}

export async function fetchArdtsStatusCounts(
  params: FetchArdtsStatusCountsParams,
): Promise<ArdtsStatusCountsResponse> {
  const url = new URL(`${ardtsBaseUrl()}/api/reports/status-counts`);
  url.searchParams.set("range", params.range);

  if (params.range === "custom") {
    if (!params.from || !params.to) {
      throw new Error("Custom range requires from and to (YYYY-MM-DD).");
    }
    url.searchParams.set("from", params.from);
    url.searchParams.set("to", params.to);
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
