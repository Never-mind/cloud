import { describe, expect, test } from "vitest";
import {
  AUTH_SESSION_VALUE,
  createUserSessionValue,
  getUserEmailFromSessionValue,
  hashPassword,
  isAuthenticatedCookie,
  validateLogin,
} from "./auth";

describe("auth", () => {
  test("accepts an active database user with a matching password", async () => {
    const passwordSalt = "test-salt";
    const passwordHash = hashPassword("Luz@#789789", passwordSalt);

    expect(
      await validateLogin(" ADMIN@LUZCORP.COM ", "Luz@#789789", async () => ({
        userId: "admin",
        email: "admin@luzcorp.com",
        displayName: "管理员",
        passwordHash,
        passwordSalt,
        role: "admin",
        status: "active",
      })),
    ).toBe(true);
  });

  test("rejects wrong, missing, or disabled database credentials", async () => {
    const passwordSalt = "test-salt";
    const passwordHash = hashPassword("Luz@#789789", passwordSalt);

    expect(
      await validateLogin("admin@luzcorp.com", "wrong", async () => ({
        userId: "admin",
        email: "admin@luzcorp.com",
        displayName: "管理员",
        passwordHash,
        passwordSalt,
        role: "admin",
        status: "active",
      })),
    ).toBe(false);
    expect(await validateLogin("other@luzcorp.com", "Luz@#789789", async () => null)).toBe(false);
    expect(
      await validateLogin("admin@luzcorp.com", "Luz@#789789", async () => ({
        userId: "admin",
        email: "admin@luzcorp.com",
        displayName: "管理员",
        passwordHash,
        passwordSalt,
        role: "admin",
        status: "disabled",
      })),
    ).toBe(false);
  });

  test("recognizes the configured session cookie value", () => {
    expect(isAuthenticatedCookie(AUTH_SESSION_VALUE)).toBe(true);
    expect(isAuthenticatedCookie("bad-session")).toBe(false);
  });

  test("creates a signed user session that rejects tampering", () => {
    const session = createUserSessionValue("Test@LuzCorp.com");

    expect(getUserEmailFromSessionValue(session)).toBe("test@luzcorp.com");
    expect(getUserEmailFromSessionValue(`${session}x`)).toBeNull();
  });
});
