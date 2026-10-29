import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmbeddedCookiePath, isEmbeddedRequest, isInsideFrame } from "./embedded-workspace";

afterEach(() => vi.unstubAllGlobals());

describe("embedded workspace detection", () => {
  it("recognizes iframe reloads and cross-module links without a marker or cookie", () => {
    expect(isEmbeddedRequest({ marker: null, destination: "iframe" })).toBe(true);
    expect(isEmbeddedRequest({ marker: "1", destination: "empty" })).toBe(true);
  });

  it("keeps direct visits full-size despite a previous module cookie", () => {
    expect(isEmbeddedRequest({ marker: null, destination: "document", cookie: "1" })).toBe(false);
    expect(isEmbeddedRequest({ marker: "1", destination: "document", cookie: "1" })).toBe(true);
  });

  it("supports client navigation requests and non-browser callers", () => {
    expect(isEmbeddedRequest({ marker: null, destination: "empty", cookie: "1" })).toBe(true);
    expect(isEmbeddedRequest({ marker: null, destination: null })).toBe(false);
  });

  it("detects actual frame identity independently of URL and server props", () => {
    expect(isInsideFrame()).toBe(false);
    const top: any = {};
    top.parent = top;
    vi.stubGlobal("window", top);
    expect(isInsideFrame()).toBe(false);
    vi.stubGlobal("window", { parent: top });
    expect(isInsideFrame()).toBe(true);
  });
});

describe("embedded workspace cookie scope", () => {
  it("keeps all routes in one top-level module embedded", () => {
    expect(getEmbeddedCookiePath("/finance/prepayment-writeoff-adjustments/new")).toBe("/finance");
    expect(getEmbeddedCookiePath("/finance/billing-adjustments/ADJ-001")).toBe("/finance");
    expect(getEmbeddedCookiePath("/requests/orders/REQ-001")).toBe("/requests");
    expect(getEmbeddedCookiePath("/purchase/orders/PO-001")).toBe("/purchase");
  });

  it("uses the root path for the home route", () => {
    expect(getEmbeddedCookiePath("/")).toBe("/");
  });
});
