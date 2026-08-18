import { executeRaw, queryRows, queryRowsRaw } from "./db";
import { normalizeSidebarGroupOrder } from "./sidebar-navigation";

const SIDEBAR_ORDER_PREFERENCE_KEY = "sidebarGroupOrder";

let sidebarPreferenceTableReady: Promise<void> | null = null;

async function ensureSidebarPreferenceTable() {
  if (!sidebarPreferenceTableReady) {
    sidebarPreferenceTableReady = executeRaw(
      `
        CREATE TABLE IF NOT EXISTS power_userpreferences (
          userId VARCHAR(80) NOT NULL,
          preferenceKey VARCHAR(80) NOT NULL,
          preferenceValue LONGTEXT NOT NULL,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (userId, preferenceKey),
          KEY idx_UserPreferences_updatedAt (updatedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `,
    )
      .then(() => undefined)
      .catch((error) => {
        sidebarPreferenceTableReady = null;
        throw error;
      });
  }
  await sidebarPreferenceTableReady;
}

type UserRow = {
  userId: string;
};

type PreferenceRow = {
  preferenceValue: string;
};

async function getUserId(email: string) {
  const rows = await queryRows<UserRow>(
    "SELECT userId FROM appusers WHERE email = :email AND status = :status LIMIT 1",
    { email, status: "active" },
  );
  return rows[0]?.userId ?? null;
}

export async function getSidebarOrderPreference(email: string) {
  const userId = await getUserId(email);
  if (!userId) throw new Error("当前登录账号不可用");
  await ensureSidebarPreferenceTable();

  const rows = await queryRowsRaw<PreferenceRow>(
    "SELECT preferenceValue FROM power_userpreferences WHERE userId = :userId AND preferenceKey = :preferenceKey LIMIT 1",
    { userId, preferenceKey: SIDEBAR_ORDER_PREFERENCE_KEY },
  );
  if (!rows[0]?.preferenceValue) return normalizeSidebarGroupOrder(undefined);

  try {
    return normalizeSidebarGroupOrder(JSON.parse(rows[0].preferenceValue));
  } catch {
    return normalizeSidebarGroupOrder(undefined);
  }
}

export async function saveSidebarOrderPreference(email: string, order: unknown) {
  const userId = await getUserId(email);
  if (!userId) throw new Error("当前登录账号不可用");
  await ensureSidebarPreferenceTable();

  const normalized = normalizeSidebarGroupOrder(order);
  await executeRaw(
    `
      INSERT INTO power_userpreferences (userId, preferenceKey, preferenceValue)
      VALUES (:userId, :preferenceKey, :preferenceValue)
      ON DUPLICATE KEY UPDATE preferenceValue = VALUES(preferenceValue)
    `,
    {
      userId,
      preferenceKey: SIDEBAR_ORDER_PREFERENCE_KEY,
      preferenceValue: JSON.stringify(normalized),
    },
  );
  return normalized;
}
