const beijingFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** Sync audit DATETIME values are stored in Beijing time; never infer the browser's timezone. */
export function formatSyncTime(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return "-";
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?$/.exec(text);
  const date = new Date(local ? `${local[1]}T${local[2]}${local[3] || ":00"}+08:00` : text);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = Object.fromEntries(beijingFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
