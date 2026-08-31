import { describe, expect, it } from "vitest";
import { buildDbConfig, physicalTableName, rewriteSqlTables } from "./db";

describe("database pool configuration", () => {
  it("uses a small default connection pool to avoid exhausting local MySQL", () => {
    expect(buildDbConfig({}).connectionLimit).toBe(5);
  });

  it("uses merge as the default database for the combined system", () => {
    expect(buildDbConfig({}).database).toBe("merge");
  });

  it("allows overriding the connection limit through DB_CONNECTION_LIMIT", () => {
    expect(buildDbConfig({ DB_CONNECTION_LIMIT: "2" }).connectionLimit).toBe(2);
  });

  it("maps logical table names to merge-prefixed physical table names", () => {
    expect(physicalTableName("requests")).toBe("merge_power_requests");
    expect(physicalTableName("power_requests")).toBe("merge_power_requests");
    expect(physicalTableName("merge_power_requests")).toBe("merge_power_requests");
    expect(physicalTableName("information_schema.TABLES")).toBe("information_schema.TABLES");
  });

  it("maps purchase, cloud, and common physical table prefixes into merge", () => {
    expect(physicalTableName("po_product_masters")).toBe("merge_po_product_masters");
    expect(physicalTableName("cloud_rows")).toBe("merge_cloud_rows");
    expect(physicalTableName("common_users")).toBe("merge_common_users");
  });

  it("maps purchase order demand plan tables to prefixed physical table names", () => {
    expect(physicalTableName("purchaseordersnitems")).toBe("merge_power_purchaseordersnitems");
    expect(physicalTableName("purchaseorderplanitems")).toBe("merge_power_purchaseorderplanitems");
  });

  it("rewrites SQL table references without double prefixing", () => {
    expect(
      rewriteSqlTables(
        "SELECT * FROM requests r LEFT JOIN `purchaseorders` po ON po.requestNo = r.requestNo WHERE EXISTS (SELECT 1 FROM power_shipments)",
      ),
    ).toBe(
      "SELECT * FROM merge_power_requests r LEFT JOIN `merge_power_purchaseorders` po ON po.requestNo = r.requestNo WHERE EXISTS (SELECT 1 FROM merge_power_shipments)",
    );
  });

  it("rewrites legacy multi-system tables into merge-prefixed tables", () => {
    expect(rewriteSqlTables("SELECT * FROM po_product_masters p JOIN common_customers c ON c.customerId = p.id")).toBe(
      "SELECT * FROM merge_po_product_masters p JOIN merge_common_customers c ON c.customerId = p.id",
    );
    expect(rewriteSqlTables("SELECT * FROM merge_po_product_masters p JOIN merge_common_customers c ON c.customerId = p.id")).toBe(
      "SELECT * FROM merge_po_product_masters p JOIN merge_common_customers c ON c.customerId = p.id",
    );
  });
});
