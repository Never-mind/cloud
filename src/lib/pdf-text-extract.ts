import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * PDF 文字层抽取（发票识别用）。
 *
 * 为什么要自己按坐标拼行：pdfjs 默认的 `getTextContent()` 是按内容流顺序吐文字块的，
 * 电子发票那种"左侧购买方、右侧销售方、金额靠右"的版式会被打乱成"标签一行、值一行"，
 * 规则根本没法定位字段。这里按 y 坐标分行、x 坐标排序，并只在字间空隙足够大时才补空格，
 * 得到的结果和 pdfplumber 的 extract_text 基本一致，识别规则可以按行写。
 *
 * 抽不到文字层（扫描件、纯图片 PDF）时返回空字符串，由上层提示用户改走 OCR。
 */

/** 同一行的 y 容差：发票正文行距一般 ≥10，金额与单位标签之间会差 1~2，取 2 刚好。 */
const LINE_TOLERANCE = 2;
/** 字间空隙超过这个值才补空格，否则会插进数字中间（742.57 被拆成 "742. 5 7"）。 */
const SPACE_GAP = 1;

type PdfTextItem = {
  str: string;
  width: number;
  transform: number[];
};

export async function extractPdfPages(bytes: Buffer | Uint8Array): Promise<string[]> {
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false }).promise;
  try {
    const pages: string[] = [];
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const rows: Array<{ y: number; items: PdfTextItem[] }> = [];
      for (const raw of content.items) {
        const item = raw as unknown as PdfTextItem & { str?: string };
        if (typeof item.str !== "string" || !item.str) continue;
        const y = item.transform[5];
        const row = rows.find((candidate) => Math.abs(candidate.y - y) <= LINE_TOLERANCE);
        if (row) row.items.push(item);
        else rows.push({ y, items: [item] });
      }
      pages.push(rows
        .sort((left, right) => right.y - left.y)
        .map((row) => {
          const items = row.items.sort((left, right) => left.transform[4] - right.transform[4]);
          let text = "";
          let endX: number | null = null;
          for (const item of items) {
            const startX = item.transform[4];
            if (endX !== null && startX - endX > SPACE_GAP) text += " ";
            text += item.str;
            endX = startX + item.width;
          }
          return text.replace(/\s+/g, " ").trim();
        })
        .filter(Boolean)
        .join("\n"));
    }
    return pages;
  } finally {
    await document.destroy();
  }
}
