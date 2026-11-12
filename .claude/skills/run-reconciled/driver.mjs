// Drives the running app in headless Chrome: logs in as the demo user, opens
// each page given, takes a full-page screenshot and reports console errors and
// sideways scrolling. See SKILL.md next to this file.
//
//   node .claude/skills/run-reconciled/driver.mjs [--phone] [--out DIR] /forecast /budgets ...
//
// Needs playwright-core installed under $PW_PREFIX (default /tmp/reconciled-pw)
// and Chrome at $CHROME (default /usr/bin/google-chrome-stable).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const prefix = process.env.PW_PREFIX ?? "/tmp/reconciled-pw";
const { chromium } = createRequire(`${prefix}/`)("playwright-core");

const args = process.argv.slice(2);
const phone = args.includes("--phone");
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : "/tmp/reconciled-shots";
const paths = args.filter((a, i) => a.startsWith("/") && !(outAt >= 0 && i === outAt + 1));
const base = process.env.APP_URL ?? "http://localhost:5173";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome-stable",
  args: ["--no-sandbox"],
});
const viewport = phone ? { width: 390, height: 844 } : { width: 1366, height: 900 };
const page = await (await browser.newContext({ viewport, locale: "en-GB" })).newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !m.text().includes("401") && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/login`);
await page.getByLabel("Username").fill(process.env.APP_USER ?? "demo");
await page.getByLabel("Password").fill(process.env.APP_PASSWORD ?? "demo-pass-123");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"));

for (const path of paths.length ? paths : ["/"]) {
  await page.goto(`${base}${path}`);
  await page.waitForLoadState("networkidle");
  const name = `${phone ? "phone" : "desktop"}${path.replace(/[^a-z0-9]+/gi, "-").replace(/-$/, "") || "-overview"}.png`;
  await page.screenshot({ path: `${out}/${name}`, fullPage: true });
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(`${path} -> ${out}/${name}${sideways ? "  (scrolls sideways!)" : ""}`);
}
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
