import { loadEnvConfig } from "@next/env";
import { closeDb, executeRaw, queryRowsRaw } from "../src/lib/db";
import { getModuleFeatureState } from "../src/lib/module-feature-service";

loadEnvConfig(process.cwd());

const MODULE_KEY = "internal-service-fee-spares";

async function main() {
  const apply = process.argv.includes("--apply");
  await getModuleFeatureState();

  const [users] = await queryRowsRaw<{
    totalUsers: number;
    activeUsers: number;
    adminUsers: number;
  }>(`
    SELECT
      COUNT(*) AS totalUsers,
      COALESCE(SUM(status = 'active'), 0) AS activeUsers,
      COALESCE(SUM(role = 'admin'), 0) AS adminUsers
    FROM merge_common_users
  `);
  const [permission] = await queryRowsRaw<{ count: number }>(
    "SELECT COUNT(*) AS count FROM merge_common_user_permissions WHERE moduleKey=:moduleKey",
    { moduleKey: MODULE_KEY },
  );
  const [feature] = await queryRowsRaw<{ enabled: number }>(
    "SELECT enabled FROM merge_common_modules WHERE moduleKey=:moduleKey LIMIT 1",
    { moduleKey: MODULE_KEY },
  );
  const [administrator] = await queryRowsRaw<{ userId: string }>(
    "SELECT userId FROM merge_common_users WHERE role='admin' ORDER BY createdAt LIMIT 1",
  );

  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "PLAN",
    moduleKey: MODULE_KEY,
    totalUsers: Number(users?.totalUsers ?? 0),
    activeUsers: Number(users?.activeUsers ?? 0),
    adminUsers: Number(users?.adminUsers ?? 0),
    usersWithPermission: Number(permission?.count ?? 0),
    featureEnabled: Boolean(feature?.enabled),
    updatedByUserId: administrator?.userId ?? null,
  }, null, 2));

  if (!apply) return;

  await executeRaw(`
    INSERT INTO merge_common_user_permissions
      (userId,moduleKey,canView,canCreate,canUpdate,canDelete,canExport,canImport,canConfirm,updatedByUserId)
    SELECT userId,:moduleKey,1,1,1,1,1,1,1,:updatedByUserId
    FROM merge_common_users
    ON DUPLICATE KEY UPDATE
      canView=1,canCreate=1,canUpdate=1,canDelete=1,canExport=1,canImport=1,canConfirm=1,
      updatedByUserId=VALUES(updatedByUserId)
  `, { moduleKey: MODULE_KEY, updatedByUserId: administrator?.userId ?? null });
  await executeRaw(
    "UPDATE merge_common_modules SET enabled=1,updatedByUserId=:updatedByUserId WHERE moduleKey=:moduleKey",
    { moduleKey: MODULE_KEY, updatedByUserId: administrator?.userId ?? null },
  );

  const [verified] = await queryRowsRaw<{
    grantedUsers: number;
    enabled: number;
    missingUsers: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM merge_common_user_permissions
        WHERE moduleKey=:moduleKey AND canView=1 AND canCreate=1 AND canUpdate=1
          AND canDelete=1 AND canExport=1 AND canImport=1 AND canConfirm=1) AS grantedUsers,
      (SELECT enabled FROM merge_common_modules WHERE moduleKey=:moduleKey LIMIT 1) AS enabled,
      (SELECT COUNT(*) FROM merge_common_users users
        LEFT JOIN merge_common_user_permissions permission
          ON permission.userId=users.userId AND permission.moduleKey=:moduleKey
        WHERE permission.userId IS NULL) AS missingUsers
  `, { moduleKey: MODULE_KEY });
  console.log(JSON.stringify({
    grantedUsers: Number(verified?.grantedUsers ?? 0),
    featureEnabled: Boolean(verified?.enabled),
    missingUsers: Number(verified?.missingUsers ?? 0),
  }, null, 2));
  if (Number(verified?.missingUsers ?? 0) > 0 || !Boolean(verified?.enabled)) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "批量授权失败");
    process.exitCode = 1;
  })
  .finally(closeDb);
