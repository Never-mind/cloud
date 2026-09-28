/**
 * 华为云账单导入的表头解析。
 *
 * 单独拆出来是为了能直接单测：别名表里写的是「万众结算毛利（USD）」这种
 * 全角括号 + 大写币种的写法，外部文件只要写成半角括号、小写 usd 或多一个空格，
 * 原来那种"小写去空格后精确匹配"就匹配不上，那一列会被静默丢掉 —— 数值全部落成 0，
 * 页面上看起来像"这个月没有数据"。这里把大小写、空格、全/半角括号和末尾币种后缀
 * 统一抹平再匹配，并在解不出来时让调用方提示用户"这一列没被识别"。
 */
export type CloudImportFieldMap = Record<string, string>;

export function normalizeCloudImportHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\((?:usd|cny|rmb|us\$|美金|美元)\)$/g, "");
}

/** 归一化表头 → 字段。多个别名归一到同一字段时保留先出现的那个。 */
export function buildCloudImportFieldMap(aliases: Record<string, string>): CloudImportFieldMap {
  const map: CloudImportFieldMap = {};
  for (const [alias, field] of Object.entries(aliases)) {
    const key = normalizeCloudImportHeader(alias);
    if (key && !map[key]) map[key] = field;
  }
  return map;
}

/** 解析表头对应的字段；解不出来返回 null（调用方据此提示用户该列没被识别）。 */
export function resolveCloudImportField(header: string, map: CloudImportFieldMap) {
  return map[normalizeCloudImportHeader(header)] ?? null;
}
