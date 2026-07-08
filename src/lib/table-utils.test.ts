import { describe, expect, it } from "vitest";
import {
  buildExportHeaders,
  getColumnSettingGroups,
  getHiddenColumns,
  getVisibleColumns,
  mergeColumnVisibility,
} from "./table-utils";

const columns = [
  { key: "shipmentId", label: "物流ID", defaultVisible: true },
  { key: "poNo", label: "PO订单号", defaultVisible: true },
  { key: "snapshotDestinationAddress", label: "交付地址快照", defaultVisible: false },
  { key: "snapshotRecipientPhone", label: "收件电话快照", defaultVisible: false },
];

describe("table column visibility", () => {
  it("uses default visibility and exposes hidden columns", () => {
    expect(getVisibleColumns(columns, {})).toEqual(columns.slice(0, 2));
    expect(getHiddenColumns(columns, {}).map((column) => column.key)).toEqual([
      "snapshotDestinationAddress",
      "snapshotRecipientPhone",
    ]);
  });

  it("allows users to override default visible and hidden columns", () => {
    const visibility = mergeColumnVisibility(columns, {
      poNo: false,
      snapshotRecipientPhone: true,
    });

    expect(getVisibleColumns(columns, visibility).map((column) => column.key)).toEqual([
      "shipmentId",
      "snapshotRecipientPhone",
    ]);
  });

  it("builds export headers from every column, not just visible columns", () => {
    expect(buildExportHeaders(columns)).toEqual([
      "物流ID",
      "PO订单号",
      "交付地址快照",
      "收件电话快照",
    ]);
  });

  it("groups field setting options into visible and hidden sections", () => {
    const groups = getColumnSettingGroups(columns, {});

    expect(groups.visible.map((column) => column.key)).toEqual(["shipmentId", "poNo"]);
    expect(groups.hidden.map((column) => column.key)).toEqual([
      "snapshotDestinationAddress",
      "snapshotRecipientPhone",
    ]);
  });
});
