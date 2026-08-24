import { executeRaw, queryRows, queryRowsRaw } from "./db";
import { navGroups, type NavGroup } from "./modules";
import {
  getDefaultModuleFeatureState,
  isModuleDisabledByDefault,
  isModuleFeatureEnabled,
  type ModuleFeatureState,
} from "./module-feature-definitions";

export type ModuleFeatureRecord = {
  key: string;
  title: string;
  groupTitle: string;
  childGroupTitle?: string;
  route: string;
  enabled: boolean;
  defaultEnabled: boolean;
  remark: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
};

type StoredFeature = {
  moduleKey: string;
  enabled: number | boolean;
  remark: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

const FEATURE_CACHE_TTL_MS = 5_000;
let featureStoreReady: Promise<void> | null = null;
let storedFeaturesCache: { rows: StoredFeature[]; expiresAt: number } | null = null;

function flattenNavGroups(groups: NavGroup[]) {
  return groups.flatMap((group) => [
    ...group.items.map((item) => ({ key: item.key, title: item.title, groupTitle: group.title, route: item.route })),
    ...(group.children ?? []).flatMap((child) => child.items.map((item) => ({
      key: item.key,
      title: item.title,
      groupTitle: group.title,
      childGroupTitle: child.title,
      route: item.route,
    }))),
  ]);
}

export function getModuleFeatureDefinitions() {
  const uniqueItems = new Map(flattenNavGroups(navGroups).map((item) => [item.key, item]));
  return [...uniqueItems.values()].map((item) => ({
    ...item,
    defaultEnabled: !isModuleDisabledByDefault(item.key),
  }));
}

async function seedFeatureDefinitions() {
  const definitions = getModuleFeatureDefinitions();
  const params: Record<string, unknown> = {};
  const values = definitions.map((definition, index) => {
    params[`moduleKey${index}`] = definition.key;
    params[`moduleName${index}`] = definition.title;
    params[`parentModuleKey${index}`] = definition.groupTitle;
    params[`enabled${index}`] = definition.defaultEnabled ? 1 : 0;
    params[`sortOrder${index}`] = index;
    params[`remark${index}`] = definition.defaultEnabled ? "默认启用" : "默认停用，可由管理员重新启用";
    return `(:moduleKey${index}, :moduleName${index}, :parentModuleKey${index}, :enabled${index}, :sortOrder${index}, :remark${index})`;
  }).join(", ");

  if (!values) return;
  await executeRaw(`
    INSERT IGNORE INTO power_modulefeatures
      (moduleKey, moduleName, parentModuleKey, enabled, sortOrder, remark)
    VALUES ${values}
  `, params);
}

async function ensureFeatureStore() {
  if (!featureStoreReady) {
    featureStoreReady = (async () => {
      await executeRaw(`
      CREATE TABLE IF NOT EXISTS power_modulefeatures (
        moduleKey VARCHAR(128) NOT NULL,
        moduleName VARCHAR(255) NOT NULL,
        parentModuleKey VARCHAR(128) NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        sortOrder INT NOT NULL DEFAULT 0,
        remark VARCHAR(500) NULL,
        updatedBy VARCHAR(255) NULL,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (moduleKey),
        KEY idx_ModuleFeatures_enabled_sort (enabled, sortOrder)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await seedFeatureDefinitions();
    })().catch((error) => {
      featureStoreReady = null;
      throw error;
    });
  }
  await featureStoreReady;
}

async function loadStoredFeatures() {
  if (storedFeaturesCache && storedFeaturesCache.expiresAt > Date.now()) return storedFeaturesCache.rows;
  await ensureFeatureStore();
  const rows = await queryRowsRaw<StoredFeature>(`
    SELECT moduleKey, enabled, remark, updatedBy, updatedAt
    FROM power_modulefeatures
    ORDER BY sortOrder ASC, moduleKey ASC
  `);
  storedFeaturesCache = { rows, expiresAt: Date.now() + FEATURE_CACHE_TTL_MS };
  return rows;
}

export async function getModuleFeatureState(): Promise<ModuleFeatureState> {
  const state = getDefaultModuleFeatureState();
  for (const row of await loadStoredFeatures()) state[row.moduleKey] = Boolean(row.enabled);
  return state;
}

export async function listModuleFeatures(email?: string) {
  const definitions = getModuleFeatureDefinitions();
  const storedRows = await loadStoredFeatures();
  const storedByKey = new Map(storedRows.map((row) => [row.moduleKey, row]));
  const state = getDefaultModuleFeatureState();
  for (const row of storedRows) state[row.moduleKey] = Boolean(row.enabled);
  const user = email ? (await queryRows<{ role: string }>(
    "SELECT role FROM appusers WHERE email = :email AND status = :status LIMIT 1",
    { email, status: "active" },
  ))[0] : undefined;

  return {
    features: definitions.map((definition) => {
      const stored = storedByKey.get(definition.key);
      return {
        ...definition,
        enabled: isModuleFeatureEnabled(definition.key, state),
        remark: stored?.remark ?? "",
        updatedBy: stored?.updatedBy ?? null,
        updatedAt: stored?.updatedAt ?? null,
      } satisfies ModuleFeatureRecord;
    }),
    state,
    isAdmin: user?.role === "admin",
  };
}

export async function updateModuleFeature(email: string, moduleKey: string, enabled: boolean) {
  const user = (await queryRows<{ role: string }>(
    "SELECT role FROM appusers WHERE email = :email AND status = :status LIMIT 1",
    { email, status: "active" },
  ))[0];
  if (user?.role !== "admin") throw new Error("只有管理员可以修改功能模块开关");

  const definition = getModuleFeatureDefinitions().find((item) => item.key === moduleKey);
  if (!definition) throw new Error("功能模块不存在");

  await ensureFeatureStore();
  await executeRaw(`
    UPDATE power_modulefeatures
    SET enabled = :enabled, updatedBy = :updatedBy
    WHERE moduleKey = :moduleKey
  `, { moduleKey, enabled: enabled ? 1 : 0, updatedBy: email });
  storedFeaturesCache = null;
  return listModuleFeatures(email);
}
