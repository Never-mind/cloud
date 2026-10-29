import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardOverview } from "./dashboard-service";
import { queryRows } from "./db";

vi.mock("./db", () => ({ queryRows: vi.fn() }));

describe("dashboard device receipts", () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.function("SUBSTRING_INDEX", (value, delimiter, count) => value === null ? null : String(value).split(String(delimiter)).slice(0, Number(count)).join(String(delimiter)));
    database.exec(`
      CREATE TABLE requests (requestNo TEXT, countryCode TEXT, status TEXT);
      CREATE TABLE requestitems (id TEXT, requestNo TEXT, deviceCode TEXT, quantity INTEGER);
      CREATE TABLE instancemodels (deviceCode TEXT, instanceType TEXT);
      CREATE TABLE purchaseorderitems (id TEXT, requestItemId TEXT);
      CREATE TABLE shipments (purchaseOrderItemId TEXT, deliveredAt TEXT);
      INSERT INTO requests VALUES ('BR', 'BR', '已下单'), ('CL', 'CL', '已下单'), ('MX', 'MX', '已下单'),
        ('BR-pending', 'BR', '待下单'), ('MX-pending', 'MX', '待下单'), ('draft', 'BR', '草稿');
      INSERT INTO instancemodels VALUES ('device', 'Equipment'), ('part', 'Component');
      INSERT INTO requestitems VALUES
        ('br-signed', 'BR', 'device', 299), ('br-unsigned', 'BR', 'device', 1580),
        ('cl-signed', 'CL', 'device', 206), ('cl-unsigned', 'CL', 'device', 626),
        ('mx-signed', 'MX', 'device', 1008), ('mx-unsigned', 'MX', 'device', 1056),
        ('br-po-only', 'BR-pending', 'device', 64), ('br-no-po', 'BR-pending', 'device', 82),
        ('mx-no-po', 'MX-pending', 'device', 48),
        ('draft', 'draft', 'device', 500), ('part', 'BR', 'part', 300);
      INSERT INTO purchaseorderitems VALUES
        ('br-signed-po', 'br-signed'), ('br-unsigned-po', 'br-unsigned'),
        ('cl-signed-po', 'cl-signed'), ('cl-unsigned-po', 'cl-unsigned'),
        ('mx-signed-po', 'mx-signed'), ('mx-unsigned-po', 'mx-unsigned'),
        ('pending-po', 'br-po-only'), ('draft-po', 'draft'), ('part-po', 'part');
      INSERT INTO shipments VALUES
        ('br-signed-po', '2026-07-01'), ('br-signed-po', NULL),
        ('br-unsigned-po', NULL), ('br-unsigned-po', NULL),
        ('cl-signed-po', '2026-07-01'), ('cl-unsigned-po', NULL),
        ('mx-signed-po', '2026-07-01'), ('mx-unsigned-po', NULL),
        ('draft-po', NULL), ('part-po', NULL);
    `);
    vi.mocked(queryRows).mockReset();
    vi.mocked(queryRows).mockImplementation(async (sql, params) => {
      expect(sql).toMatch(/^\s*SELECT\b/i);
      if (!sql.includes("AS receivedFlag")) return [];
      const statement = database.prepare(sql);
      return params?.countryCode ? statement.all({ countryCode: String(params.countryCode) }) : statement.all();
    });
  });

  afterEach(() => database.close());

  it("counts only equipment with logistics, excluding 194 pending devices and avoiding duplicate shipments", async () => {
    const data = await getDashboardOverview(new URLSearchParams());
    expect(data.instanceReceipt).toEqual([
      { countryCode: "BR", receiptStatus: "received", devices: 299 },
      { countryCode: "BR", receiptStatus: "unreceived", devices: 1580 },
      { countryCode: "CL", receiptStatus: "received", devices: 206 },
      { countryCode: "CL", receiptStatus: "unreceived", devices: 626 },
      { countryCode: "MX", receiptStatus: "received", devices: 1008 },
      { countryCode: "MX", receiptStatus: "unreceived", devices: 1056 },
    ]);
    expect(data.instanceReceipt.filter((row) => row.receiptStatus === "unreceived").reduce((sum, row) => sum + row.devices, 0)).toBe(3262);
  });

  it("applies the selected country to the same logistics population", async () => {
    const data = await getDashboardOverview(new URLSearchParams({ countryCode: "BR" }));
    expect(data.instanceReceipt).toEqual([
      { countryCode: "BR", receiptStatus: "received", devices: 299 },
      { countryCode: "BR", receiptStatus: "unreceived", devices: 1580 },
    ]);
  });
});
