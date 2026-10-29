export const EMBEDDED_COOKIE_NAME = "cloud-power-embedded-v2";
export const EMBEDDED_COOKIE_MAX_AGE = 8 * 60 * 60;
export const EMBEDDED_REQUEST_HEADER = "x-cloud-power-embedded";

export function isEmbeddedRequest({ marker, destination, cookie }: {
  marker: string | null;
  destination: string | null;
  cookie?: string;
}) {
  if (marker === "1" || destination === "iframe") return true;
  // Module cookies are shared by top-level documents and their tabs. A direct
  // visit must retain the outer workspace even if this module was embedded before.
  if (destination === "document") return false;
  return cookie === "1";
}

// A frame keeps its identity across client navigation and full reloads, even
// when an older link omits embed=1. This check never reads cross-origin content.
export function isInsideFrame() {
  return typeof window !== "undefined" && window.parent !== window;
}

export function getEmbeddedCookiePath(pathname: string) {
  const firstSegment = pathname.split("/").find(Boolean);
  return firstSegment ? `/${firstSegment}` : "/";
}
