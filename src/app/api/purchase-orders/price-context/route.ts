import { NextRequest, NextResponse } from "next/server";
import { getPowerPriceDefaults } from "@/lib/power-price-calculator";
import { isPurchaseItemPowerPricingStorageReady, listInstanceContractPriceReferences } from "@/lib/purchase-power-pricing-service";

export async function GET(request: NextRequest) {
  try {
    const countryCode = request.nextUrl.searchParams.get("countryCode") ?? "";
    const deviceCode = request.nextUrl.searchParams.get("deviceCode") ?? "";
    const b6Type = request.nextUrl.searchParams.get("b6Type") ?? "";
    const purchaseCurrency = request.nextUrl.searchParams.get("purchaseCurrency") ?? "";
    const taxExcludedUnitPrice = Number(request.nextUrl.searchParams.get("taxExcludedUnitPrice") ?? 0);
    const taxSurcharge = Number(request.nextUrl.searchParams.get("taxSurcharge") ?? 0);
    const exchangeRate = Number(request.nextUrl.searchParams.get("exchangeRate") ?? 0);
    if (!countryCode.trim()) return NextResponse.json({ error: "请先选择带有国家信息的需求单明细。" }, { status: 400 });
    if (!deviceCode.trim()) return NextResponse.json({ error: "设备编码不能为空。" }, { status: 400 });

    const context = {
      countryCode,
      deviceCode,
      b6Type,
      purchaseCurrency,
      taxExcludedUnitPrice,
      taxSurcharge,
      exchangeRate,
    };
    const [history, storageReady] = await Promise.all([
      listInstanceContractPriceReferences(countryCode, deviceCode),
      isPurchaseItemPowerPricingStorageReady(),
    ]);
    return NextResponse.json({ defaults: getPowerPriceDefaults(context), history, storageReady });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "算力服务费测算数据加载失败" },
      { status: 500 },
    );
  }
}
