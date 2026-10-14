import { unzipSync } from "fflate";

/**
 * OFD 版式文件文字层抽取（数电票的 OFD / 增值税电子发票 OFD）。
 *
 * OFD 本质是个 zip：文字在 `Doc_*\/Pages\/Page_*\Content.xml` 里的 `ofd:TextObject` /
 * `ofd:TextCode` 节点上。抽取方式和 PDF 一样按坐标还原成行：
 *   - TextObject 的 Boundary="x y w h" 是对象在页面上的位置；
 *   - 一个 TextObject 内部的多个 TextCode 是同一串文字被拆开的字块（票面断行就是这样来的），
 *     拼接时**不加空格**；不同 TextObject 之间才补空格。
 * 还原出来的文本形状和 PDF 一致，所以后续直接用同一套中国增值税发票解析规则。
 *
 * OFD 坐标原点在左上、y 向下递增，所以按 y 升序排；容差 2 之内的算同一行。
 */

const LINE_TOLERANCE = 2;

type TextRun = { x: number; y: number; text: string; objectIndex: number };

function attributeOf(tag: string, name: string) {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
}

function numberOf(value: unknown) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 从单个 Content.xml 里把所有 TextObject/TextCode 按坐标拼成行。 */
export function extractOfdPageText(contentXml: string): string {
  const runs: TextRun[] = [];
  let objectIndex = -1;
  for (const match of contentXml.matchAll(/<(?:[A-Za-z0-9]*:)?TextObject\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9]*:)?TextObject>/g)) {
    objectIndex += 1;
    const boundary = attributeOf(`<TextObject ${match[1]}>`, "Boundary").trim().split(/\s+/).map(numberOf);
    const baseX = boundary[0] ?? 0;
    const baseY = boundary[1] ?? 0;
    const body = match[2];
    const codes = [...body.matchAll(/<(?:[A-Za-z0-9]*:)?TextCode\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9]*:)?TextCode>/g)];
    if (!codes.length) continue;
    for (const code of codes) {
      const text = code[2]
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      if (!text.trim()) continue;
      const attrs = `<TextCode ${code[1]}>`;
      runs.push({ x: baseX + numberOf(attributeOf(attrs, "X")), y: baseY + numberOf(attributeOf(attrs, "Y")), text, objectIndex });
    }
  }
  return buildLines(runs);
}

function buildLines(runs: TextRun[]) {
  const rows: Array<{ y: number; runs: TextRun[] }> = [];
  for (const run of [...runs].sort((left, right) => left.y - right.y)) {
    const row = rows.find((candidate) => Math.abs(candidate.y - run.y) <= LINE_TOLERANCE);
    if (row) row.runs.push(run);
    else rows.push({ y: run.y, runs: [run] });
  }
  return rows
    .map((row) => {
      // 同一个 TextObject 拆出来的字块是连着的（票面断行），不能补空格；换对象才补空格
      let text = "";
      let lastObject: number | null = null;
      for (const run of row.runs.sort((left, right) => left.x - right.x)) {
        if (lastObject !== null && lastObject !== run.objectIndex && !text.endsWith(" ")) text += " ";
        text += run.text;
        lastObject = run.objectIndex;
      }
      return text.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n");
}

/** 读取 OFD（zip）里所有页面的文字，按页返回。 */
export function extractOfdPages(bytes: Buffer | Uint8Array): string[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(bytes));
  } catch {
    throw new Error("这个文件不是有效的 OFD（无法解压）");
  }
  const decoder = new TextDecoder("utf-8");
  const pageEntries = Object.keys(files)
    .filter((name) => /(^|\/)Content\.xml$/i.test(name) && /pages?\//i.test(name))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  const targets = pageEntries.length ? pageEntries : Object.keys(files).filter((name) => /(^|\/)Content\.xml$/i.test(name));
  if (!targets.length) throw new Error("这个 OFD 里没有找到页面内容（Content.xml）");
  return targets.map((name) => extractOfdPageText(decoder.decode(files[name])));
}
