/**
 * One-off: send survey accident apology to all suppressed recipients.
 * Usage: node scripts/send-survey-apologies.mjs
 * Safe to re-run — skips addresses where apology_sent_at is already set.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env");
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i);
    let val = t.slice(i + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const { sendSurveyApologyEmails, getSurveyApologyStats } = await import(
  "../lib/survey-outreach/send-apologies.ts"
);

const dryRun = process.argv.includes("--dry-run");
console.log(dryRun ? "DRY RUN — no emails will be sent" : "Sending apology emails…");

const before = await getSurveyApologyStats();
console.log(`Pending: ${before.pending}, already sent: ${before.sent}`);

const result = await sendSurveyApologyEmails({ dryRun, delayMs: dryRun ? 0 : 250 });
const after = await getSurveyApologyStats();

console.log(JSON.stringify({ ...result, pending: after.pending, sentTotal: after.sent }, null, 2));

if (result.failed.length) {
  process.exitCode = 1;
}
