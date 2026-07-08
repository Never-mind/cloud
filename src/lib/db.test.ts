import { describe, expect, it } from "vitest";
import { buildDbConfig } from "./db";

describe("database pool configuration", () => {
  it("uses a small default connection pool to avoid exhausting local MySQL", () => {
    expect(buildDbConfig({}).connectionLimit).toBe(5);
  });

  it("allows overriding the connection limit through DB_CONNECTION_LIMIT", () => {
    expect(buildDbConfig({ DB_CONNECTION_LIMIT: "2" }).connectionLimit).toBe(2);
  });
});
