import { afterEach, describe, expect, it } from "vitest";
import { resolveFrappeEndpoint, resolvePageSize, resolveTimeoutMs } from "./frappe-config";

/** 与 frappe-config 里声明的变量名保持一致，测试负责守住这条回退链。 */
const BASE_URL_KEYS = ["FRAPPE_API_BASE_URL", "MATERIAL_API_BASE_URL", "FRAPPE_DEMAND_API_BASE_URL"];
const TOKEN_KEYS = ["FRAPPE_API_TOKEN", "MATERIAL_API_TOKEN", "FRAPPE_DEMAND_API_TOKEN"];
const MANAGED_KEYS = [...BASE_URL_KEYS, ...TOKEN_KEYS];

const saved = new Map<string, string | undefined>();
for (const key of MANAGED_KEYS) saved.set(key, process.env[key]);

function setEnv(values: Partial<Record<string, string>>) {
  for (const key of MANAGED_KEYS) delete process.env[key];
  Object.assign(process.env, values);
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("远端 Frappe 配置解析", () => {
  it("优先使用新变量名", () => {
    setEnv({
      FRAPPE_API_BASE_URL: "http://new.local:1337",
      MATERIAL_API_BASE_URL: "http://legacy.local:1337",
      FRAPPE_API_TOKEN: "new:token",
      MATERIAL_API_TOKEN: "legacy:token",
    });
    expect(resolveFrappeEndpoint("需求数据")).toEqual({ baseUrl: "http://new.local:1337", token: "new:token" });
  });

  it("未配置新变量名时回退到历史变量名，保证已上线服务器不用改名", () => {
    setEnv({ MATERIAL_API_BASE_URL: "http://legacy.local:1337/", MATERIAL_API_TOKEN: "legacy:token" });
    expect(resolveFrappeEndpoint("需求数据")).toEqual({ baseUrl: "http://legacy.local:1337", token: "legacy:token" });
  });

  it("两个同步服务解析到同一个地址，不存在各配一套的情况", () => {
    setEnv({ FRAPPE_API_BASE_URL: "http://same.local:1337", FRAPPE_API_TOKEN: "shared:token" });
    const material = resolveFrappeEndpoint("Material 数据");
    const demand = resolveFrappeEndpoint("需求数据");
    expect(material.baseUrl).toBe(demand.baseUrl);
    expect(material.token).toBe(demand.token);
  });

  it("空白值按未配置处理，回退到代码内默认地址", () => {
    setEnv({ FRAPPE_API_BASE_URL: "   ", FRAPPE_API_TOKEN: "shared:token" });
    expect(resolveFrappeEndpoint("需求数据").baseUrl).toBe("http://192.168.3.153:1337");
  });

  it("没有密钥时报错，并把变量名写进提示", () => {
    setEnv({});
    expect(() => resolveFrappeEndpoint("需求数据")).toThrow(/FRAPPE_API_TOKEN/);
  });

  it("分页大小非法值回退默认值，并夹在 [1, max] 内", () => {
    expect(resolvePageSize(undefined, 200, 500)).toBe(200);
    expect(resolvePageSize("", 200, 500)).toBe(200);
    expect(resolvePageSize("abc", 200, 500)).toBe(200);
    expect(resolvePageSize("0", 200, 500)).toBe(1);
    expect(resolvePageSize("9999", 200, 500)).toBe(500);
    expect(resolvePageSize("250.7", 200, 500)).toBe(250);
  });

  it("超时非法值回退默认值，并夹在 [1000, 120000] 内", () => {
    expect(resolveTimeoutMs(undefined)).toBe(30_000);
    expect(resolveTimeoutMs(" ")).toBe(30_000);
    expect(resolveTimeoutMs("abc")).toBe(30_000);
    expect(resolveTimeoutMs("10")).toBe(1_000);
    expect(resolveTimeoutMs("999999")).toBe(120_000);
  });
});
