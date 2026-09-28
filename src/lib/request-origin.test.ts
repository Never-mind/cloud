import { describe, expect, it } from "vitest";
import { resolveRequestOrigin, safeInternalPath } from "./request-origin";

function makeRequest(url: string, headers: Record<string, string> = {}) {
  return { nextUrl: new URL(url), headers: new Headers(headers) };
}

describe("按真实请求头解析站点地址", () => {
  it("Host 是 127.0.0.1 时不会被 Next 归一成的 localhost 覆盖", () => {
    // 复现线上问题：nextUrl 给出 localhost，但浏览器访问的是 127.0.0.1
    const origin = resolveRequestOrigin(makeRequest("http://localhost:5174/api/auth/feishu/callback", { host: "127.0.0.1:5174" }));
    expect(origin).toBe("http://127.0.0.1:5174");
  });

  it("优先使用反向代理转发的协议与主机", () => {
    const origin = resolveRequestOrigin(
      makeRequest("http://127.0.0.1:3000/api/auth/feishu/callback", {
        host: "127.0.0.1:3000",
        "x-forwarded-host": "cloud-purchase.wanzhongtech.com",
        "x-forwarded-proto": "https",
      }),
    );
    expect(origin).toBe("https://cloud-purchase.wanzhongtech.com");
  });

  it("多个转发值取第一个（代理链场景）", () => {
    const origin = resolveRequestOrigin(
      makeRequest("http://127.0.0.1:3000/x", { "x-forwarded-host": "a.example.com, b.example.com", "x-forwarded-proto": "https, http" }),
    );
    expect(origin).toBe("https://a.example.com");
  });
});

describe("跳转路径白名单", () => {
  it("只放行站内相对路径", () => {
    expect(safeInternalPath("/finance/prepayment-contracts")).toBe("/finance/prepayment-contracts");
    expect(safeInternalPath("//evil.example.com")).toBe("/");
    expect(safeInternalPath("https://evil.example.com")).toBe("/");
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath("", "/login")).toBe("/login");
  });
});
