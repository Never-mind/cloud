import { queryRows, type Row } from "./db";

/**
 * 月度汇率维护（`merge_common_exchange_rates`）。
 *
 * 口径（按业务确认）：
 *   - 方向：**1 源币种 = 汇率 × 目标币种**，例如 `USD → CNY 7.2545` 表示 1 美元折 7.2545 元，
 *     与结差里的「支付时汇率（CNY/USD）」、报价单里的「人民币兑美元汇率」同一含义；
 *   - 粒度：按账期（`YYYY-MM`）+ 币种对唯一，任意币种对都能维护，不做按国家单独覆盖；
 *   - 取数：某个账期没有维护时，**回退到该账期之前最近一次维护的值**（每月一个汇率，断月不失配）；
 *   - 用途：算力服务费核算在月账单与预付款币种不一致时折算；集采报价单默认带出汇率。
 */

export type ExchangeRateRow = {
  id: string;
  periodMonth: string;
  sourceCurrency: string;
  targetCurrency: string;
  rate: number | string;
  remark?: string | null;
};

/** 汇率查询键：`账期|源币种>目标币种`。 */
export type ExchangeRateMap = Map<string, number>;

export function normalizeCurrencyCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

/** 账期统一成 `YYYY-MM`，接受 `2026-06`、`2026-06-01`、`2026/6` 等写法。 */
export function normalizePeriodMonth(value: unknown) {
  const text = String(value ?? "").trim();
  const match = /^(\d{4})[-/.](\d{1,2})/.exec(text);
  if (!match) return "";
  const month = Number(match[2]);
  if (!(month >= 1 && month <= 12)) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

/** 日期（含时间戳）取所在账期。 */
export function toPeriodMonth(value: unknown) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  return normalizePeriodMonth(value);
}

export function buildExchangeRateId(periodMonth: string, sourceCurrency: string, targetCurrency: string) {
  return `FXR-${periodMonth}-${sourceCurrency}-${targetCurrency}`;
}

export function exchangeRateKey(periodMonth: string, sourceCurrency: string, targetCurrency: string) {
  return `${periodMonth}|${sourceCurrency}>${targetCurrency}`;
}

/** 当前账期（按上海时区，与系统其它业务日期口径一致）。 */
export function currentPeriodMonth(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}`;
}

/**
 * 规范化表单/导入进来的汇率行：账期、币种大小写统一，主键按「账期+币种对」生成，
 * 这样重复导入同一账期同一币种对时天然走更新而不是新增。
 */
export function normalizeExchangeRateInput(row: Row): Row {
  const periodMonth = normalizePeriodMonth(row.periodMonth);
  const sourceCurrency = normalizeCurrencyCode(row.sourceCurrency);
  const targetCurrency = normalizeCurrencyCode(row.targetCurrency);
  if (!periodMonth || !sourceCurrency || !targetCurrency) return row;
  return {
    ...row,
    id: buildExchangeRateId(periodMonth, sourceCurrency, targetCurrency),
    periodMonth,
    sourceCurrency,
    targetCurrency,
  };
}

export async function listExchangeRateRows() {
  return queryRows<ExchangeRateRow>(
    `SELECT id, periodMonth, sourceCurrency, targetCurrency, rate, remark
       FROM merge_common_exchange_rates
      ORDER BY periodMonth ASC, sourceCurrency ASC, targetCurrency ASC`,
  );
}

/**
 * 校验并规范化「新增/修改/导入」进来的汇率行。
 *
 * 主键按「账期 + 源币种 + 目标币种」生成，所以重复导入同一账期同一币种对
 * 命中同一主键走更新，不会产生重复行。
 */
export function prepareExchangeRateWrite(row: Row): Row {
  const periodMonth = normalizePeriodMonth(row.periodMonth);
  const sourceCurrency = normalizeCurrencyCode(row.sourceCurrency);
  const targetCurrency = normalizeCurrencyCode(row.targetCurrency);
  const rate = Number(row.rate);
  if (!periodMonth) throw new Error("账期请按 YYYY-MM 填写，例如 2026-06");
  if (!sourceCurrency || !targetCurrency) throw new Error("源币种和目标币种不能为空");
  if (sourceCurrency === targetCurrency) throw new Error("源币种和目标币种不能相同");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("汇率必须是大于 0 的数字");
  return {
    ...row,
    id: buildExchangeRateId(periodMonth, sourceCurrency, targetCurrency),
    periodMonth,
    sourceCurrency,
    targetCurrency,
    rate,
  };
}

/** 把数据库的唯一键冲突翻译成人能看懂的话。 */
export function describeExchangeRateWriteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/duplicate entry/i.test(message)) return "该账期已存在相同币种对的汇率，请直接修改已有记录";
  return message;
}

/**
 * 按需要的账期批量解析汇率：每个账期取「该账期或之前最近一次维护」的值。
 *
 * 例：只维护了 2026-06 的 USD→CNY 7.2545，查 2026-07 也会得到 7.2545；
 * 维护了 2026-06 与 2026-09 两条时，2026-07/2026-08 取 2026-06 的值。
 */
export async function buildExchangeRateMap(periods: Iterable<string>): Promise<ExchangeRateMap> {
  const wanted = Array.from(new Set(Array.from(periods).map((period) => normalizePeriodMonth(period)).filter(Boolean))).sort();
  const map: ExchangeRateMap = new Map();
  if (!wanted.length) return map;
  const rows = await listExchangeRateRows();
  for (const period of wanted) {
    for (const row of rows) {
      const rowPeriod = normalizePeriodMonth(row.periodMonth);
      if (!rowPeriod) continue;
      if (rowPeriod > period) break;
      const rate = Number(row.rate);
      if (!Number.isFinite(rate) || rate <= 0) continue;
      map.set(exchangeRateKey(period, normalizeCurrencyCode(row.sourceCurrency), normalizeCurrencyCode(row.targetCurrency)), rate);
    }
  }
  return map;
}

/** 解析单个账期的汇率（含向前回退）。 */
export async function resolveExchangeRate(periodMonth: string, sourceCurrency: string, targetCurrency: string) {
  const period = normalizePeriodMonth(periodMonth);
  const source = normalizeCurrencyCode(sourceCurrency);
  const target = normalizeCurrencyCode(targetCurrency);
  if (!period || !source || !target || source === target) return null;
  const map = await buildExchangeRateMap([period]);
  return map.get(exchangeRateKey(period, source, target)) ?? null;
}

/**
 * 从汇率表里查一对币种，没维护正方向时用反方向取倒数（例如只维护了 USD→MXN，
 * 查 MXN→USD 就用 1/rate）。
 */
export function lookupExchangeRate(map: ExchangeRateMap, periodMonth: string, sourceCurrency: string, targetCurrency: string) {
  const period = normalizePeriodMonth(periodMonth);
  const source = normalizeCurrencyCode(sourceCurrency);
  const target = normalizeCurrencyCode(targetCurrency);
  if (!period || !source || !target) return null;
  if (source === target) return 1;
  const direct = map.get(exchangeRateKey(period, source, target));
  if (direct && direct > 0) return direct;
  const inverse = map.get(exchangeRateKey(period, target, source));
  if (inverse && inverse > 0) return 1 / inverse;
  return null;
}

/**
 * 集采报价单的默认汇率（口径与报价单现有字段一致，取不到就返回 null 由调用方兜底）：
 *   - `exchangeRateUsd`：人民币兑美元汇率，1 USD = ? CNY，即月度汇率 USD→CNY；
 *   - `exchangeRateMxn`：墨西哥比索兑美元汇率，1 MXN = ? USD，即月度汇率 MXN→USD
 *     （只维护了 USD→MXN 时自动取倒数）。
 */
export async function resolveQuotationDefaultRates(periodMonth: string = currentPeriodMonth()) {
  const map = await buildExchangeRateMap([periodMonth]);
  const period = normalizePeriodMonth(periodMonth);
  return {
    periodMonth: period,
    exchangeRateUsd: lookupExchangeRate(map, period, "USD", "CNY"),
    exchangeRateMxn: lookupExchangeRate(map, period, "MXN", "USD"),
  };
}
