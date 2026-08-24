export const EMBEDDED_COOKIE_NAME = "cloud-power-embedded-v2";
export const EMBEDDED_COOKIE_MAX_AGE = 8 * 60 * 60;
export const EMBEDDED_REQUEST_HEADER = "x-cloud-power-embedded";

export function getEmbeddedCookiePath(pathname: string) {
  const firstSegment = pathname.split("/").find(Boolean);
  return firstSegment ? `/${firstSegment}` : "/";
}
