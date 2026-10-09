/**
 * 列表区自适应高度的下限。
 * 小屏或高缩放比下，若「视口 − 上方内容 − 下方内容」算出来只剩几十像素，
 * 表格会被压成一条缝，所以保留一个能看见表头和几行数据的最小高度。
 */
export const MIN_TABLE_VIEWPORT_HEIGHT = 240;

export type TableViewportMetrics = {
  /** 解除高度限制后，列表容器的自然高度。 */
  naturalHeight: number;
  /** 同一状态下整页超出可视区的像素数（未超出时为 0 或负数）。 */
  overflow: number;
  minHeight?: number;
  /** 滚动容器可视高度（可选；给了才能按"剩余空间"算）。 */
  viewportHeight?: number;
  /** 表格顶部在滚动内容里的位置（相对可视区顶部，含已滚动距离）。 */
  tableTop?: number;
  /** 表格下方还有多少内容（分页条、审计条、底部内边距等）。 */
  contentBelow?: number;
};

/**
 * 算出列表容器应该占用的最大高度。
 *
 * 口径是"自然高度 − 溢出量"：把表格放开到自然高度，看整页超出一屏多少，再把超出的部分
 * 从表格高度里收回来，整页就刚好铺满视口（不出现外层滚动条，分页条也不会被挤出屏幕），
 * 同时表格仍是"容器自己滚动"，表头吸顶继续生效。
 *
 * 为什么不用"可视高度 − 表格顶部 − 表格下方内容"：页面外壳带 min-h-screen，内容不足
 * 一屏时 document 的 scrollHeight 会被撑满到视口高度，那段被撑出来的空白会被当成
 * "表格下方还有内容"，于是算出来的可用高度恰好等于表格当前高度 —— 列表会锁死在首次
 * 测量时的高度（首屏只有几行数据，就只剩几行，下面全是空白）。改看溢出量后，短内容
 * 天然溢出为 0、不会被压缩，长内容才按超出的部分收口。
 */
export function computeTableMaxHeight(metrics: TableViewportMetrics) {
  const floor = metrics.minHeight ?? MIN_TABLE_VIEWPORT_HEIGHT;
  const naturalHeight = Math.max(0, metrics.naturalHeight);
  const byOverflow = Math.ceil(naturalHeight - Math.max(0, metrics.overflow));

  const { viewportHeight, tableTop, contentBelow } = metrics;
  if (viewportHeight === undefined || tableTop === undefined || contentBelow === undefined) {
    return Math.max(floor, byOverflow);
  }

  /**
   * 按"可视高度 − 表格上方内容 − 表格下方内容"算剩余空间。
   *
   * 剩余空间比下限还小时（例如项目结算的「发票管理」标签页：主单信息 + 状态时间线 + 指标卡
   * 已经占掉大半屏），再收口只会剩两三行 —— 这时按自然高度放开，让整页滚动，
   * 用户能一次看到完整的一页数据。
   */
  const byViewport = Math.ceil(viewportHeight - tableTop - contentBelow);
  if (byViewport < floor) return naturalHeight;

  return Math.min(naturalHeight, Math.max(floor, Math.min(byOverflow, byViewport)));
}

/**
 * 判断调用方是否已经自己控高（`h-full` / `h-[...]` / `max-h-[...]`）。
 *
 * 这类表格不该再套一层整页口径的 max-height：
 * - `h-full` 的高度由外层弹性布局决定（华为云对账就是这种），两层口径会互相打架；
 * - `max-h-[...]` 是有意做的小尺寸子表，行内 max-height 会把调用方的设定顶掉。
 */
export function hasCallerHeightControl(classNames: readonly string[]) {
  return classNames.some(
    (name) => /^(h|max-h)-/.test(name) || name.includes("[height:") || name.includes("[max-height:"),
  );
}
