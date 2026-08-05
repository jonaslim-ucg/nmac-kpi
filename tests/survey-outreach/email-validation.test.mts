import assert from "node:assert/strict";
import test from "node:test";

import {
  SurveyEmailValidationError,
  validateSurveyEmailAddress,
  type EmailDomainResolver,
} from "../../lib/survey-outreach/email-validation.ts";

function dnsError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function resolver(
  overrides: Partial<EmailDomainResolver> = {},
): EmailDomainResolver {
  return {
    resolveMx: async () => { throw dnsError("ENODATA"); },
    resolve4: async () => { throw dnsError("ENODATA"); },
    resolve6: async () => { throw dnsError("ENODATA"); },
    ...overrides,
  };
}

test("rejects malformed addresses without a DNS lookup", async () => {
  let lookups = 0;
  const result = await validateSurveyEmailAddress("patient@gmail", {
    resolver: resolver({
      resolveMx: async () => {
        lookups++;
        return [];
      },
    }),
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.normalizedEmail, null);
  assert.equal(lookups, 0);
});

test("accepts a normalized address when the domain publishes MX records", async () => {
  const result = await validateSurveyEmailAddress(" Patient@Example.COM ", {
    resolver: resolver({
      resolveMx: async () => [{ exchange: "mail.example.com", priority: 10 }],
    }),
  });

  assert.equal(result.status, "valid");
  assert.equal(result.normalizedEmail, "patient@example.com");
  assert.equal(result.mailboxVerified, false);
});

test("accepts the SMTP address-record fallback when MX is absent", async () => {
  const result = await validateSurveyEmailAddress("patient@example.com", {
    resolver: resolver({
      resolve4: async () => ["192.0.2.1"],
    }),
  });

  assert.equal(result.status, "valid");
});

test("rejects nonexistent and null-MX domains", async () => {
  const nonexistent = await validateSurveyEmailAddress("patient@missing.example", {
    resolver: resolver({ resolveMx: async () => { throw dnsError("ENOTFOUND"); } }),
  });
  const nullMx = await validateSurveyEmailAddress("patient@example.com", {
    resolver: resolver({ resolveMx: async () => [{ exchange: ".", priority: 0 }] }),
  });

  assert.equal(nonexistent.status, "invalid");
  assert.equal(nonexistent.reason, "Email domain does not exist.");
  assert.equal(nullMx.status, "invalid");
  assert.equal(nullMx.reason, "Email domain does not accept email.");
});

test("defers delivery when DNS validation is temporarily unavailable", async () => {
  const result = await validateSurveyEmailAddress("patient@example.com", {
    resolver: resolver({ resolveMx: async () => { throw dnsError("ETIMEOUT"); } }),
  });
  const error = new SurveyEmailValidationError(result);

  assert.equal(result.status, "unknown");
  assert.equal(error.retryable, true);
});
