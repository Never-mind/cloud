import { AUTH_PERMISSION_COOKIE_NAME, AUTH_SESSION_VALUE } from "./auth-session";
import type { PermissionState } from "./permission-definitions";

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
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as PermissionState;
    if (!parsed || typeof parsed.role !== "string" || !parsed.grants || typeof parsed.grants !== "object") return null;
    return { role: parsed.role, grants: Object.fromEntries(Object.entries(parsed.grants).filter(([, mask]) => typeof mask === "number")) };
  } catch {
    return null;
  }
}
