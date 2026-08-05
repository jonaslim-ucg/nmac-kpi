import { resolve4, resolve6, resolveMx } from "node:dns/promises";
import { domainToASCII } from "node:url";

const DEFAULT_DNS_TIMEOUT_MS = 4_000;
const VALID_DOMAIN_TTL_MS = 6 * 60 * 60 * 1_000;
const INVALID_DOMAIN_TTL_MS = 60 * 60 * 1_000;
const UNKNOWN_DOMAIN_TTL_MS = 2 * 60 * 1_000;

type DomainValidation = {
  status: "valid" | "invalid" | "unknown";
  reason: string;
};

export type SurveyEmailValidationResult = DomainValidation & {
  normalizedEmail: string | null;
  domain: string | null;
  mailboxVerified: false;
};

export type EmailDomainResolver = {
  resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
};

type ValidateSurveyEmailOptions = {
  resolver?: EmailDomainResolver;
  timeoutMs?: number;
  now?: number;
  useCache?: boolean;
};

const defaultResolver: EmailDomainResolver = { resolveMx, resolve4, resolve6 };
const domainValidationCache = new Map<string, { expiresAt: number; value: DomainValidation }>();

function invalidFormat(reason: string): SurveyEmailValidationResult {
  return {
    status: "invalid",
    normalizedEmail: null,
    domain: null,
    mailboxVerified: false,
    reason,
  };
}

function parseEmailAddress(value: string):
  | { normalizedEmail: string; domain: string }
  | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { error: "Email address is empty." };
  if (trimmed.length > 254 || /[^\x21-\x7e]/.test(trimmed)) {
    return { error: "Email address format is invalid." };
  }

  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    return { error: "Email address format is invalid." };
  }

  const local = trimmed.slice(0, at);
  const rawDomain = trimmed.slice(at + 1);
  if (
    local.length > 64
    || local.startsWith(".")
    || local.endsWith(".")
    || local.includes("..")
    || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)
  ) {
    return { error: "Email address format is invalid." };
  }

  const domain = domainToASCII(rawDomain).toLowerCase();
  const labels = domain.split(".");
  if (
    !domain
    || domain.length > 253
    || labels.length < 2
    || labels.some((label) =>
      !label
      || label.length > 63
      || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    return { error: "Email domain format is invalid." };
  }

  return {
    normalizedEmail: `${local.toLowerCase()}@${domain}`,
    domain,
  };
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = String((error as { code?: unknown }).code ?? "").trim().toUpperCase();
  return code || null;
}

function isNoDataError(error: unknown): boolean {
  return ["ENODATA", "ENOTFOUND", "ENONAME"].includes(errorCode(error) ?? "");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error("Email domain lookup timed out.") as Error & { code?: string };
          error.code = "EMAIL_VALIDATION_TIMEOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function validateAddressFallback(
  domain: string,
  resolver: EmailDomainResolver,
  timeoutMs: number,
): Promise<DomainValidation> {
  const results = await Promise.allSettled([
    withTimeout(resolver.resolve4(domain), timeoutMs),
    withTimeout(resolver.resolve6(domain), timeoutMs),
  ]);
  if (results.some((result) => result.status === "fulfilled" && result.value.length > 0)) {
    return {
      status: "valid",
      reason: "Email format and mail domain are valid; mailbox existence is confirmed only by delivery.",
    };
  }

  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length === results.length && failures.every((result) => isNoDataError(result.reason))) {
    return {
      status: "invalid",
      reason: "Email domain is not configured to receive mail.",
    };
  }

  return {
    status: "unknown",
    reason: "Email domain could not be checked right now; delivery will be retried later.",
  };
}

async function validateDomain(
  domain: string,
  resolver: EmailDomainResolver,
  timeoutMs: number,
): Promise<DomainValidation> {
  try {
    const records = await withTimeout(resolver.resolveMx(domain), timeoutMs);
    if (records.some((record) => record.exchange.trim() && record.exchange.trim() !== ".")) {
      return {
        status: "valid",
        reason: "Email format and mail domain are valid; mailbox existence is confirmed only by delivery.",
      };
    }
    if (records.some((record) => record.exchange.trim() === ".")) {
      return {
        status: "invalid",
        reason: "Email domain does not accept email.",
      };
    }
    return validateAddressFallback(domain, resolver, timeoutMs);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOTFOUND" || code === "ENONAME") {
      return { status: "invalid", reason: "Email domain does not exist." };
    }
    if (code === "ENODATA") {
      return validateAddressFallback(domain, resolver, timeoutMs);
    }
    return {
      status: "unknown",
      reason: "Email domain could not be checked right now; delivery will be retried later.",
    };
  }
}

export async function validateSurveyEmailAddress(
  value: string,
  options: ValidateSurveyEmailOptions = {},
): Promise<SurveyEmailValidationResult> {
  const parsed = parseEmailAddress(value);
  if ("error" in parsed) return invalidFormat(parsed.error);

  const now = options.now ?? Date.now();
  const useCache = options.useCache ?? !options.resolver;
  const cached = useCache ? domainValidationCache.get(parsed.domain) : undefined;
  if (cached && cached.expiresAt > now) {
    return {
      ...cached.value,
      normalizedEmail: parsed.normalizedEmail,
      domain: parsed.domain,
      mailboxVerified: false,
    };
  }

  const valueForDomain = await validateDomain(
    parsed.domain,
    options.resolver ?? defaultResolver,
    Math.max(250, options.timeoutMs ?? DEFAULT_DNS_TIMEOUT_MS),
  );
  if (useCache) {
    const ttl = valueForDomain.status === "valid"
      ? VALID_DOMAIN_TTL_MS
      : valueForDomain.status === "invalid"
        ? INVALID_DOMAIN_TTL_MS
        : UNKNOWN_DOMAIN_TTL_MS;
    domainValidationCache.set(parsed.domain, { expiresAt: now + ttl, value: valueForDomain });
  }

  return {
    ...valueForDomain,
    normalizedEmail: parsed.normalizedEmail,
    domain: parsed.domain,
    mailboxVerified: false,
  };
}

export class SurveyEmailValidationError extends Error {
  readonly retryable: boolean;
  readonly result: SurveyEmailValidationResult;

  constructor(result: SurveyEmailValidationResult) {
    super(`Email validation failed: ${result.reason}`);
    this.name = "SurveyEmailValidationError";
    this.retryable = result.status === "unknown";
    this.result = result;
  }
}

export async function assertSurveyEmailCanReceiveMail(
  email: string,
): Promise<SurveyEmailValidationResult> {
  const result = await validateSurveyEmailAddress(email);
  if (result.status !== "valid") throw new SurveyEmailValidationError(result);
  return result;
}
