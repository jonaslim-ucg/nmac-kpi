/** Role ids stored in app_users and signed into sessions. */
export function isAppRole(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_]*$/.test(value);
}
