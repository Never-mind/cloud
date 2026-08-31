import { executeRaw, queryRows, queryRowsRaw } from "./db";
import { navGroups, type NavChildGroup, type NavGroup } from "./modules";
import {
  getDefaultModuleFeatureState,
  getModuleFeatureDomainKey,
  isModuleDisabledByDefault,
  isModuleFeatureToggleable,
  isModuleFeatureEnabled,
  type ModuleFeatureDomainKey,
  type ModuleFeatureState,
} from "./module-feature-definitions";

export type ModuleFeatureRecord = {
  key: string;
  title: string;
  groupTitle: string;
  childGroupTitle?: string;
  domainKey: ModuleFeatureDomainKey;
  route: string;
  enabled: boolean;
  defaultEnabled: boolean;
  remark: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
};

type StoredFeature = {
  moduleKey: string;
  domainKey: ModuleFeatureDomainKey;
  enabled: number | boolean;
  remark: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

const FEATURE_CACHE_TTL_MS = 5_000;
let featureStoreReady: Promise<void> | null = null;
let storedFeaturesCache: { rows: StoredFeature[]; expiresAt: number } | null = null;

type FlattenedFeatureDefinition = {
  key: string;
  title: string;
  groupTitle: string;
  childGroupTitle?: string;
  domainKey: ModuleFeatureDomainKey;
  route: string;
};

function flattenNavGroups(groups: NavGroup[], includeNonToggleable = false): FlattenedFeatureDefinition[] {
  return groups.flatMap((group) => {
    const flattenChildren = (children: NavChildGroup[], parentTitle?: string): FlattenedFeatureDefinition[] => children.flatMap((child) => [
      ...child.items
        .filter((item) => includeNonToggleable || item.includeInFeatureToggles !== false)
        .map((item) => ({
          key: item.key,
          title: item.title,
          groupTitle: group.title,
          childGroupTitle: parentTitle ? `${parentTitle} / ${child.title}` : child.title,
          domainKey: getModuleFeatureDomainKey(group.title),
          route: item.route,
        })),
      ...(child.children ? flattenChildren(child.children, parentTitle ? `${parentTitle} / ${child.title}` : child.title) : []),
    ]);
    return [
      ...group.items
        .filter((item) => includeNonToggleable || item.includeInFeatureToggles !== false)
        .map((item) => ({
          key: item.key,
          title: item.title,
          groupTitle: group.title,
          domainKey: getModuleFeatureDomainKey(group.title),
          route: item.route,
        })),
      ...(group.children ? flattenChildren(group.children) : []),
    ];
  });
}

function getAllModuleFeatureDefinitions() {
  const uniqueItems = new Map(flattenNavGroups(navGroups, true).map((item) => [item.key, item]));
  return [...uniqueItems.values()].map((item) => ({
    ...item,
    defaultEnabled: !isModuleDisabledByDefault(item.key),
  }));
}

export function getModuleFeatureDefinitions() {
  return getAllModuleFeatureDefinitions().filter((definition) => isModuleFeatureToggleable(definition.key));
}

async function seedFeatureDefinitions() {
  const definitions = getAllModuleFeatureDefinitions();
  const params: Record<string, unknown> = {};
  const values = definitions.map((definition, index) => {
    params[`moduleKey${index}`] = definition.key;
    params[`moduleName${index}`] = definition.title;
    params[`parentModuleKey${index}`] = definition.groupTitle;
    params[`domainKey${index}`] = definition.domainKey;
    params[`route${index}`] = definition.route;
    params[`enabled${index}`] = definition.defaultEnabled ? 1 : 0;
    params[`sortOrder${index}`] = index;
    params[`remark${index}`] = definition.defaultEnabled ? "默认启用" : "默认停用，可由管理员重新启用";
    return `(:moduleKey${index}, :moduleName${index}, :parentModuleKey${index}, :domainKey${index}, :route${index}, :enabled${index}, :sortOrder${index}, :remark${index}, 0)`;
  }).join(", ");

  if (!values) return;
  await executeRaw(`
    INSERT IGNORE INTO merge_common_modules
      (moduleKey, moduleName, parentModuleKey, domainKey, route, enabled, sortOrder, remark, adminOnly)
    VALUES ${values}
  `, params);

  // Repair metadata from older seeds without changing an administrator's switch choices.
  for (const [index, definition] of definitions.entries()) {
    await executeRaw(`
      UPDATE merge_common_modules
      SET moduleName = :moduleName,
          parentModuleKey = :parentModuleKey,
          domainKey = :domainKey,
          route = :route,
          sortOrder = :sortOrder,
          adminOnly = :adminOnly
      WHERE moduleKey = :moduleKey
    `, {
      moduleKey: definition.key,
      moduleName: definition.title,
      parentModuleKey: definition.groupTitle,
      domainKey: definition.domainKey,
      route: definition.route,
      sortOrder: index,
      adminOnly: definition.key === "system-users" || definition.key === "system-module-features" ? 1 : 0,
    });
  }
}

async function ensureFeatureStore() {
  if (!featureStoreReady) {
    featureStoreReady = (async () => {
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
  const definitions = getModuleFeatureDefinitions();
  const params: Record<string, unknown> = {};
  const keys = definitions.map((definition, index) => {
    params[`moduleKey${index}`] = definition.key;
    return `:moduleKey${index}`;
  }).join(", ");
  const rows = await queryRowsRaw<StoredFeature>(`
    SELECT moduleKey, domainKey, enabled, remark, updatedByUserId AS updatedBy, updatedAt
    FROM merge_common_modules
    WHERE moduleKey IN (${keys})
    ORDER BY sortOrder ASC, moduleKey ASC
  `, params);
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
    "SELECT role FROM merge_common_users WHERE email = :email AND status = :status LIMIT 1",
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
    "SELECT role FROM merge_common_users WHERE email = :email AND status = :status LIMIT 1",
    { email, status: "active" },
  ))[0];
  if (user?.role !== "admin") throw new Error("只有管理员可以修改功能模块开关");

  const definition = getModuleFeatureDefinitions().find((item) => item.key === moduleKey);
  if (!definition) throw new Error("功能模块不存在");

  await ensureFeatureStore();
  await executeRaw(`
    UPDATE merge_common_modules
    SET enabled = :enabled, updatedByUserId = (
      SELECT userId FROM merge_common_users WHERE email = :updatedBy LIMIT 1
    )
    WHERE moduleKey = :moduleKey
  `, { moduleKey, enabled: enabled ? 1 : 0, updatedBy: email });
  storedFeaturesCache = null;
  return listModuleFeatures(email);
}
