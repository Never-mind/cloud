import { createHmac, timingSafeEqual } from "node:crypto";
import { AUTH_PERMISSION_COOKIE_NAME, AUTH_SESSION_VALUE } from "./auth-session";
import { permissionKeyFromToken, permissionKeyToken, type PermissionState } from "./permission-definitions";

export { AUTH_PERMISSION_COOKIE_NAME } from "./auth-session";

function sign(encoded: string) {
  return createHmac("sha256", AUTH_SESSION_VALUE).update(encoded).digest("hex");
}

export function encodePermissionState(state: PermissionState) {
  const compactState = {
    v: 2,
    r: state.role,
    g: Object.entries(state.grants).map(([key, mask]) => [permissionKeyToken(key), mask]),
  };
  const encoded = Buffer.from(JSON.stringify(compactState), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function decodePermissionState(value: string | undefined | null): PermissionState | null {
  if (!value) return null;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra || !/^[0-9a-f]{64}$/i.test(signature)) return null;
  const actual = Buffer.from(signature, "hex");
  const expected = Buffer.from(sign(encoded), "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (value.v === 2 && typeof value.r === "string" && Array.isArray(value.g)) {
      const grants: Record<string, number> = {};
      for (const item of value.g) {
        if (!Array.isArray(item) || typeof item[0] !== "string" || typeof item[1] !== "number") continue;
        const key = permissionKeyFromToken(item[0]);
        if (key) grants[key] = item[1];
      }
      return { role: value.r, grants };
    }
    // Keep existing sessions valid while users roll out the new application version.
    if (typeof value.role !== "string" || !value.grants || typeof value.grants !== "object" || Array.isArray(value.grants)) return null;
    return { role: value.role, grants: Object.fromEntries(Object.entries(value.grants).filter(([, mask]) => typeof mask === "number")) };
  } catch {
    return null;
  }
}
