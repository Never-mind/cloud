/**
 * 月账单每月明细 / 预付款每月核销明细 的列定义。
 *
 * 页面表格与"服务端导出文件"共用同一份定义，避免两边列不一致（导出少列、顺序不同）。
 */

export type WriteOffColumn = { key: string; label: string; type?: string };

export const monthlyBillingWriteOffColumns: WriteOffColumn[] = [
  { key: "writeOffMonth", label: "核销月份", type: "date" },
  { key: "countryCode", label: "国家" },
  { key: "batchName", label: "批次号" },
  { key: "requestNo", label: "需求单号" },
  { key: "poNo", label: "PO单号" },
  { key: "deviceCode", label: "实例编码" },
  { key: "requestType", label: "类型" },
  { key: "modelCode", label: "机型" },
  { key: "nameEn", label: "英文名称" },
  { key: "quantity", label: "数量" },
  { key: "instanceContractNo", label: "实例合同号" },
  { key: "currency", label: "币种" },
  { key: "monthlyAmount", label: "月账单实例价格（含税）", type: "money" },
  { key: "monthlyTotalAmount", label: "月账单金额（含税）", type: "money" },
  { key: "stage", label: "阶段" },
  { key: "sourceType", label: "来源" },
  { key: "adjustmentNo", label: "调整单号" },
  { key: "createdAt", label: "创建日期", type: "date" },
  { key: "updatedAt", label: "更新日期", type: "date" },
];

/** 表格与导出都按这份列展示：在国家后面插入承接单位、供应商、客户。 */
export const monthlyBillingWriteOffDisplayColumns: WriteOffColumn[] = monthlyBillingWriteOffColumns.flatMap((column) =>
  column.key === "countryCode"
    ? [column, { key: "undertakingUnitName", label: "承接单位" }, { key: "supplierName", label: "供应商" }, { key: "customerName", label: "客户" }]
    : [column],
);

export const monthlyPrepaymentWriteOffColumns: WriteOffColumn[] = [
  { key: "writeOffMonth", label: "核销月份", type: "date" },
  { key: "contractNo", label: "预付款合同号" },
  { key: "countryCode", label: "国家" },
  { key: "batchName", label: "批次号" },
  { key: "undertakingUnitName", label: "承接单位" },
  { key: "supplierName", label: "供应商" },
  { key: "customerName", label: "客户" },
  { key: "requestNo", label: "需求单号" },
  { key: "poNo", label: "PO单号" },
  { key: "deviceCode", label: "实例编码" },
  { key: "requestType", label: "类型" },
  { key: "modelCode", label: "机型" },
  { key: "nameEn", label: "英文名称" },
  { key: "quantity", label: "数量" },
  { key: "currency", label: "币种" },
  { key: "originalAmount", label: "合同总价", type: "money" },
  { key: "monthlyAmount", label: "月核销金额", type: "money" },
  { key: "lineType", label: "明细类型", type: "lineType" },
  { key: "sourceType", label: "来源" },
  { key: "adjustmentNo", label: "调整单号" },
  { key: "createdAt", label: "创建日期", type: "date" },
  { key: "updatedAt", label: "更新日期", type: "date" },
];

export const monthlyBillingWriteOffExportFilename = "monthly-billing-writeoffs.csv";
export const monthlyPrepaymentWriteOffExportFilename = "prepayment-monthly-writeoffs.csv";
