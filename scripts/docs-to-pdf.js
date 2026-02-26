const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const { marked } = require("marked");
const { chromium } = require("playwright-core");

function stripFrontMatter(markdown) {
  const raw = String(markdown || "");
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return raw;
  const after = raw.indexOf("\n", end + 4);
  return after === -1 ? "" : raw.slice(after + 1);
}

function findEdgeExecutable() {
  const candidates = [
    process.env.MSEDGE_PATH,
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {
      // ignore
    }
  }
  return "";
}

function readCss(workspaceRoot) {
  const cssPath = path.join(workspaceRoot, "docs", "pdf.css");
  try {
    return fs.readFileSync(cssPath, "utf8");
  } catch (e) {
    return "";
  }
}

function buildHtml({ title, css, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${css || ""}</style>
  </head>
  <body>
    ${bodyHtml}
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function toAbsoluteFromCwd(p) {
  const raw = String(p || "").trim();
  if (!raw) return "";
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

async function main() {
  const [inputMd, outputPdf] = process.argv.slice(2);
  if (!inputMd || !outputPdf) {
    // eslint-disable-next-line no-console
    console.error("Usage: node scripts/docs-to-pdf.js <input.md> <output.pdf>");
    process.exit(2);
  }

  const workspaceRoot = process.cwd();
  const mdPath = toAbsoluteFromCwd(inputMd);
  const pdfPath = toAbsoluteFromCwd(outputPdf);

  const edge = findEdgeExecutable();
  if (!edge) {
    // eslint-disable-next-line no-console
    console.error("Microsoft Edge not found. Set MSEDGE_PATH to msedge.exe.");
    process.exit(2);
  }

  const md = fs.readFileSync(mdPath, "utf8");
  const mdNoFm = stripFrontMatter(md);
  const css = readCss(workspaceRoot);
  const bodyHtml = marked.parse(mdNoFm);
  const html = buildHtml({
    title: path.basename(mdPath).replace(/\.md$/i, ""),
    css,
    bodyHtml,
  });

  ensureDir(pdfPath);
  const tmpHtml = path.join(os.tmpdir(), `portal-docs-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, "utf8");

  const browser = await chromium.launch({
    executablePath: edge,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(tmpHtml).toString(), { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "screen" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: "18mm", right: "16mm", bottom: "18mm", left: "16mm" },
    });
  } finally {
    await browser.close().catch(() => {});
    try { fs.unlinkSync(tmpHtml); } catch (e) { /* ignore */ }
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});

