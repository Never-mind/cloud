/**
 * 列表区自适应高度的下限。
 * 小屏或高缩放比下，若「视口 − 上方内容 − 下方内容」算出来只剩几十像素，
 * 表格会被压成一条缝，所以保留一个能看见表头和几行数据的最小高度。
 */
export const MIN_TABLE_VIEWPORT_HEIGHT = 240;

export type TableViewportMetrics = {
  /** 滚动容器可视区顶部（视口坐标）。 */
  viewportTop: number;
  /** 滚动容器可视区高度。 */
  viewportHeight: number;
  /** 表格滚动容器顶部（视口坐标）。 */
  tableTop: number;
  /** 表格滚动容器底部（视口坐标）。 */
  tableBottom: number;
  /** 滚动容器当前滚动量。 */
  scrollTop: number;
  /** 滚动容器内容总高。 */
  contentHeight: number;
  minHeight?: number;
};

/**
 * 算出列表容器应该占用的最大高度。
 *
 * 目标是让整页刚好铺满视口：这样既不会多出一根外层滚动条，分页条也不会被挤出屏幕，
 * 同时表格仍然是"容器自己滚动"，表头吸顶继续生效。
 *
 * 口径：可视高度 − 表格顶部在滚动容器内的偏移 − 表格下方剩余内容。
 * 全部换算到"滚动容器内容坐标"后再相减，因此与当前滚动位置无关，结果稳定。
 */
export function computeTableMaxHeight(metrics: TableViewportMetrics) {
  const topInScroller = metrics.tableTop - metrics.viewportTop + metrics.scrollTop;
  const bottomInScroller = metrics.tableBottom - metrics.viewportTop + metrics.scrollTop;
  const belowInScroller = Math.max(0, metrics.contentHeight - bottomInScroller);
  const available = metrics.viewportHeight - topInScroller - belowInScroller;
  return Math.max(metrics.minHeight ?? MIN_TABLE_VIEWPORT_HEIGHT, Math.floor(available));
}
