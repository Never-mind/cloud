/**
 * 功能模块搜索。
 *
 * 新用户常常"知道要干什么，但不知道在哪个菜单"（财务管理下就有 11 个同前缀模块），
 * 所以支持三种匹配方式取并集：中文名包含、拼音首字母包含、业务别名命中。
 *
 * 索引来源是**已经按功能开关与权限过滤过的**导航树，因此停用的功能天然搜不到。
 */

export type ModuleSearchEntry = {
  key: string;
  title: string;
  route: string;
  description: string;
  /** 一级目录，例如「算力系统」。 */
  domain: string;
  /** 二级目录，例如「月账单管理」。 */
  group: string;
};

export type ModuleSearchHit = ModuleSearchEntry & { score: number };

type NavItemLike = {
  key: string;
  title: string;
  route?: string;
  description?: string;
  hidden?: boolean;
};

type NavGroupLike = {
  title: string;
  items?: NavItemLike[];
  children?: NavGroupLike[];
};

/**
 * 模块名 → 拼音首字母。
 * 静态表而不是引 pinyin 库：模块数量可控，改动会被 module-search 的测试守住。
 */
const PINYIN_INITIALS: Record<string, string> = {
  华为云对账: "hwydz",
  发票汇总: "fphz",
  客户产品别名: "khcbm",
  产品类别: "cplb",
  产品主档: "cpzd",
  客户PO: "khpo",
  报价单: "bjd",
  历史报价: "lsbj",
  项目结算: "xmjs",
  采购订单: "cgdd",
  采购明细一览: "cgmxyl",
  B6类型规则: "b6lxgz",
  "CAPEX/OPEX锚定价格": "capexopexmdjg",
  实例结差: "sljc",
  非实例费用结差: "fslfyjc",
  结差结算单: "jcjsd",
  服务费核算: "fwfhs",
  服务费对账单: "fwfdzd",
  服务费对账单明细: "fwfdzdmx",
  实例合同: "slht",
  实例合同调整单: "slhttzd",
  国家管理: "gjgl",
  实例型号: "slxh",
  预付款合同明细: "yfkhtmx",
  核销明细: "hxmx",
  需求单: "xqd",
  需求明细一览: "xqmxyl",
  需求同步映射: "xqtbys",
  数据导入中心: "sjdrzx",
  物流列表: "wllb",
  待生成预付款实例: "dscyfksl",
  预付款合同: "yfkht",
  预付款每月核销明细: "yfkmyhxmx",
  预付款核销调整单: "yfkhxtzd",
  待生成月账单实例: "dscyzdsl",
  月账单合同: "yzdht",
  月账单每月明细: "yzdmymx",
  月账单对账单: "yzddzd",
  文档库: "wdk",
  供应商管理: "gysgl",
  客户管理: "khgl",
  承接单位管理: "cjdwgl",
  功能启用: "gnqy",
  账户管理: "zhgl",
};

/** 业务别名：用户嘴里怎么说，就让他搜得到。 */
const MODULE_ALIASES: Array<[string, string[]]> = [
  ["物流列表", ["交单", "发货", "运单", "提单", "物流单"]],
  // "台账"保留为别名：老叫法已经叫顺口了，改名后照样搜得到。
  ["月账单合同", ["月账", "出账", "开账", "台账", "账单合同"]],
  ["待生成月账单实例", ["生成账单", "待生成", "账单实例"]],
  ["月账单对账单", ["对账", "核对"]],
  ["月账单每月明细", ["月账明细", "逐月"]],
  ["发票汇总", ["开票", "发票", "票据"]],
  ["预付款合同", ["预付", "预付合同"]],
  ["待生成预付款实例", ["待生成预付", "预付实例"]],
  ["预付款每月核销明细", ["核销", "抵扣", "冲销"]],
  ["预付款核销调整单", ["核销调整", "调整单"]],
  ["服务费核算", ["服务费", "服务费测算"]],
  ["服务费对账单", ["服务费对账", "对账单"]],
  ["项目结算", ["结差", "项目结差", "结算"]],
  ["实例结差", ["结差", "实例差价"]],
  ["非实例费用结差", ["结差", "费用结差"]],
  ["结差结算单", ["结差", "结算单"]],
  ["实例合同", ["合同", "实例合同"]],
  ["实例合同调整单", ["合同调整", "调整单"]],
  ["实例型号", ["型号", "机型", "物料"]],
  ["数据导入中心", ["导入", "模板", "导入模板"]],
  ["功能启用", ["权限", "开关", "功能"]],
  ["账户管理", ["用户", "账号", "用户管理"]],
  ["华为云对账", ["华为", "华为云", "云对账"]],
  ["客户PO", ["客户订单"]],
  ["报价单", ["报价", "询价"]],
  ["历史报价", ["历史价格", "报价历史"]],
  ["采购订单", ["采购", "下单"]],
  ["采购明细一览", ["采购明细", "采购单明细"]],
  ["需求单", ["需求"]],
  ["需求明细一览", ["需求明细", "需求子表"]],
  ["需求同步映射", ["同步映射", "映射", "远端同步"]],
  ["产品主档", ["产品", "主档", "产品档案"]],
  ["产品类别", ["类别", "分类"]],
  ["客户产品别名", ["别名", "产品别名"]],
  ["国家管理", ["国家", "地区"]],
  ["供应商管理", ["供应商", "厂商"]],
  ["客户管理", ["客户"]],
  ["承接单位管理", ["承接单位", "承接方", "单位"]],
  ["文档库", ["文档", "文件", "附件"]],
  ["核销明细", ["核销明细", "逐月核销"]],
  ["预付款合同明细", ["预付合同明细"]],
  ["B6类型规则", ["B6", "类型规则", "规则"]],
  ["CAPEX/OPEX锚定价格", ["锚定", "锚定价格", "CAPEX", "OPEX", "价格"]],
];

const ALIASES_BY_TITLE = new Map(MODULE_ALIASES);

/** 把导航树摊平成可搜索的模块列表。传入的应已是过滤后的树。 */
export function buildModuleSearchIndex(groups: NavGroupLike[]): ModuleSearchEntry[] {
  const entries: ModuleSearchEntry[] = [];
  const seen = new Set<string>();

  function visit(domain: string, group: string, node: NavGroupLike) {
    for (const item of node.items ?? []) {
      if (!item.route || item.hidden || seen.has(item.key)) continue;
      seen.add(item.key);
      entries.push({
        key: item.key,
        title: item.title,
        route: item.route,
        description: item.description ?? "",
        domain,
        group: group || node.title,
      });
    }
    for (const child of node.children ?? []) visit(domain, child.title, child);
  }

  for (const group of groups) visit(group.title, group.title, group);
  return entries;
}

export function modulePinyinInitials(title: string) {
  return PINYIN_INITIALS[title] ?? "";
}

export function moduleAliases(title: string) {
  return ALIASES_BY_TITLE.get(title) ?? [];
}

function scoreEntry(entry: ModuleSearchEntry, keyword: string) {
  const title = entry.title.toLowerCase();
  if (title === keyword) return 100;
  if (title.startsWith(keyword)) return 90;
  if (title.includes(keyword)) return 80;

  const pinyin = modulePinyinInitials(entry.title).toLowerCase();
  if (pinyin.startsWith(keyword)) return 70;
  if (pinyin.includes(keyword)) return 60;

  const aliases = moduleAliases(entry.title).map((alias) => alias.toLowerCase());
  if (aliases.includes(keyword)) return 58;
  if (aliases.some((alias) => alias.includes(keyword))) return 50;

  if (entry.group.toLowerCase().includes(keyword)) return 30;
  return 0;
}

/**
 * 按关键词搜索模块；空关键词返回全部（按目录顺序）。
 * 排序：完全匹配 > 前缀 > 名称包含 > 拼音 > 别名 > 所属二级目录。
 */
export function searchModules(query: string, entries: ModuleSearchEntry[]): ModuleSearchHit[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return entries.map((entry) => ({ ...entry, score: 0 }));
  return entries
    .map((entry) => ({ ...entry, score: scoreEntry(entry, keyword) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "zh"));
}
