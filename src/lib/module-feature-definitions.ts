import type { NavGroup } from "./modules";

export const MODULE_FEATURE_COOKIE_NAME = "cloud_power_module_features";

export type ModuleFeatureState = Record<string, boolean>;

export type ModuleFeatureRoute = {
  key: string;
  routePrefix: string;
};

export const MODULE_FEATURE_ROUTES: ModuleFeatureRoute[] = [
  { key: "b6-type-configs", routePrefix: "/finance/b6-type-configs" },
  { key: "capex-pricing", routePrefix: "/finance/capex-pricing" },
  { key: "balance-settlements", routePrefix: "/finance/balance-settlements" },
  { key: "non-instance-settlements", routePrefix: "/finance/non-instance-settlements" },
  { key: "balance-final-settlements", routePrefix: "/finance/balance-final-settlements" },
  { key: "internal-service-fee-available", routePrefix: "/finance/internal-service-fee-available" },
  { key: "internal-service-fees", routePrefix: "/finance/internal-service-fees" },
  { key: "internal-service-fee-adjustments", routePrefix: "/finance/internal-service-fee-adjustments" },
  { key: "internal-service-fee-snapshots", routePrefix: "/finance/internal-service-fee-snapshots" },
  { key: "system-module-features", routePrefix: "/system/module-features" },
];

const MODULE_FEATURE_API_ROUTES: ModuleFeatureRoute[] = [
  { key: "b6-type-configs", routePrefix: "/api/capex-pricing/b6-types" },
  { key: "capex-pricing", routePrefix: "/api/capex-pricing" },
  { key: "balance-settlements", routePrefix: "/api/balance-settlements" },
  { key: "internal-service-fees", routePrefix: "/api/internal-service-fees" },
  { key: "system-module-features", routePrefix: "/api/system/module-features" },
];

const DISABLED_BY_DEFAULT = new Set([
  "b6-type-configs",
  "capex-pricing",
  "balance-settlements",
  "non-instance-settlements",
  "balance-final-settlements",
  "internal-service-fee-available",
  "internal-service-fees",
  "internal-service-fee-adjustments",
  "internal-service-fee-snapshots",
]);

export function isModuleDisabledByDefault(moduleKey: string) {
  return DISABLED_BY_DEFAULT.has(moduleKey);
}

export function getDefaultModuleFeatureState(): ModuleFeatureState {
  return Object.fromEntries(MODULE_FEATURE_ROUTES.map(({ key }) => [key, !isModuleDisabledByDefault(key)]));
}

export function isModuleFeatureEnabled(moduleKey: string, state: ModuleFeatureState | undefined) {
  if (state && Object.prototype.hasOwnProperty.call(state, moduleKey)) return state[moduleKey] !== false;
  return !isModuleDisabledByDefault(moduleKey);
}

export function getModuleFeatureKeyForRoute(pathname: string) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const entityMatch = normalizedPath.match(/^\/api\/entities\/([^/]+)/);
  if (entityMatch && MODULE_FEATURE_ROUTES.some(({ key }) => key === entityMatch[1])) return entityMatch[1];
  return [...MODULE_FEATURE_ROUTES, ...MODULE_FEATURE_API_ROUTES]
    .filter(({ routePrefix }) => normalizedPath === routePrefix || normalizedPath.startsWith(`${routePrefix}/`))
    .sort((left, right) => right.routePrefix.length - left.routePrefix.length)[0]?.key ?? null;
}

export function encodeModuleFeatureState(state: ModuleFeatureState) {
  return encodeURIComponent(JSON.stringify(state));
}

export function decodeModuleFeatureState(value: string | undefined | null): ModuleFeatureState {
  if (!value) return getDefaultModuleFeatureState();
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return getDefaultModuleFeatureState();
    return Object.fromEntries(
      Object.entries(parsed).filter(([, enabled]) => typeof enabled === "boolean"),
    ) as ModuleFeatureState;
  } catch {
    return getDefaultModuleFeatureState();
  }
}

export function filterNavGroupsByModuleFeatures(groups: NavGroup[], state: ModuleFeatureState) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isModuleFeatureEnabled(item.key, state)),
      children: group.children
        ?.map((child) => ({
          ...child,
          items: child.items.filter((item) => isModuleFeatureEnabled(item.key, state)),
        }))
        .filter((child) => child.items.length),
    }))
    .filter((group) => group.items.length || group.children?.length);
}
