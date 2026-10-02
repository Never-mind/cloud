import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 票面 HTML → PDF。
 *
 * 用无头 Chrome/Edge 打印（本地 Windows 上通常自带 Edge），比自绘 PDF 的版式还原度高得多：
 * 票面本身就是一张固定宽度的表格，交给浏览器打印最稳。
 *
 * 浏览器路径优先读环境变量 `INVOICE_PDF_BROWSER`，否则在常见路径里找一个；
 * 找不到就返回 null，调用方保留 HTML 版本（功能不中断）。
 */
const BROWSER_CANDIDATES = [
  process.env.INVOICE_PDF_BROWSER,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "/snap/bin/chromium",
].filter((value): value is string => Boolean(value));

let cachedBrowser: string | null | undefined;

export function resolvePdfBrowser() {
  if (cachedBrowser !== undefined) return cachedBrowser;
  cachedBrowser = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
  return cachedBrowser;
}

/** A4 去掉四周 10mm 页边距后的可用尺寸（pt） */
const MM_TO_PT = 2.834645669;
const A4_CONTENT_WIDTH_PT = (210 - 20) * MM_TO_PT;
const A4_CONTENT_HEIGHT_PT = (297 - 20) * MM_TO_PT;

/**
 * 用 `zoom` 而不是 `transform: scale`：transform 只改变视觉、不改变布局盒，
 * 分页仍按原始高度算，结果会多出一页；zoom 会连同布局一起缩放，分页才准。
 */
const PRINT_STYLE = (scale: number) => `<style>
@page { size: A4; margin: 10mm; }
@media print { body { zoom: ${scale.toFixed(4)}; } }
</style>`;

/** 票面表格的宽高（pt）：模板里每行都写了高度，累加即可估算整票高度。 */
function tableSizePt(html: string) {
  const table = /<table[\s\S]*?<\/table>/i.exec(html)?.[0] ?? "";
  const widthPt = Number(/width:([\d.]+)pt/i.exec(table)?.[1] ?? 0);
  let heightPt = 0;
  for (const rowTag of table.match(/<tr\b[^>]*>/gi) ?? []) {
    const fromStyle = Number(/height:([\d.]+)pt/i.exec(rowTag)?.[1] ?? 0);
    const fromAttr = Number(/height="(\d+)"/i.exec(rowTag)?.[1] ?? 0);
    heightPt += fromStyle > 0 ? fromStyle : fromAttr > 0 ? fromAttr * 0.75 : 15;
  }
  return { widthPt, heightPt };
}

function runBrowser(browser: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(browser, args, { timeout: 60_000, windowsHide: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function renderInvoicePdf(html: string): Promise<Buffer | null> {
  const browser = resolvePdfBrowser();
  if (!browser) return null;
  const { widthPt, heightPt } = tableSizePt(html);
  // 宽或高超出 A4 可用区域就按比例缩小，保证"一页放下"（与 Excel/WPS 的缩放打印一致）
  const fitWidth = widthPt > 0 ? A4_CONTENT_WIDTH_PT / widthPt : 1;
  const fitHeight = heightPt > 0 ? A4_CONTENT_HEIGHT_PT / heightPt : 1;
  const scale = Math.min(1, Math.max(0.35, Math.min(fitWidth, fitHeight)));
  const document = html.includes("</head>")
    ? html.replace("</head>", `${PRINT_STYLE(scale)}</head>`)
    : `${PRINT_STYLE(scale)}${html}`;

  const dir = mkdtempSync(join(tmpdir(), "invoice-pdf-"));
  const htmlPath = join(dir, "invoice.html");
  const pdfPath = join(dir, "invoice.pdf");
  try {
    writeFileSync(htmlPath, document, "utf8");
    await runBrowser(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--no-pdf-header-footer",
      "--print-to-pdf-no-header",
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ]);
    if (!existsSync(pdfPath)) return null;
    const bytes = readFileSync(pdfPath);
    return bytes.length ? bytes : null;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function pdfBrowserAvailable() {
  return resolvePdfBrowser() !== null;
}
