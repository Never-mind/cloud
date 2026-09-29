import { describe, expect, it } from "vitest";
import { daysBetween, renderNotificationTemplate } from "./notification-service";

describe("renderNotificationTemplate", () => {
  it("替换已知变量", () => {
    const rendered = renderNotificationTemplate("项目 {项目号}（客户：{客户}）已过 {已过天数} 天", {
      项目号: "PJ-001",
      客户: "Llama",
      已过天数: "3",
    });

    expect(rendered).toBe("项目 PJ-001（客户：Llama）已过 3 天");
  });

  it("未知变量原样保留，方便配置人发现拼写错误", () => {
    expect(renderNotificationTemplate("{不存在的变量}", {})).toBe("{不存在的变量}");
  });

  it("允许变量值里带花括号之外的任意文本", () => {
    expect(renderNotificationTemplate("{客户}", { 客户: "Afore banorte S.A. de C.V." }))
      .toBe("Afore banorte S.A. de C.V.");
  });
});

describe("daysBetween", () => {
  it("按自然日计算，跨零点算 1 天", () => {
    expect(daysBetween(new Date(2026, 8, 11, 17, 50), new Date(2026, 8, 12, 0, 5))).toBe(1);
  });

  it("同一天内任意时刻都算 0 天", () => {
    expect(daysBetween(new Date(2026, 8, 11, 0, 1), new Date(2026, 8, 11, 23, 59))).toBe(0);
  });

  it("跨月跨年正常计算", () => {
    expect(daysBetween(new Date(2026, 8, 30), new Date(2026, 9, 3))).toBe(3);
    expect(daysBetween(new Date(2026, 11, 31), new Date(2027, 0, 1))).toBe(1);
  });
});
