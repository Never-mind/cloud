import { describe, expect, it } from "vitest";
import { mapEntityImportRow, normalizeEntityImportRow } from "./entity-import";
import { entityConfigs } from "./modules";

/**
 * 物流的机房/收货地址/收件人三列按设计映射到档案 ID 字段，
 * 再由 mergeShipmentImportRow 决定是解析成档案还是当成展示文本。
 */
const DOCUMENTED_SHIPMENT_ALIASES: Record<string, string> = {
  "机房": "dcCode",
  "收货地址": "destinationLocationId",
  "收件人": "recipientContactId",
};

describe("entity import templates", () => {
  it("every visible template column actually reaches the import row", () => {
    const dropped: string[] = [];
    for (const config of entityConfigs) {
      for (const field of config.formFields) {
        if (field.hidden) continue;
        const mapped = mapEntityImportRow(config, { [field.label]: "x" });
        const keys = Object.keys(mapped);
        const normalized = normalizeEntityImportRow(config, mapped);
        if (keys.length !== 1 || !(field.key in normalized)) {
          dropped.push(`${config.key}.${field.label}(${field.key}) → ${keys.join(",") || "被丢弃"}`);
        }
      }
    }

    // 模板列被静默丢弃时导入会显示成功却没写库，这里必须为空。
    expect(dropped).toEqual([]);
  });

  it("keeps the documented shipment address aliases", () => {
    const config = entityConfigs.find((item) => item.key === "shipments");
    expect(config).toBeTruthy();

    for (const [label, target] of Object.entries(DOCUMENTED_SHIPMENT_ALIASES)) {
      expect(Object.keys(mapEntityImportRow(config!, { [label]: "x" }))).toEqual([target]);
    }
  });

  it("imports the logistics timeline columns used by manual data entry", () => {
    const config = entityConfigs.find((item) => item.key === "shipments");
    const row = mapEntityImportRow(config!, {
      运输方式: "海运",
      CRD: "2026-01-05",
      APD交单: "2026-01-10",
      ASD提货: "2026-01-12",
      "起飞/开船": "2026-01-15",
      到港: "2026-02-01",
      清关完成: "2026-02-05",
      派送: "2026-02-08",
    });

    expect(row).toMatchObject({
      transportMode: "海运",
      crd: "2026-01-05",
      apdAt: "2026-01-10",
      pickupAt: "2026-01-12",
      departedAt: "2026-01-15",
      arrivedAt: "2026-02-01",
      customsClearedAt: "2026-02-05",
      deliveredAt: "2026-02-08",
    });
  });
});
