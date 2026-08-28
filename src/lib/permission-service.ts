import { queryRowsRaw } from "./db";
import { permissionMask, type PermissionState } from "./permission-definitions";

export async function getPermissionStateForEmail(email: string): Promise<PermissionState> {
  const users = await queryRowsRaw<{ userId: string; role: string }>(
    "SELECT userId, role FROM common_users WHERE email = :email AND status = 'active' LIMIT 1",
    { email: email.trim().toLowerCase() },
  );
  const user = users[0];
  if (!user) return { role: "user", grants: {} };
  if (user.role === "admin") return { role: user.role, grants: {} };
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
       FROM common_user_permissions WHERE userId = :userId`,
    { userId: user.userId },
  );
  return {
    role: user.role,
    grants: Object.fromEntries(rows.map((row) => [row.moduleKey, permissionMask({
      canView: Boolean(row.canView),
      canCreate: Boolean(row.canCreate),
      canUpdate: Boolean(row.canUpdate),
      canDelete: Boolean(row.canDelete),
      canExport: Boolean(row.canExport),
      canImport: Boolean(row.canImport),
      canConfirm: Boolean(row.canConfirm),
    })])),
  };
}
