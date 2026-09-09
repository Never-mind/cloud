import { describe, expect, it } from "vitest";
import {
  importRowsWithReport,
  isEntityTemplateNoteRow,
  mapEntityImportRow,
  normalizeEntityImportRow,
  normalizeImportHeader,
  validateEntityImportRow,
} from "./entity-import";
import type { EntityConfig } from "./modules";

const config = {
  key: "countries",
  title: "国家",
  table: "countries",
  primaryKey: "code",
  navGroup: "基础信息",
  route: "/master-data/countries",
  description: "",
  listFields: [],
  formFields: [],
  filters: [],
} satisfies EntityConfig;

describe("entity import", () => {
  it("reports total, successful rows, and failed row details", async () => {
    const result = await importRowsWithReport(
      config,
      [{ code: "CN" }, { code: "BAD" }, { code: "MX" }],
      async (row) => {
        if (row.code === "BAD") throw new Error("代码重复");
      },
    );

    expect(result.total).toBe(3);
    expect(result.success).toBe(2);
    expect(result.failed).toEqual([{ rowNumber: 3, primaryKey: "BAD", error: "代码重复" }]);
  });

  it("validates required fields before writing imported rows", async () => {
    const shipmentConfig = {
      ...config,
      key: "shipments",
      primaryKey: "shipmentId",
      formFields: [
        { key: "shipmentId", label: "物流ID", required: true },
        { key: "poNo", label: "PO订单号", required: true },
        { key: "destinationLocationId", label: "目的地点ID", required: true },
      ],
    } satisfies EntityConfig;

    const result = await importRowsWithReport(
      shipmentConfig,
      [{ shipmentId: "SHP-1", poNo: "PO-1", destinationLocationId: "" }],
      async () => {},
    );

    expect(result).toMatchObject({
      total: 1,
      success: 0,
      failed: [{ rowNumber: 2, primaryKey: "SHP-1", error: "目的地点ID不能为空" }],
    });
  });

  it("recognizes template requirement rows so they are not imported as data", () => {
    const shipmentConfig = {
      ...config,
      formFields: [
        { key: "shipmentId", label: "物流ID", required: true },
        { key: "isReceived", label: "是否签收", type: "boolean" },
      ],
    } satisfies EntityConfig;

    expect(isEntityTemplateNoteRow(shipmentConfig, { 物流ID: "必填", 是否签收: "可选：是/否" })).toBe(true);
    expect(isEntityTemplateNoteRow(shipmentConfig, { 物流ID: "SHP-1", 是否签收: "是" })).toBe(false);
  });

  it("normalizes common imported boolean labels", () => {
    const shipmentConfig = {
      ...config,
      formFields: [{ key: "isReceived", label: "是否签收", type: "boolean" }],
    } satisfies EntityConfig;

    expect(normalizeEntityImportRow(shipmentConfig, { isReceived: "是" })).toEqual({ isReceived: true });
    expect(normalizeEntityImportRow(shipmentConfig, { isReceived: "否" })).toEqual({ isReceived: false });
  });

  it("accepts historical logistics address and recipient ID headers", () => {
    const shipmentConfig = {
      ...config,
      key: "shipments",
      formFields: [
        { key: "shipmentId", label: "物流ID" },
        { key: "dcCode", label: "机房ID" },
        { key: "destinationLocationId", label: "目的地点ID" },
        { key: "recipientContactId", label: "收件联系人ID" },
        { key: "snapshotRecipientName", label: "收件人快照" },
      ],
    } satisfies EntityConfig;

    expect(mapEntityImportRow(shipmentConfig, {
      "物流id": "SHP-1",
      "机房 id": "DC-1",
      "收货地址": "LOC-1",
      "收件人": "CT-1",
      snapshotRecipientName: "Imported name",
      ignored: "ignored",
    })).toEqual({
      shipmentId: "SHP-1",
      dcCode: "DC-1",
      destinationLocationId: "LOC-1",
      recipientContactId: "CT-1",
      snapshotRecipientName: "Imported name",
    });
    expect(normalizeImportHeader("收件人 ID")).toBe("收件人id");
    expect(mapEntityImportRow(shipmentConfig, {
      "收货地址ID": "LOC-2",
      "收件联系人ID": "CT-2",
    })).toEqual({ destinationLocationId: "LOC-2", recipientContactId: "CT-2" });
  });

  it("preserves time-of-day for datetime import fields", () => {
    const demandPlanConfig = {
      ...config,
      formFields: [{ key: "timestamp", label: "timestamp", type: "datetime" }],
    } satisfies EntityConfig;

    expect(normalizeEntityImportRow(demandPlanConfig, { timestamp: "2026/06/09 14:30:45" })).toEqual({
      timestamp: "2026-06-09 14:30:45",
    });
  });

  it("normalizes instance model type labels and keeps old templates compatible", () => {
    const instanceModelConfig = {
      ...config,
      key: "instance-models",
      primaryKey: "deviceCode",
      formFields: [
        { key: "deviceCode", label: "设备编码", required: true },
        { key: "instanceType", label: "类型", type: "select", required: true, options: [
          { label: "设备", value: "Equipment" },
          { label: "配件", value: "Material" },
          { label: "组件", value: "Component" },
        ] },
      ],
    } satisfies EntityConfig;

    expect(normalizeEntityImportRow(instanceModelConfig, { deviceCode: "DEV-1", instanceType: "配件" })).toMatchObject({
      instanceType: "Material",
    });
    const oldTemplateRow = normalizeEntityImportRow(instanceModelConfig, { deviceCode: "DEV-2" });
    expect(oldTemplateRow.instanceType).toBe("Equipment");
    expect(validateEntityImportRow(instanceModelConfig, { deviceCode: "DEV-3", instanceType: "legacy" })).toContain("实例型号类型只能选择");
  });
});
