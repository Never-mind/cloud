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
  const overflow = Math.max(0, metrics.overflow);
  return Math.max(metrics.minHeight ?? MIN_TABLE_VIEWPORT_HEIGHT, Math.ceil(metrics.naturalHeight - overflow));
}
