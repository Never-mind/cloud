import { Boxes, Cloud, ShoppingCart, type LucideIcon } from "lucide-react";

export type BusinessDomainKey = "power" | "po" | "cloud";

export type BusinessDomain = {
  key: BusinessDomainKey;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const BUSINESS_DOMAINS: BusinessDomain[] = [
  {
    key: "power",
    title: "算力系统",
    description: "客户需求、采购、物流、财务一体化后台",
    icon: Boxes,
  },
  {
    key: "po",
    title: "集采系统",
    description: "产品主档、客户 PO、报价、结算和财务",
    icon: ShoppingCart,
  },
  {
    key: "cloud",
    title: "华为云业务",
    description: "账单导入、跨月对账、收款和供应商付款",
    icon: Cloud,
  },
];

export function getBusinessDomain(key: string | null | undefined) {
  return BUSINESS_DOMAINS.find((domain) => domain.key === key) ?? BUSINESS_DOMAINS[0];
}
