import { describe, expect, test } from "vitest";
import { isAuthenticatedCookie, validateLogin, AUTH_SESSION_VALUE } from "./auth";

describe("auth", () => {
  test("accepts the initial admin account", () => {
    expect(validateLogin("admin@luzcorp.com", "Luz@#789789")).toBe(true);
    expect(validateLogin(" ADMIN@LUZCORP.COM ", "Luz@#789789")).toBe(true);
  });

  test("rejects wrong credentials", () => {
    expect(validateLogin("admin@luzcorp.com", "wrong")).toBe(false);
    expect(validateLogin("other@luzcorp.com", "Luz@#789789")).toBe(false);
  });

  test("recognizes the configured session cookie value", () => {
    expect(isAuthenticatedCookie(AUTH_SESSION_VALUE)).toBe(true);
    expect(isAuthenticatedCookie("bad-session")).toBe(false);
  });
});
