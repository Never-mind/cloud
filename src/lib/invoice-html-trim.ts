/**
 * 裁掉票面右侧的空白列。
 *
 * BI 的模板是 Excel 导出的 HTML：整个票面是一张 `table-layout:fixed` 的大表，
 * 每行末尾都跟着一串只是为了对齐的空单元格（很多还带 colspan），把表格撑到 1069.5pt
 * ——打印/转 PDF 时会看到右边一大片空白。
 *
 * 这里的做法：找出**所有行里都是空**的尾部列（列宽按 colspan 均摊估算），
 * 把覆盖这些列的单元格删掉或收窄 colspan，再把表格总宽度减去这部分宽度。
 * 只有"整列在每一行都空"才会被裁，所以不会误删有内容的格子。
 */

type Cell = {
  /** 在行内的原始片段 */
  html: string;
  colspan: number;
  width: number;
  empty: boolean;
};

function parseCells(rowHtml: string) {
  const cells: Cell[] = [];
  const pattern = /<td\b[^>]*>[\s\S]*?<\/td>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rowHtml))) {
    const html = match[0];
    const openTag = html.slice(0, html.indexOf(">") + 1);
    const colspan = Math.max(1, Number(/colspan="(\d+)"/i.exec(openTag)?.[1] ?? 1));
    const width = Number(/width="(\d+)"/i.exec(openTag)?.[1] ?? 0);
    const text = html
      .slice(html.indexOf(">") + 1)
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, "")
      .replace(/\s+/g, "");
    cells.push({ html, colspan, width, empty: text === "" });
  }
  return cells;
}

export function trimTrailingEmptyColumns(html: string) {
  const tableStart = html.indexOf("<table");
  if (tableStart === -1) return html;
  const openTagEnd = html.indexOf(">", tableStart);
  const tableEnd = html.lastIndexOf("</table>");
  if (openTagEnd === -1 || tableEnd === -1 || tableEnd < openTagEnd) return html;

  const openTag = html.slice(tableStart, openTagEnd + 1);
  const body = html.slice(openTagEnd + 1, tableEnd);
  const declaredWidth = Number(/width="(\d+)"/i.exec(openTag)?.[1] ?? 0);

  const rowPattern = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
  const rows: { html: string; cells: Cell[]; columns: number; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(body))) {
    const cells = parseCells(match[0]);
    rows.push({
      html: match[0],
      cells,
      columns: cells.reduce((sum, cell) => sum + cell.colspan, 0),
      index: match.index,
    });
  }
  if (!rows.length) return html;

  const maxColumns = Math.max(...rows.map((row) => row.columns));
  // 逐列判断"是否所有行都是空的"
  const columnEmpty: boolean[] = Array.from({ length: maxColumns }, () => true);
  const columnWidth: number[] = Array.from({ length: maxColumns }, () => 0);
  for (const row of rows) {
    let column = 0;
    for (const cell of row.cells) {
      const share = cell.width > 0 ? cell.width / cell.colspan : 0;
      for (let offset = 0; offset < cell.colspan && column + offset < maxColumns; offset += 1) {
        if (!cell.empty) columnEmpty[column + offset] = false;
        columnWidth[column + offset] = Math.max(columnWidth[column + offset], Math.round(share));
      }
      column += cell.colspan;
    }
  }

  let keepColumns = maxColumns;
  while (keepColumns > 0 && columnEmpty[keepColumns - 1]) keepColumns -= 1;
  if (keepColumns === 0 || keepColumns === maxColumns) return html;

  const removedWidth = columnWidth.slice(keepColumns).reduce((sum, value) => sum + value, 0);
  const newWidth = Math.max(1, declaredWidth - removedWidth);

  const rebuildRow = (rowHtml: string) => {
    const cells = parseCells(rowHtml);
    let column = 0;
    const kept: string[] = [];
    for (const cell of cells) {
      const start = column;
      const end = column + cell.colspan; // 独占的列区间 [start, end)
      column = end;
      if (start >= keepColumns) continue; // 整个格子都在被裁掉的区域里
      if (end <= keepColumns) {
        kept.push(cell.html);
        continue;
      }
      // 横跨裁剪线的格子：收窄 colspan，并按比例扣掉宽度
      const keptSpan = keepColumns - start;
      const removedSpan = cell.colspan - keptSpan;
      const removedPart = cell.width > 0 ? Math.round((cell.width / cell.colspan) * removedSpan) : 0;
      let html = cell.html;
      if (cell.colspan > 1) {
        html = html.replace(/colspan="\d+"/i, `colspan="${keptSpan}"`);
        if (keptSpan === 1 && /mso-ignore:colspan/i.test(html)) {
          html = html.replace(/colspan="1"\s*/i, "");
        }
      }
      if (cell.width > 0 && removedPart > 0) {
        const nextWidth = Math.max(1, cell.width - removedPart);
        html = html.replace(/width="\d+"/i, `width="${nextWidth}"`);
      }
      kept.push(html);
    }
    const openTag = /<tr\b[^>]*>/i.exec(rowHtml)?.[0] ?? "<tr>";
    return `${openTag}${kept.join("")}</tr>`;
  };

  let nextBody = "";
  let cursor = 0;
  for (const row of rows) {
    nextBody += body.slice(cursor, row.index) + rebuildRow(row.html);
    cursor = row.index + row.html.length;
  }
  nextBody += body.slice(cursor);

  // 表格总宽度与 pt 值一起改小；同时把多余的 <col> 定义去掉
  const nextOpenTag = openTag
    .replace(/width="\d+"/i, `width="${newWidth}"`)
    .replace(/width:[\d.]+pt/i, `width:${(newWidth * 0.75).toFixed(2)}pt`);
  let nextHead = nextBody;
  const colPattern = /<col\b[^>]*\/?>/gi;
  const cols = [...nextHead.matchAll(colPattern)];
  if (cols.length > keepColumns) {
    let removed = 0;
    nextHead = nextHead.replace(colPattern, (colHtml) => {
      removed += 1;
      return removed > keepColumns ? "" : colHtml;
    });
  }

  return `${html.slice(0, tableStart)}${nextOpenTag}${nextHead}</table>${html.slice(tableEnd + 8)}`;
}
