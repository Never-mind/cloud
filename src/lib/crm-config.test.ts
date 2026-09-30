import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CRM_BUSINESS_LINE_ID,
  resolveCrmBusinessLineId,
  resolveCrmEndpoint,
  resolveCrmSyncMonths,
  resolveCrmTimeoutMs,
} from "./crm-config";

const ENV_KEYS = ["CRM_API_BASE_URL", "CRM_API_TOKEN", "CRM_BUSINESS_LINE_ID", "CRM_SYNC_MONTHS", "CRM_TIMEOUT_MS"] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("resolveCrmEndpoint", () => {
  it("未配置密钥时给出可读的报错", () => {
    expect(() => resolveCrmEndpoint("发票")).toThrow(/CRM_API_TOKEN/);
  });

  it("未配置地址时回退到默认域名，并去掉结尾斜杠", () => {
    process.env.CRM_API_TOKEN = "t0ken";
    expect(resolveCrmEndpoint().baseUrl).toBe("http://crm-api.wanzhongtech.com");
    process.env.CRM_API_BASE_URL = "http://127.0.0.1:9000///";
    expect(resolveCrmEndpoint().baseUrl).toBe("http://127.0.0.1:9000");
  });

  it("空白密钥按未配置处理", () => {
    process.env.CRM_API_TOKEN = "   ";
    expect(() => resolveCrmEndpoint()).toThrow();
  });
});

describe("resolveCrmBusinessLineId", () => {
  it("默认业务线 2（Cloud）", () => {
    expect(resolveCrmBusinessLineId()).toBe(DEFAULT_CRM_BUSINESS_LINE_ID);
  });

  it("非法值回退默认，合法值取整", () => {
    process.env.CRM_BUSINESS_LINE_ID = "abc";
    expect(resolveCrmBusinessLineId()).toBe(DEFAULT_CRM_BUSINESS_LINE_ID);
    process.env.CRM_BUSINESS_LINE_ID = "0";
    expect(resolveCrmBusinessLineId()).toBe(DEFAULT_CRM_BUSINESS_LINE_ID);
    process.env.CRM_BUSINESS_LINE_ID = "3";
    expect(resolveCrmBusinessLineId()).toBe(3);
  });
});

describe("resolveCrmSyncMonths", () => {
  it("默认 3 个月，并夹在 [1, 24]", () => {
    expect(resolveCrmSyncMonths()).toBe(3);
    process.env.CRM_SYNC_MONTHS = "0";
    expect(resolveCrmSyncMonths()).toBe(1);
    process.env.CRM_SYNC_MONTHS = "99";
    expect(resolveCrmSyncMonths()).toBe(24);
    process.env.CRM_SYNC_MONTHS = "6";
    expect(resolveCrmSyncMonths()).toBe(6);
  });
});

describe("resolveCrmTimeoutMs", () => {
  it("默认 30 秒，并夹在 [1000, 120000]", () => {
    expect(resolveCrmTimeoutMs()).toBe(30_000);
    process.env.CRM_TIMEOUT_MS = "10";
    expect(resolveCrmTimeoutMs()).toBe(1_000);
    process.env.CRM_TIMEOUT_MS = "999999";
    expect(resolveCrmTimeoutMs()).toBe(120_000);
  });
});
