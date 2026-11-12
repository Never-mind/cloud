import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn() }));
vi.mock("./auth", () => ({ getAuthenticatedUser: mocks.user }));
vi.mock("./permission-service", () => ({ getPermissionStateForEmail: mocks.permissions }));
import { requireProspectAccess } from "./prospect-access";
import { permissionMask } from "./permission-definitions";

const request = {} as NextRequest;
describe("潜在客户操作权限", () => {
  beforeEach(() => {
    mocks.user.mockReset(); mocks.permissions.mockReset();
    mocks.user.mockResolvedValue({ email: "tester@example.com", status: "active" });
    mocks.permissions.mockResolvedValue({ role: "user", grants: {} });
  });
  it("未登录及停用账户不能操作", async () => {
    for (const user of [null, { email: "tester@example.com", status: "disabled" }]) {
      mocks.user.mockResolvedValue(user);
      await expect(requireProspectAccess(request, "view")).rejects.toMatchObject({ status: 401 });
    }
    expect(mocks.permissions).not.toHaveBeenCalled();
  });
  it("仅查看不能转化", async () => {
    mocks.permissions.mockResolvedValue({ role: "user", grants: { prospects: permissionMask({ canView: true }) } });
    await expect(requireProspectAccess(request, "confirm", "view")).rejects.toMatchObject({ status: 403 });
  });
  it("关联已有客户无需客户新增权限，但新建需要", async () => {
    mocks.permissions.mockResolvedValue({ role: "user", grants: {
      prospects: permissionMask({ canView: true, canConfirm: true }), customers: permissionMask({ canView: true }),
    } });
    const access = await requireProspectAccess(request, "confirm", "view");
    expect(access.capabilities).toMatchObject({ convert: true, viewCustomer: true, createCustomer: false });
    await expect(requireProspectAccess(request, "confirm", "create")).rejects.toMatchObject({ status: 403 });
  });
  it("没有客户查看权限时不能通过创建查重读取客户资料", async () => {
    mocks.permissions.mockResolvedValue({ role: "user", grants: {
      prospects: permissionMask({ canView: true, canConfirm: true }), customers: permissionMask({ canCreate: true }),
    } });
    await expect(requireProspectAccess(request, "confirm", "create")).rejects.toMatchObject({ status: 403 });
    expect((await requireProspectAccess(request, "view")).capabilities.createCustomer).toBe(false);
  });
});
