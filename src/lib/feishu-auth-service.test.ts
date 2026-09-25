import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsRaw, executeRaw } = vi.hoisted(() => ({
  queryRowsRaw: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock("./db", () => ({ queryRowsRaw, executeRaw }));

import { createFeishuState, readNextFromState, resolveFeishuLoginUser, verifyFeishuState } from "./feishu-auth-service";

const profile = {
  openId: "ou_test_open_id",
  unionId: "on_test_union_id",
  name: "张三",
  email: "zhangsan@luzcorp.com",
  tenantKey: "tenant_test",
  avatarUrl: "",
  userId: "",
  employeeNo: "",
};

describe("飞书登录 state", () => {
  it("自己签发的 state 能通过校验，并能读出登录后跳转地址", () => {
    const state = `${createFeishuState()}.${Buffer.from("/finance/prepayment-contracts", "utf8").toString("base64url")}`;
    expect(verifyFeishuState(state)).toBe(true);
    expect(readNextFromState(state)).toBe("/finance/prepayment-contracts");
  });

  it("被篡改或格式不对的 state 一律拒绝", () => {
    const state = createFeishuState();
    expect(verifyFeishuState(`${state}x`)).toBe(false);
    expect(verifyFeishuState("bad")).toBe(false);
    expect(verifyFeishuState("a.b.c")).toBe(false);
  });

  it("过期的 state 不通过", () => {
    const state = createFeishuState();
    const elevenMinutesLater = Date.now() + 11 * 60 * 1000;
    vi.useFakeTimers();
    vi.setSystemTime(elevenMinutesLater);
    expect(verifyFeishuState(state)).toBe(false);
    vi.useRealTimers();
  });

  it("跳转地址只接受站内路径，避免开放重定向", () => {
    const evil = `${createFeishuState()}.${Buffer.from("//evil.example.com", "utf8").toString("base64url")}`;
    const absolute = `${createFeishuState()}.${Buffer.from("https://evil.example.com", "utf8").toString("base64url")}`;
    expect(readNextFromState(evil)).toBe("/");
    expect(readNextFromState(absolute)).toBe("/");
  });
});

describe("飞书账号落地到本地账号", () => {
  beforeEach(() => {
    queryRowsRaw.mockReset();
    executeRaw.mockReset();
    delete process.env.FEISHU_AUTO_PROVISION;
    delete process.env.FEISHU_AUTO_PROVISION_PERMISSIONS;
    delete process.env.FEISHU_TENANT_KEY;
  });

  it("已绑定且启用的账号直接放行", async () => {
    queryRowsRaw.mockResolvedValueOnce([
      { userId: "u1", email: "zhangsan@luzcorp.com", displayName: "张三", role: "user", status: "active", loginType: "feishu", feishuOpenId: profile.openId, feishuUnionId: profile.unionId },
    ]);

    const result = await resolveFeishuLoginUser(profile);

    expect(result).toEqual(expect.objectContaining({ ok: true, userId: "u1", email: "zhangsan@luzcorp.com" }));
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("已绑定但停用的账号拒绝登录", async () => {
    queryRowsRaw.mockResolvedValueOnce([
      { userId: "u1", email: "zhangsan@luzcorp.com", displayName: "张三", role: "user", status: "disabled", loginType: "feishu", feishuOpenId: profile.openId, feishuUnionId: "" },
    ]);

    const result = await resolveFeishuLoginUser(profile);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("停用");
  });

  it("按邮箱命中但账号未开通飞书登录时给出明确提示", async () => {
    queryRowsRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { userId: "u2", email: "zhangsan@luzcorp.com", displayName: "张三", role: "user", status: "active", loginType: "local", feishuOpenId: null, feishuUnionId: null },
      ]);

    const result = await resolveFeishuLoginUser(profile);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("未开通飞书登录");
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("按邮箱命中且允许飞书登录时自动补写绑定关系", async () => {
    queryRowsRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { userId: "u2", email: "zhangsan@luzcorp.com", displayName: "张三", role: "user", status: "active", loginType: "both", feishuOpenId: null, feishuUnionId: null },
      ]);

    const result = await resolveFeishuLoginUser(profile);

    expect(result).toEqual(expect.objectContaining({ ok: true, userId: "u2", bound: true }));
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(String(executeRaw.mock.calls[0][0])).toContain("feishuOpenId = :openId");
  });

  it("没建号且未开启自动建号时提示联系管理员", async () => {
    queryRowsRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await resolveFeishuLoginUser(profile);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("尚未在系统里开通");
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("开启自动建号后按普通员工建档", async () => {
    process.env.FEISHU_AUTO_PROVISION = "1";
    queryRowsRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await resolveFeishuLoginUser(profile);

    expect(result).toEqual(expect.objectContaining({ ok: true, email: "zhangsan@luzcorp.com" }));
    const insert = String(executeRaw.mock.calls[0][0]);
    expect(insert).toContain("INSERT INTO merge_common_users");
    expect(insert).toContain("'user', 'active', 'feishu'");
  });

  it("成员没有企业邮箱时也能自动建号（用 open_id 派生内部账号，并默认全功能开启）", async () => {
    process.env.FEISHU_AUTO_PROVISION = "1";
    queryRowsRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await resolveFeishuLoginUser({ ...profile, email: "" });

    expect(result).toEqual(expect.objectContaining({ ok: true, email: "ou_test_open_id@feishu.local" }));
    const insert = String(executeRaw.mock.calls[0][0]);
    expect(insert).toContain("INSERT INTO merge_common_users");
    // 默认全功能：除管理员专属模块外，所有操作位都是 1。
    const permissionCalls = executeRaw.mock.calls.filter((call) => String(call[0]).includes("merge_common_user_permissions"));
    expect(permissionCalls.length).toBeGreaterThan(5);
    expect(
      permissionCalls.every((call) =>
        call[1].canView === 1 && call[1].canCreate === 1 && call[1].canUpdate === 1 && call[1].canDelete === 1
        && call[1].canExport === 1 && call[1].canImport === 1 && call[1].canConfirm === 1),
    ).toBe(true);
    const moduleKeys = permissionCalls.map((call) => String(call[1].moduleKey));
    // 账户管理与功能启用默认全关，必须由管理员单独开启。
    expect(moduleKeys).not.toContain("system-users");
    expect(moduleKeys).not.toContain("system-module-features");
  });

  it("默认权限可配成 readonly（只读，全部写操作为 0）", async () => {
    process.env.FEISHU_AUTO_PROVISION = "1";
    process.env.FEISHU_AUTO_PROVISION_PERMISSIONS = "readonly";
    queryRowsRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await resolveFeishuLoginUser({ ...profile, email: "" });

    expect(result.ok).toBe(true);
    const permissionCalls = executeRaw.mock.calls.filter((call) => String(call[0]).includes("merge_common_user_permissions"));
    expect(permissionCalls.length).toBeGreaterThan(5);
    expect(permissionCalls.every((call) => call[1].canView === 1 && call[1].canCreate === 0 && call[1].canConfirm === 0)).toBe(true);
    delete process.env.FEISHU_AUTO_PROVISION_PERMISSIONS;
  });

  it("默认权限可配成 none（不授任何权限，等管理员分配）", async () => {
    process.env.FEISHU_AUTO_PROVISION = "1";
    process.env.FEISHU_AUTO_PROVISION_PERMISSIONS = "none";
    queryRowsRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await resolveFeishuLoginUser({ ...profile, email: "" });

    expect(result.ok).toBe(true);
    expect(executeRaw.mock.calls.filter((call) => String(call[0]).includes("merge_common_user_permissions"))).toHaveLength(0);
    delete process.env.FEISHU_AUTO_PROVISION_PERMISSIONS;
  });

  it("配置了租户白名单时，非本公司租户直接拒绝", async () => {
    process.env.FEISHU_TENANT_KEY = "tenant_other";
    const result = await resolveFeishuLoginUser(profile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("不属于本公司");
    expect(queryRowsRaw).not.toHaveBeenCalled();
  });
});
