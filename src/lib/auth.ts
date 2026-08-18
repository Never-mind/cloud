import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

import { AUTH_COOKIE_NAME, AUTH_SESSION_VALUE, AUTH_USER_COOKIE_NAME } from "./auth-session";
import { queryRows } from "./db";
export { AUTH_COOKIE_NAME, AUTH_SESSION_VALUE, AUTH_USER_COOKIE_NAME } from "./auth-session";

export const INITIAL_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@luzcorp.com";
export const INITIAL_ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD ?? "Luz@#789789";

export type AuthUser = {
  email: string;
  passwordHash: string;
  passwordSalt: string;
  status: string;
};

export type AuthUserLoader = (email: string) => Promise<AuthUser | null>;

export function createPasswordSalt() {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string) {
  return pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");
}

function hashesMatch(actualHash: string, expectedHash: string) {
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function getUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await queryRows<AuthUser>(
    `
      SELECT email, passwordHash, passwordSalt, status
      FROM appusers
      WHERE email = :email
      LIMIT 1
    `,
    { email: normalizedEmail },
  );
  return rows[0] ?? null;
}

export async function validateLogin(email: string, password: string, loadUser: AuthUserLoader = getUserByEmail) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return false;
  }

  const user = await loadUser(normalizedEmail);
  if (!user || user.status !== "active") {
    return false;
  }

  const inputHash = hashPassword(password, user.passwordSalt);
  return hashesMatch(inputHash, user.passwordHash);
}

export function isAuthenticatedCookie(value: string | undefined | null) {
  return value === AUTH_SESSION_VALUE;
}

function getUserSessionSignature(encodedEmail: string) {
  return createHmac("sha256", AUTH_SESSION_VALUE).update(encodedEmail).digest("hex");
}

export function createUserSessionValue(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const encodedEmail = Buffer.from(normalizedEmail, "utf8").toString("base64url");
  return `${encodedEmail}.${getUserSessionSignature(encodedEmail)}`;
}

export function getUserEmailFromSessionValue(value: string | undefined | null) {
  if (!value) return null;
  const [encodedEmail, signature, extra] = value.split(".");
  if (!encodedEmail || !signature || extra) return null;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return null;

  const expectedSignature = getUserSessionSignature(encodedEmail);
  const actual = Buffer.from(signature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const email = Buffer.from(encodedEmail, "base64url").toString("utf8").trim().toLowerCase();
    return email && email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

export function getAuthenticatedUserEmail(request: { cookies: { get(name: string): { value: string } | undefined } }) {
  if (!isAuthenticatedCookie(request.cookies.get(AUTH_COOKIE_NAME)?.value)) return null;
  return getUserEmailFromSessionValue(request.cookies.get(AUTH_USER_COOKIE_NAME)?.value);
}
