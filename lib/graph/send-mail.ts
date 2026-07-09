type SendMailInput = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
};

export async function getGraphAccessToken(): Promise<string> {
  const tenant = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new Error("Azure Graph env vars are not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? "Failed to obtain Graph access token");
  }
  return json.access_token;
}

export async function sendMailViaGraph(input: SendMailInput): Promise<void> {
  const sender = process.env.GRAPH_SENDER_EMAIL;
  const senderName = (process.env.GRAPH_SENDER_NAME ?? "NMAC KPI").trim() || "NMAC KPI";
  if (!sender) {
    throw new Error("GRAPH_SENDER_EMAIL is not set");
  }

  const token = await getGraphAccessToken();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: {
          contentType: input.htmlBody ? "HTML" : "Text",
          content: input.htmlBody ?? input.textBody,
        },
        // Both are set: some clients use `sender` for the visible name; Outlook may still prefer the tenant GAL name.
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
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Graph sendMail failed: ${res.status} ${errText}`);
  }
}
