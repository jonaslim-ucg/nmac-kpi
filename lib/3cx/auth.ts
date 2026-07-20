export function isAuthorizedThreeCxSecretRequest(req: Request): boolean {
  const header = req.headers.get("authorization")?.trim();
  if (!header?.toLowerCase().startsWith("bearer ")) return false;

  const token = header.slice(7).trim();
  const allowed = [
    process.env.GRAPH_3CX_CRON_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
    process.env.NODE_ENV !== "production" ? process.env.AUTH_SECRET?.trim() : null,
  ].filter((value): value is string => Boolean(value));

  return allowed.some((secret) => secret === token);
}
