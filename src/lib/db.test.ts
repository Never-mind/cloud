import { describe, expect, it } from "vitest";
import { buildDbConfig, physicalTableName, rewriteSqlTables } from "./db";

describe("database pool configuration", () => {
  it("uses a small default connection pool to avoid exhausting local MySQL", () => {
    expect(buildDbConfig({}).connectionLimit).toBe(5);
  });

  it("allows overriding the connection limit through DB_CONNECTION_LIMIT", () => {
    expect(buildDbConfig({ DB_CONNECTION_LIMIT: "2" }).connectionLimit).toBe(2);
  });

  it("maps logical table names to power-prefixed physical table names", () => {
    expect(physicalTableName("requests")).toBe("power_requests");
    expect(physicalTableName("power_requests")).toBe("power_requests");
    expect(physicalTableName("information_schema.TABLES")).toBe("information_schema.TABLES");
  });

  it("maps purchase order demand plan tables to prefixed physical table names", () => {
    expect(physicalTableName("purchaseordersnitems")).toBe("power_purchaseordersnitems");
    expect(physicalTableName("purchaseorderplanitems")).toBe("power_purchaseorderplanitems");
  });

  it("rewrites SQL table references without double prefixing", () => {
    expect(
      rewriteSqlTables(
        "SELECT * FROM requests r LEFT JOIN `purchaseorders` po ON po.requestNo = r.requestNo WHERE EXISTS (SELECT 1 FROM power_shipments)",
      ),
    ).toBe(
      "SELECT * FROM power_requests r LEFT JOIN `power_purchaseorders` po ON po.requestNo = r.requestNo WHERE EXISTS (SELECT 1 FROM power_shipments)",
    );
  });
});
