import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const jobs = [
  {
    html: path.join(root, "docs/appointment-review-all-questions.html"),
    pdf: path.join(root, "docs/appointment-review-all-questions.pdf"),
  },
  {
    html: path.join(root, "docs/appointment-review-changed-questions.html"),
    pdf: path.join(root, "docs/appointment-review-changed-questions.pdf"),
  },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const { html, pdf } of jobs) {
  await page.goto(`file://${html}`, { waitUntil: "networkidle" });
  await page.pdf({
    path: pdf,
    format: "Letter",
    printBackground: true,
    margin: { top: "0.5in", right: "0.6in", bottom: "0.5in", left: "0.6in" },
  });
  console.log(`PDF written to ${pdf}`);
}

await browser.close();
