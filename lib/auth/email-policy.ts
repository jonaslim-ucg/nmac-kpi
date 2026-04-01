const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** If AUTH_ALLOWED_EMAIL_DOMAINS is set (comma-separated, no @), email must match one domain. */
export function isEmailDomainAllowed(email: string): boolean {
  const raw = process.env.AUTH_ALLOWED_EMAIL_DOMAINS?.trim();
  if (!raw) return true;
  const domains = raw.split(",").map((d) => d.trim().toLowerCase().replace(/^@/, ""));
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return domains.some((d) => d.length > 0 && domain === d);
}

export function isBootstrapAdmin(email: string): boolean {
  const raw = process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS?.trim();
  if (!raw) return false;
  const lower = email.toLowerCase().trim();
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(lower);
}
