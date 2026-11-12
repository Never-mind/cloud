import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ files: new Map<string, Buffer>(), exists: vi.fn(), mktemp: vi.fn(), remove: vi.fn(), exec: vi.fn() }));
vi.mock("node:fs", () => ({
  existsSync: mocks.exists, mkdtempSync: mocks.mktemp, rmSync: mocks.remove,
  readFileSync: (p: string) => mocks.files.get(p),
  writeFileSync: (p: string, value: string) => mocks.files.set(p, Buffer.from(value)),
}));
vi.mock("node:child_process", () => ({ execFile: mocks.exec }));
import { renderInvoicePdf, resolvePdfBrowser } from "./invoice-pdf";

beforeEach(() => {
  vi.clearAllMocks(); mocks.files.clear();
  vi.stubEnv("INVOICE_PDF_BROWSER", "test-browser");
  mocks.exists.mockImplementation((p: string) => p === "test-browser" || mocks.files.has(p));
  let count = 0;
  mocks.mktemp.mockImplementation((prefix: string) => `${prefix}${++count}`);
  mocks.exec.mockImplementation((_browser: string, args: string[], _options: unknown, cb: (error: Error | null) => void) => {
    const target = args.find(a => a.startsWith("--print-to-pdf="))!.slice("--print-to-pdf=".length);
    mocks.files.set(target, Buffer.from("%PDF-1.7\nfixture")); cb(null);
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("invoice PDF generation", () => {
  it("uses a separate browser profile for every concurrent invoice and hides Windows process windows", async () => {
    const results = await Promise.all([renderInvoicePdf("<html><head></head></html>"), renderInvoicePdf("<html><head></head></html>")]);
    expect(results.every(b => b.subarray(0, 5).toString() === "%PDF-")).toBe(true);
    const profiles = mocks.exec.mock.calls.map(([, args]) => args.find((a: string) => a.startsWith("--user-data-dir=")));
    expect(new Set(profiles).size).toBe(2);
    for (const [,args,options] of mocks.exec.mock.calls) {
      expect(options.windowsHide).toBe(true);
      expect(args).toContain("--headless=new");
    }
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
  it("fails explicitly without a browser and rechecks availability rather than caching null forever", async () => {
    mocks.exists.mockReturnValue(false);
    await expect(renderInvoicePdf("<html></html>")).rejects.toMatchObject({ status: 503, message: expect.stringContaining("INVOICE_PDF_BROWSER") });
    mocks.exists.mockImplementation((p: string) => p === "test-browser");
    expect(resolvePdfBrowser()).toBe("test-browser");
  });
  it.each(["exit-error", "missing-file", "html-file"])("never returns HTML or null after %s", async mode => {
    vi.spyOn(console,"error").mockImplementation(() => {});
    mocks.exec.mockImplementation((_b: string, args: string[], _o: unknown, cb: (error: Error|null) => void) => {
      if (mode === "html-file") mocks.files.set(args.find(a=>a.startsWith("--print-to-pdf="))!.slice(15), Buffer.from("<html>not PDF</html>"));
      cb(mode === "exit-error" ? new Error("failed") : null);
    });
    await expect(renderInvoicePdf("<html></html>")).rejects.toMatchObject({ status:503 });
    expect(mocks.remove).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({ recursive:true,force:true }));
  });
});
