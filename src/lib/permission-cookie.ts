import { createHmac, timingSafeEqual } from "node:crypto";
import { AUTH_PERMISSION_COOKIE_NAME, AUTH_SESSION_VALUE } from "./auth-session";
import type { PermissionState } from "./permission-definitions";

export { AUTH_PERMISSION_COOKIE_NAME } from "./auth-session";

function sign(encoded: string) {
  return createHmac("sha256", AUTH_SESSION_VALUE).update(encoded).digest("hex");
}

export function encodePermissionState(state: PermissionState) {
  const encoded = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
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
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PermissionState;
    if (!parsed || typeof parsed.role !== "string" || !parsed.grants || typeof parsed.grants !== "object") return null;
    return { role: parsed.role, grants: Object.fromEntries(Object.entries(parsed.grants).filter(([, mask]) => typeof mask === "number")) };
  } catch {
    return null;
  }
}
