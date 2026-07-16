import { describe, expect, it } from "vitest";
import {
  importRowsWithReport,
  isEntityTemplateNoteRow,
  normalizeEntityImportRow,
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

  it("preserves time-of-day for datetime import fields", () => {
    const demandPlanConfig = {
      ...config,
      formFields: [{ key: "timestamp", label: "timestamp", type: "datetime" }],
    } satisfies EntityConfig;

    expect(normalizeEntityImportRow(demandPlanConfig, { timestamp: "2026/06/09 14:30:45" })).toEqual({
      timestamp: "2026-06-09 14:30:45",
    });
  });
});
