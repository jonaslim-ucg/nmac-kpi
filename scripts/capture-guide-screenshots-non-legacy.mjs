/**
 * Capture dark-mode screenshots for the editor PDF guide.
 * Run: node scripts/capture-guide-screenshots-non-legacy.mjs
 * Requires dev server on :3000 and .env with Supabase + AUTH_SECRET.
 */
import { chromium } from "playwright";
import { SignJWT } from "jose";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "docs/guide-screenshots-non-legacy");
const BASE = process.env.GUIDE_BASE_URL ?? "http://localhost:3000";

function loadEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

async function fetchGuideUser(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars required in .env");

  for (const role of ["editor", "admin"]) {
    const res = await fetch(
      `${url}/rest/v1/app_users?select=id,email,role&role=eq.${role}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" } },
    );
    if (!res.ok) continue;
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  throw new Error("No editor or admin user in app_users for screenshots");
}

async function signEditorToken(env, user) {
  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET missing or too short in .env");

  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

async function setHideLegacyNav(env, hide) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/app_settings?id=eq.default`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ hide_legacy_nav: hide, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn("Could not patch app_settings (using localStorage only):", res.status, text);
  } else {
    console.log("app_settings.hide_legacy_nav =", hide);
  }
}

async function waitForServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 307 || r.status === 302) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not ready at ${url}`);
}

async function main() {
  const env = loadEnv();
  mkdirSync(OUT, { recursive: true });
  await waitForServer(BASE);

  const prevHide = await (async () => {
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await fetch(`${url}/rest/v1/app_settings?select=hide_legacy_nav&id=eq.default`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return Boolean(rows?.[0]?.hide_legacy_nav);
  })().catch(() => false);

  await setHideLegacyNav(env, true);

  const guideUser = await fetchGuideUser(env);
  console.log("Using app user:", guideUser.email, `(${guideUser.role})`);
  const token = await signEditorToken(env, guideUser);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  await context.addInitScript(() => {
    window.localStorage.setItem("nmac-kpi-theme", "dark");
    window.localStorage.setItem("kpi_hide_legacy_nav", "1");
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  });
  await context.addCookies([
    {
      name: "nmac_session",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();

  async function shot(name, path, setup) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.locator('[role="tab"], main').first().waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    if (setup) await setup(page);
    await page.waitForTimeout(2000);
    const file = join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log("wrote", file);
  }

  await shot("01-performance-overview", "/nmac-2026");
  await shot("02-nmac-master-targets", "/admin/nmac-master");
  await shot("03-nmac-master-monthly", "/admin/nmac-master", async (p) => {
    await p.locator('[role="tab"]').filter({ hasText: "Monthly actuals" }).click();
    await p.waitForTimeout(800);
    await p.getByRole("button", { name: /save month/i }).scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(400);
  });
  await shot("04-settings", "/settings");

  await browser.close();
  await setHideLegacyNav(env, prevHide);
  console.log("Done. Screenshots in docs/guide-screenshots-non-legacy/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
