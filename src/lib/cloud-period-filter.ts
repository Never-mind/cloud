export class CloudPeriodFilterError extends Error {}

function normalizedMonth(value: string, label: string) {
  const raw = value.trim();
  if (!raw || raw === "all") return "";
  if (!/^\d{4}(?:[-/]?)(?:0[1-9]|1[0-2])$/.test(raw)) {
    throw new CloudPeriodFilterError(`${label}格式应为 YYYY-MM`);
  }
  return raw.replace(/[-/]/g, "");
}

export function getCloudPeriodRangeError(from: string, to: string) {
  try {
    const start = normalizedMonth(from, "开始账期");
    const end = normalizedMonth(to, "结束账期");
    return start && end && start > end ? "开始账期不能晚于结束账期" : "";
  } catch (error) {
    return error instanceof Error ? error.message : "账期格式错误";
  }
}

/** Inclusive month bounds. Empty endpoints remain unbounded; old period links stay supported. */
export function appendCloudPeriodConditions(
  params: URLSearchParams,
  conditions: string[],
  values: Record<string, unknown>,
  expression = "REPLACE(REPLACE(TRIM(COALESCE(period, '')), '-', ''), '/', '')",
) {
  const from = normalizedMonth(params.get("periodFrom") ?? "", "开始账期");
  const to = normalizedMonth(params.get("periodTo") ?? "", "结束账期");
  if (from && to && from > to) throw new CloudPeriodFilterError("开始账期不能晚于结束账期");
  if (from || to) {
    if (from) { conditions.push(`${expression} >= :periodFrom`); values.periodFrom = from; }
    if (to) { conditions.push(`${expression} <= :periodTo`); values.periodTo = to; }
    return;
  }
  const period = normalizedMonth(params.get("period") ?? "", "账期");
  if (period) { conditions.push(`${expression} = :period`); values.period = period; }
}
