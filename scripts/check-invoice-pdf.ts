import { accessSync, constants } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { renderInvoicePdf, resolvePdfBrowser } from "../src/lib/invoice-pdf";

// Match `next start` environment precedence, including .env.production.local.
// Only exercise the renderer: no database, OBS, invoice records or sync jobs.
loadEnvConfig(process.cwd(), false);

async function main() {
  const browser = resolvePdfBrowser();
  if (!browser) {
    throw new Error("未找到 PDF 浏览器。请在应用所在服务器/容器内安装 Chrome/Edge/Chromium，并将 INVOICE_PDF_BROWSER 设置为可执行文件的绝对路径。");
  }
  accessSync(browser, constants.X_OK);
  console.log(`[invoice-pdf-check] browser=${browser}`);
  const pdf = await renderInvoicePdf(`<!doctype html><html><head><meta charset="utf-8"><title>PDF check</title></head><body>
    <h1>Invoice PDF check / 发票 PDF 自检</h1>
    <table style="width:450pt;border-collapse:collapse"><tr style="height:30pt"><td>Service fee / 服务费</td><td>USD 1.00</td></tr></table>
    </body></html>`);
  console.log(JSON.stringify({ status: "ok", browser, bytes: pdf.length, signature: pdf.subarray(0, 5).toString("ascii") }));
  console.log("PDF 实际转换通过；未创建业务发票。请在服务运行用户及同一容器内执行，再从正式网站验证下载。");
}

main().catch((error: unknown) => {
  console.error(`[invoice-pdf-check] ${error instanceof Error ? error.message : "检查失败"}`);
  console.error("若命令行通过但网站仍报错，请核对 PM2/容器的用户、工作目录和 INVOICE_PDF_BROWSER，并重启对应应用进程。");
  process.exitCode = 1;
});
