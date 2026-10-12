export type RequestDetailDraft = {
  /** 已存在明细的本地主键；新增行没有这个值。保存时用它决定是更新还是新建。 */
  id?: string;
  deviceCode: string;
  supplierId: string;
  undertakingUnitId: string;
  customerId: string;
  quantity: number;
  /** 内部批次号（明细级）；不填则沿用主单的默认批次 */
  batchName?: string;
};

/**
 * 生成明细行。
 *
 * 关键点：已存在的行必须沿用本地主键（`detail.id`），只有真正的新增行才生成新编号。
 * 以前一律按行位置生成 `RI-<需求单号>-001`，一旦本地明细是早期格式（如 `F-DOI-00107`）
 * 或用户增删过行，保存时会查不到对应行而走"新建"，导致同一个实例出现两条一模一样的明细。
 */
export function buildRequestItemRows({
  defaultBatchName = "",
  details,
  requestedAt,
  requestNo,
  requestType = "整机",
}: {
  /**
   * 明细没填批次时用它兜底（一般是主单的「默认批次」）。
   * 只补空值：明细自己填过的批次不会被覆盖，这样"某几行有自己批次、其余跟随默认"能共存。
   */
  defaultBatchName?: string;
  details: RequestDetailDraft[];
  requestedAt: string;
  requestNo: string;
  requestType?: string;
}) {
  const fallbackBatch = String(defaultBatchName ?? "").trim();
  const usedIds = new Set(details.map((detail) => detail.id).filter((id): id is string => Boolean(id)));
  // 新编号从现有最大序号往后排，避免和已有明细的编号撞车（撞了会把别人的行覆盖掉）。
  // 只认本需求单的 RI-<需求单号>-<序号> 格式：历史数据里像 F-DOI-00107 这种旧编号不参与排号。
  const sequencePattern = new RegExp(`^RI-${requestNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let nextSequence = details.reduce((max, detail) => {
    const matched = sequencePattern.exec(detail.id ?? "");
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);

  return details.map((detail) => {
    let id = detail.id;
    if (!id) {
      do {
        nextSequence += 1;
        id = `RI-${requestNo}-${String(nextSequence).padStart(3, "0")}`;
      } while (usedIds.has(id));
      usedIds.add(id);
    }
    return {
      id,
      requestNo,
      deviceCode: detail.deviceCode,
      requestType,
      batchName: String(detail.batchName ?? "").trim() || fallbackBatch,
      supplierId: detail.supplierId,
      undertakingUnitId: detail.undertakingUnitId,
      customerId: detail.customerId,
      requestedAt,
      quantity: detail.quantity,
    };
  });
}
