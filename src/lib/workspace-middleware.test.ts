import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { AUTH_COOKIE_NAME, AUTH_SESSION_VALUE } from "./auth-session";
import { EMBEDDED_COOKIE_NAME, EMBEDDED_REQUEST_HEADER } from "./embedded-workspace";
import { encodeModuleFeatureState, MODULE_FEATURE_COOKIE_NAME } from "./module-feature-definitions";

function request(route: string, destination: string, extraCookie = "") {
  return new NextRequest(`http://localhost${route}`, { headers: {
    "sec-fetch-dest": destination,
    cookie: `${AUTH_COOKIE_NAME}=${AUTH_SESSION_VALUE}; ${extraCookie}`,
  } });
}

describe("workspace middleware", () => {
  it("keeps disabled customer aliases in the embedded disabled page", async () => {
    const response = await middleware(request("/customer-product-aliases", "iframe",
      `${MODULE_FEATURE_COOKIE_NAME}=${encodeModuleFeatureState({ "customer-product-aliases": false })}`));
    const url = new URL(response.headers.get("location")!);
    expect(url.pathname).toBe("/module-disabled");
    expect(url.searchParams.get("embed")).toBe("1");
  });
  it.each(["/suppliers/test", "/customers/test", "/undertaking-units/test", "/purchase/orders/test", "/requests/orders/test", "/shipments", "/finance/service-fee-snapshots", "/cloud/reconciliation", "/po/settlement-projects/test"])(
    "keeps %s embedded even without query parameters", async (route) => {
      const response = await middleware(request(route, "iframe"));
      if (response.headers.has("location")) {
        expect(new URL(response.headers.get("location")!).searchParams.get("embed")).toBe("1");
      } else {
        expect(response.headers.get(`x-middleware-request-${EMBEDDED_REQUEST_HEADER}`)).toBe("1");
      }
    },
  );

  it("does not let a module cookie hide the outer sidebar on a direct visit", async () => {
    const response = await middleware(request("/suppliers", "document", `${EMBEDDED_COOKIE_NAME}=1`));
    expect(response.headers.get(`x-middleware-request-${EMBEDDED_REQUEST_HEADER}`)).toBeNull();
  });

  it("retains embedded mode through session-expiry redirects", async () => {
    const response = await middleware(new NextRequest("http://localhost/customers/test", { headers: { "sec-fetch-dest": "iframe" } }));
    const url = new URL(response.headers.get("location")!);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("embed")).toBe("1");
  });

  it("still rejects anonymous API requests", async () => {
    const response = await middleware(new NextRequest("http://localhost/api/orders"));
    expect(response.status).toBe(401);
  });
});
