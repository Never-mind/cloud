import { randomUUID } from "node:crypto";
import { executeRaw, queryRowsRaw } from "./db";
import { createPasswordSalt, hashPassword, type AuthUser } from "./auth";
import { entityConfigs } from "./modules";
import { getPermissionDefinitions, type PermissionDefinition } from "./permission-definitions";

export type UserPermission = {
  moduleKey: string;
  title?: string;
  level?: 1 | 2 | 3;
  parentKey?: string;
  kind?: PermissionDefinition["kind"];
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExport: boolean;
  canImport: boolean;
  canConfirm: boolean;
};

export type ManagedUser = Pick<AuthUser, "userId" | "displayName" | "email" | "role" | "status"> & {
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: UserPermission[];
};

type UserRow = ManagedUser & {
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const permissionDefinitions = getPermissionDefinitions([
  ...entityConfigs,
  { key: "documents", title: "文档库", navGroup: "文档管理" },
  { key: "data-imports", title: "数据导入中心", navGroup: "数据工具" },
  { key: "system-users", title: "账户管理", navGroup: "用户管理", adminOnly: true },
  { key: "system-module-features", title: "功能模块管理", navGroup: "数据工具", adminOnly: true },
]);

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeStatus(value: unknown) {
  return value === "disabled" ? "disabled" : "active";
}

async function assertAdmin(email: string) {
  const rows = await queryRowsRaw<{ role: string }>(
    "SELECT role FROM common_users WHERE email = :email AND status = 'active' LIMIT 1",
    { email: normalizeEmail(email) },
  );
  if (rows[0]?.role !== "admin") throw new Error("只有管理员可以管理用户");
}

async function loadPermissions(userId: string) {
  const rows = await queryRowsRaw<{
    moduleKey: string;
    canView: number;
    canCreate: number;
    canUpdate: number;
    canDelete: number;
    canExport: number;
    canImport: number;
    canConfirm: number;
  }>(
    `SELECT moduleKey, canView, canCreate, canUpdate, canDelete, canExport, canImport, canConfirm
     FROM common_user_permissions WHERE userId = :userId ORDER BY moduleKey`,
    { userId },
  );
  const storedByKey = new Map(rows.map((row) => [row.moduleKey, row]));
  return permissionDefinitions.map((definition) => {
    const row = storedByKey.get(definition.moduleKey);
    return {
      ...definition,
      canView: Boolean(row?.canView),
      canCreate: Boolean(row?.canCreate),
      canUpdate: Boolean(row?.canUpdate),
      canDelete: Boolean(row?.canDelete),
      canExport: Boolean(row?.canExport),
      canImport: Boolean(row?.canImport),
      canConfirm: Boolean(row?.canConfirm),
    };
  });
}

export async function listManagedUsers(email: string) {
  await assertAdmin(email);
  const users = await queryRowsRaw<UserRow>(
    `SELECT userId, displayName, email, role, status, lastLoginAt, createdAt, updatedAt
     FROM common_users ORDER BY createdAt ASC, email ASC`,
  );
  return Promise.all(users.map(async (user) => ({ ...user, permissions: await loadPermissions(user.userId) })));
}

export async function createManagedUser(adminEmail: string, input: Record<string, unknown>) {
  await assertAdmin(adminEmail);
  const email = normalizeEmail(input.email);
  const displayName = String(input.displayName ?? "").trim();
  const password = String(input.password ?? "");
  if (!email || !email.includes("@")) throw new Error("请输入有效的账号");
  if (!displayName) throw new Error("请输入用户名称");
  if (password.length < 6) throw new Error("密码长度不能少于6位");

  const userId = randomUUID();
  const salt = createPasswordSalt();
  await executeRaw(
    `INSERT INTO common_users
      (userId, displayName, email, passwordHash, passwordSalt, role, status)
     VALUES (:userId, :displayName, :email, :passwordHash, :passwordSalt, :role, :status)`,
    {
      userId,
      displayName,
      email,
      passwordHash: hashPassword(password, salt),
      passwordSalt: salt,
      role: input.role === "admin" ? "admin" : "user",
      status: normalizeStatus(input.status),
    },
  );
  return { userId };
}

export async function updateManagedUser(adminEmail: string, userId: string, input: Record<string, unknown>) {
  await assertAdmin(adminEmail);
  const target = (await queryRowsRaw<{ email: string; role: string }>(
    "SELECT email, role FROM common_users WHERE userId = :userId LIMIT 1",
    { userId },
  ))[0];
  if (target && normalizeEmail(target.email) === normalizeEmail(adminEmail)) {
    if (input.status !== undefined && normalizeStatus(input.status) === "disabled") throw new Error("不能停用当前管理员账号");
    if (input.role !== undefined && input.role !== "admin") throw new Error("不能降低当前管理员账号的角色");
  }
  const fields: string[] = [];
  const params: Record<string, unknown> = { userId };
  if (input.displayName !== undefined) {
    fields.push("displayName = :displayName");
    params.displayName = String(input.displayName).trim();
  }
  if (input.status !== undefined) {
    if (userId === "admin" && normalizeStatus(input.status) === "disabled") throw new Error("不能停用初始管理员");
    fields.push("status = :status");
    params.status = normalizeStatus(input.status);
  }
  if (input.role !== undefined) {
    fields.push("role = :role");
    params.role = input.role === "admin" ? "admin" : "user";
  }
  const password = String(input.password ?? "");
  if (password) {
    if (password.length < 6) throw new Error("密码长度不能少于6位");
    const salt = createPasswordSalt();
    fields.push("passwordHash = :passwordHash", "passwordSalt = :passwordSalt");
    params.passwordHash = hashPassword(password, salt);
    params.passwordSalt = salt;
  }
  if (!fields.length) return;
  await executeRaw(`UPDATE common_users SET ${fields.join(", ")} WHERE userId = :userId`, params);
}

export async function updateUserPermissions(adminEmail: string, userId: string, permissions: unknown) {
  await assertAdmin(adminEmail);
  if (!Array.isArray(permissions)) throw new Error("权限数据格式错误");
  const validKeys = new Set(permissionDefinitions.map((definition) => definition.moduleKey));
  const updatedByUserId = (await queryRowsRaw<{ userId: string }>(
    "SELECT userId FROM common_users WHERE email = :email LIMIT 1",
    { email: normalizeEmail(adminEmail) },
  ))[0]?.userId ?? null;
  for (const item of permissions) {
    if (!item || typeof item !== "object") continue;
    const permission = item as Record<string, unknown>;
    const moduleKey = String(permission.moduleKey ?? "").trim();
    if (!moduleKey || !validKeys.has(moduleKey)) continue;
    await executeRaw(
      `INSERT INTO common_user_permissions
        (userId, moduleKey, canView, canCreate, canUpdate, canDelete, canExport, canImport, canConfirm, updatedByUserId)
       VALUES (:userId, :moduleKey, :canView, :canCreate, :canUpdate, :canDelete, :canExport, :canImport, :canConfirm, :updatedByUserId)
       ON DUPLICATE KEY UPDATE
        canView = VALUES(canView), canCreate = VALUES(canCreate), canUpdate = VALUES(canUpdate),
        canDelete = VALUES(canDelete), canExport = VALUES(canExport), canImport = VALUES(canImport),
        canConfirm = VALUES(canConfirm), updatedByUserId = VALUES(updatedByUserId)`,
      {
        userId,
        moduleKey,
        canView: permission.canView === true ? 1 : 0,
        canCreate: permission.canCreate === true ? 1 : 0,
        canUpdate: permission.canUpdate === true ? 1 : 0,
        canDelete: permission.canDelete === true ? 1 : 0,
        canExport: permission.canExport === true ? 1 : 0,
        canImport: permission.canImport === true ? 1 : 0,
        canConfirm: permission.canConfirm === true ? 1 : 0,
        updatedByUserId,
      },
    );
  }
}
