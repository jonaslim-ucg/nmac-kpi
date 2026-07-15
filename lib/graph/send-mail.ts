type SendMailInput = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  deliveryKey?: string;
};

const GRAPH_REQUEST_TIMEOUT_MS = 12_000;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export class GraphMailError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly deliveryUncertain: boolean;

  constructor(
    message: string,
    options: {
      retryable: boolean;
      retryAfterMs?: number | null;
      deliveryUncertain?: boolean;
    },
  ) {
    super(message);
    this.name = "GraphMailError";
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.deliveryUncertain = options.deliveryUncertain ?? false;
  }
}

function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = new Date(raw).getTime();
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function compactGraphError(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function getGraphAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const tenant = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new GraphMailError("Azure Graph env vars are not configured", { retryable: false });
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  let res: Response;
  try {
    res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(GRAPH_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new GraphMailError(
      error instanceof Error ? `Graph token request failed: ${error.message}` : "Graph token request failed.",
      { retryable: true },
    );
  }

  let json: { access_token?: string; expires_in?: number; error_description?: string };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new GraphMailError(`Graph token request returned an invalid response (${res.status}).`, {
      retryable: res.status === 408 || res.status === 429 || res.status >= 500,
      retryAfterMs: retryAfterMs(res),
    });
  }
  if (!res.ok || !json.access_token) {
    throw new GraphMailError(json.error_description ?? "Failed to obtain Graph access token", {
      retryable: res.status === 408 || res.status === 429 || res.status >= 500,
      retryAfterMs: retryAfterMs(res),
    });
  }
  const expiresInSeconds = Number.isFinite(Number(json.expires_in))
    ? Math.max(60, Number(json.expires_in))
    : 3600;
  cachedAccessToken = {
    token: json.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  return cachedAccessToken.token;
}

export async function sendMailViaGraph(input: SendMailInput): Promise<void> {
  const sender = process.env.GRAPH_SENDER_EMAIL;
  const senderName = (process.env.GRAPH_SENDER_NAME ?? "NMAC KPI").trim() || "NMAC KPI";
  if (!sender) {
    throw new GraphMailError("GRAPH_SENDER_EMAIL is not set", { retryable: false });
  }

  const token = await getGraphAccessToken();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(input.deliveryKey ? { "client-request-id": input.deliveryKey } : {}),
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: {
            contentType: input.htmlBody ? "HTML" : "Text",
            content: input.htmlBody ?? input.textBody,
          },
          from: {
            emailAddress: {
              address: sender,
              name: senderName,
            },
          },
          sender: {
            emailAddress: {
              address: sender,
              name: senderName,
            },
          },
          toRecipients: [{ emailAddress: { address: input.to } }],
          ...(input.deliveryKey
            ? {
                internetMessageHeaders: [
                  { name: "x-nmac-survey-delivery-key", value: input.deliveryKey },
                ],
              }
            : {}),
        },
        saveToSentItems: true,
      }),
      signal: AbortSignal.timeout(GRAPH_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new GraphMailError(
      error instanceof Error ? `Graph sendMail request failed: ${error.message}` : "Graph sendMail request failed.",
      {
        retryable: false,
        deliveryUncertain: true,
      },
    );
  }

  if (!res.ok) {
    if (res.status === 401) cachedAccessToken = null;
    const errText = await res.text();
    throw new GraphMailError(
      `Graph sendMail failed: ${res.status} ${compactGraphError(errText)}`,
      {
        retryable:
          res.status === 401 ||
          res.status === 408 ||
          res.status === 409 ||
          res.status === 429 ||
          res.status >= 500,
        retryAfterMs: retryAfterMs(res),
      },
    );
  }
}
