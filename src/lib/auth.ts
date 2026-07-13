import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

import { queryRows } from "./db";

export const AUTH_COOKIE_NAME = "cloud_power_session";
export const AUTH_SESSION_VALUE = process.env.AUTH_SESSION_TOKEN ?? "cloud-power-admin-session";
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
