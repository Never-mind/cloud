"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { applyLockedColumns, getTableLockStorageKey, readLockedColumns } from "./table-column-menu";
import { computeTableMaxHeight } from "@/lib/table-viewport-height";

type TableElementProps = {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
};

type StickyTableProps = {
  children: ReactNode;
  className: string;
  tableKey?: string;
  topOffset?: number;
};

type StickyMetrics = {
  left: number;
  width: number;
  tableWidth: number;
  scrollLeft: number;
  stuck: boolean;
  columnWidths: number[];
};

const DEFAULT_HEADER_HEIGHT = 48;

/** 找到真正负责滚动的祖先：iframe 内通常是 documentElement，首页这类嵌套布局则是内层容器。 */
function findScrollContainer(element: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = element.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * 弹层（抽屉/弹窗）里的表格不参与整页高度自适应。
 * 那些容器的可用高度由弹层自己决定，按整页口径去算会把表格压得极小。
 */
function isInsideFixedOverlay(element: HTMLElement) {
  let node: HTMLElement | null = element.parentElement;
  while (node && node !== document.body) {
    if (window.getComputedStyle(node).position === "fixed") return true;
    node = node.parentElement;
  }
  return false;
}

function getStaticText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getStaticText).join("");
  if (isValidElement<TableElementProps>(node)) return getStaticText(node.props.children);
  return "";
}

function getActionColumnIndexes(table: HTMLTableElement) {
  const headerRow = table.tHead?.rows[0];
  if (!headerRow) return [];

  const indexes: number[] = [];
  let columnIndex = 0;
  for (const cell of Array.from(headerRow.cells)) {
    const span = Math.max(cell.colSpan || 1, 1);
    if (cell.tagName === "TH" && (cell.textContent ?? "").replace(/\s+/g, "").trim() === "操作") {
      for (let offset = 0; offset < span; offset += 1) indexes.push(columnIndex + offset);
    }
    columnIndex += span;
  }
  return indexes;
}

function markActionColumns(table: HTMLTableElement) {
  const actionIndexes = new Set(getActionColumnIndexes(table));
  if (!actionIndexes.size) return;

  for (const row of Array.from(table.rows)) {
    let columnIndex = 0;
    for (const cell of Array.from(row.cells)) {
      const span = Math.max(cell.colSpan || 1, 1);
      const isActionCell = span === 1 && actionIndexes.has(columnIndex);
      if (isActionCell) cell.dataset.cloudPowerActionColumn = "1";
      else delete cell.dataset.cloudPowerActionColumn;
      columnIndex += span;
    }
  }
}

function getTableChildren(table: ReactElement<TableElementProps>) {
  return Children.toArray(table.props.children);
}

function cloneHeaderNode(
  node: ReactNode,
  columnWidths: number[],
  columnIndex: { value: number },
  actionTranslateX?: number,
): ReactNode {
  if (!isValidElement<TableElementProps>(node)) return node;

  if (node.type === "th") {
    const width = columnWidths[columnIndex.value];
    const isActionHeader = getStaticText(node.props.children).replace(/\s+/g, "").trim() === "操作";
    columnIndex.value += 1;
    if (!width) return node;
    return cloneElement(node, {
      ...(isActionHeader ? { "data-cloud-power-action-column": "1" } : {}),
      style: {
        ...node.props.style,
        width,
        minWidth: width,
        maxWidth: width,
        ...(isActionHeader && actionTranslateX !== undefined
          ? {
              position: "relative",
              right: "auto",
              zIndex: 35,
              backgroundColor: "#f5f7fa",
              transform: `translateX(${actionTranslateX}px)`,
            }
          : {}),
      },
    });
  }

  if (!node.props.children) return node;
  return cloneElement(node, {
    children: Children.map(node.props.children, (child) => cloneHeaderNode(child, columnWidths, columnIndex, actionTranslateX)),
  });
}

function getHeaderChildren(table: ReactElement<TableElementProps>, columnWidths: number[], actionTranslateX?: number) {
  const columnIndex = { value: 0 };
  return getTableChildren(table)
    .filter((child) => isValidElement(child) && child.type === "thead")
    .map((child) => cloneHeaderNode(child, columnWidths, columnIndex, actionTranslateX));
}

function withTableId(
  table: ReactElement<TableElementProps>,
  tableId: string,
  children: ReactNode,
  width?: number,
) {
  return cloneElement(table, {
    "data-cloud-power-table-id": tableId,
    children,
    ...(width
      ? {
          style: {
            ...table.props.style,
            width,
            minWidth: width,
          },
        }
      : {}),
  });
}

/**
 * Keeps page-level vertical scrolling while providing a real fixed header for
 * horizontally scrollable tables. The header is rendered once more only while
 * the table is crossing the top of the viewport, so its controls remain live.
 */
export function StickyTable({ children, className, tableKey, topOffset = 0 }: StickyTableProps) {
  const generatedTableKey = useId().replace(/:/g, "");
  const stableTableKey = tableKey || `table-${generatedTableKey}`;
  const regionRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerViewportRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(DEFAULT_HEADER_HEIGHT);
  const [metrics, setMetrics] = useState<StickyMetrics>({
    left: 0,
    width: 0,
    tableWidth: 0,
    scrollLeft: 0,
    stuck: false,
    columnWidths: [],
  });

  useEffect(() => {
    const region = regionRef.current;
    const body = bodyRef.current;
    if (!region || !body) return;

    let animationFrame = 0;
    const refresh = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const regionRect = region.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        const headerRow = body.querySelector<HTMLTableRowElement>("thead tr");
        const columnWidths = headerRow
          ? Array.from(headerRow.cells).map((cell) => Math.ceil(cell.getBoundingClientRect().width))
          : [];
        const next: StickyMetrics = {
          left: bodyRect.left,
          width: body.clientWidth,
          tableWidth: Math.max(body.scrollWidth, body.clientWidth),
          scrollLeft: body.scrollLeft,
          stuck: regionRect.top <= topOffset && regionRect.bottom > topOffset + headerHeight,
          columnWidths,
        };
        setMetrics((current) =>
          current.left === next.left
            && current.width === next.width
            && current.tableWidth === next.tableWidth
            && current.scrollLeft === next.scrollLeft
            && current.stuck === next.stuck
            && current.columnWidths.length === next.columnWidths.length
            && current.columnWidths.every((width, index) => width === next.columnWidths[index])
            ? current
            : next,
        );
      });
    };

    body.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("scroll", refresh, { passive: true, capture: true });
    window.addEventListener("resize", refresh);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh);
    observer?.observe(region);
    observer?.observe(body);
    refresh();

    return () => {
      body.removeEventListener("scroll", refresh);
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
      observer?.disconnect();
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [headerHeight, topOffset]);

  /**
   * 列表高度自适应。
   *
   * 历史上这里用 CSS 里的 `calc(100dvh - 210px)` 写死预留值，但列表页表格上下
   * 的固定内容（页头、工具栏、分页条、页面内边距，还可能有提示条）加起来通常
   * 超过 210px，于是整页比 iframe 视口高出一截：出现第二根外层滚动条，分页区被
   * 挤到屏幕外，而 `.table-viewport` 上的 `overscroll-behavior: contain` 又把滚动
   * 锁在列表内部，只能把鼠标移到外层区域才能继续滚。
   *
   * 这里改成按实际测量算：max-height = 滚动容器可视高度 − 表格顶部偏移 − 表格下方剩余内容。
   * 结果让整页刚好铺满视口，既保住表头吸顶（容器自己滚动），又不会产生外层滚动条。
   */
  useEffect(() => {
    const viewport = bodyRef.current;
    if (!viewport) return;
    let frame = 0;
    let appliedHeight = -1;

    const fit = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const element = bodyRef.current;
        if (!element) return;
        if (isInsideFixedOverlay(element)) return;

        const scroller = findScrollContainer(element) ?? document.documentElement;
        const scrollerRect = scroller === document.documentElement
          ? { top: 0, height: document.documentElement.clientHeight || window.innerHeight }
          : scroller.getBoundingClientRect();
        const scrollTop = scroller === document.documentElement
          ? window.scrollY || document.documentElement.scrollTop || 0
          : scroller.scrollTop;
        const rect = element.getBoundingClientRect();
        const nextHeight = computeTableMaxHeight({
          viewportTop: scrollerRect.top,
          viewportHeight: scrollerRect.height,
          tableTop: rect.top,
          tableBottom: rect.bottom,
          scrollTop,
          contentHeight: scroller.scrollHeight,
        });
        if (Math.abs(nextHeight - appliedHeight) < 1) return;
        appliedHeight = nextHeight;
        element.style.maxHeight = `${nextHeight}px`;
      });
    };

    fit();
    // 口径与滚动位置无关（rect 与 scrollTop 同步变化会互相抵消），所以不用监听 scroll。
    window.addEventListener("resize", fit);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(viewport);
    if (document.body) observer?.observe(document.body);

    return () => {
      window.removeEventListener("resize", fit);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Mark the action column in both the source table and its fixed-header copy.
  // This also covers rows rendered by child components, which are not visible
  // to the React tree walker used to build the cloned header.
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;

    const markTables = () => {
      region.querySelectorAll<HTMLTableElement>("table").forEach(markActionColumns);
    };
    markTables();
    const observer = new MutationObserver(markTables);
    observer.observe(region, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // The fixed header is a second DOM table. Re-apply persisted column locks
  // after it is mounted or rebuilt while scrolling horizontally/vertically.
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const refreshLockedTables = () => {
      region.querySelectorAll<HTMLTableElement>("table[data-cloud-power-table-id]").forEach((table) => {
        applyLockedColumns(table, readLockedColumns(getTableLockStorageKey(table)));
      });
    };
    refreshLockedTables();
    const frame = window.requestAnimationFrame(refreshLockedTables);
    return () => window.cancelAnimationFrame(frame);
  }, [metrics.columnWidths, metrics.scrollLeft, metrics.stuck, metrics.tableWidth]);

  useEffect(() => {
    if (!metrics.stuck || !headerViewportRef.current) return;
    const measuredHeight = Math.ceil(headerViewportRef.current.getBoundingClientRect().height);
    if (measuredHeight > 0 && measuredHeight !== headerHeight) setHeaderHeight(measuredHeight);
  }, [headerHeight, metrics.stuck]);

  const childNodes = Children.toArray(children);
  const tableIndex = childNodes.findIndex((child) => isValidElement<TableElementProps>(child) && child.type === "table");
  const table = tableIndex >= 0 ? childNodes[tableIndex] as ReactElement<TableElementProps> : null;

  if (!table) {
    return <div ref={bodyRef} className={className}>{children}</div>;
  }

  const extraChildren = childNodes.filter((_, index) => index !== tableIndex);

  const headerTable = withTableId(
    table,
    stableTableKey,
    getHeaderChildren(
      table,
      metrics.columnWidths,
      metrics.width > 0 && metrics.tableWidth > 0
        ? metrics.width - metrics.tableWidth + metrics.scrollLeft
        : undefined,
    ),
    metrics.tableWidth || undefined,
  );
  const bodyTable = withTableId(table, stableTableKey, table.props.children);

  return (
    <div ref={regionRef} className="sticky-table-region min-w-0 max-w-full">
      <div ref={bodyRef} className={className}>
        {bodyTable}
        {extraChildren}
      </div>
      {metrics.stuck ? (
        <div
          className="pointer-events-auto fixed z-[60] overflow-hidden border border-line bg-white shadow-sm"
          style={{
            left: metrics.left,
            top: topOffset,
            width: metrics.width,
          }}
        >
          <div ref={headerViewportRef} className="overflow-hidden">
            <div style={{ width: metrics.tableWidth, transform: `translateX(-${metrics.scrollLeft}px)` }}>
              {headerTable}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
