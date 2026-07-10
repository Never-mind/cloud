export const AUTH_COOKIE_NAME = "cloud_power_session";
export const AUTH_SESSION_VALUE = process.env.AUTH_SESSION_TOKEN ?? "cloud-power-admin-session";
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@luzcorp.com";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Luz@#789789";

export function validateLogin(email: string, password: string) {
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD;
}

export function isAuthenticatedCookie(value: string | undefined | null) {
  return value === AUTH_SESSION_VALUE;
}
