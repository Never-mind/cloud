import { describe, expect, it } from "vitest";
import { formatSyncTime } from "./sync-time";

describe("sync timestamps always display Beijing time", () => {
  it("displays the real November 5 run as November 5, including for a UTC+14 browser", () => {
    const utc = "2026-11-05T10:13:51.000Z";
    // Reproduces the old browser-local conversion crossing into November 6.
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(utc))).toBe("2026-11-06");
    expect(formatSyncTime(utc)).toBe("2026-11-05 18:13:51");
  });
  it.each(["2026-11-05T18:13:51+08:00", "2026-11-05 18:13:51", "2026-11-05T18:13:51"])("does not double-convert Beijing value %s", value => {
    expect(formatSyncTime(value)).toBe("2026-11-05 18:13:51");
  });
  it("handles actual Beijing midnight correctly without rendering 24:00", () => {
    expect(formatSyncTime("2026-11-05T15:59:59Z")).toBe("2026-11-05 23:59:59");
    expect(formatSyncTime("2026-11-05T16:00:00Z")).toBe("2026-11-06 00:00:00");
  });
  it.each([null, undefined, "", "bad-date"])("uses a placeholder for %s", value => expect(formatSyncTime(value)).toBe("-"));
});
