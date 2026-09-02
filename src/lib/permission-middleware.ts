import { AUTH_PERMISSION_COOKIE_NAME, AUTH_SESSION_VALUE } from "./auth-session";
import { permissionKeyFromToken, type PermissionState } from "./permission-definitions";

export { AUTH_PERMISSION_COOKIE_NAME } from "./auth-session";

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(base64);
}

export async function decodePermissionState(value: string | undefined | null): Promise<PermissionState | null> {
  if (!value) return null;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra || !/^[0-9a-f]{64}$/i.test(signature)) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(AUTH_SESSION_VALUE),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify("HMAC", key, hexToBytes(signature), new TextEncoder().encode(encoded));
    if (!valid) return null;
    const bytes = Uint8Array.from(decodeBase64Url(encoded), (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
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
    if (typeof value.role !== "string" || !value.grants || typeof value.grants !== "object" || Array.isArray(value.grants)) return null;
    return { role: value.role, grants: Object.fromEntries(Object.entries(value.grants).filter(([, mask]) => typeof mask === "number")) };
  } catch {
    return null;
  }
}
