import { NextResponse } from "next/server";
import { queryRows, type Row } from "@/lib/db";

/**
 * 预付款合同的核销平衡状态。
 *
 * 调整单已经放开了"必须配平"的限制（允许先调多后调少、允许同一合同内明细对冲），
 * 所以差异必须有个地方能看见 —— 这里按合同实时汇总：
 *   已核销 = 该合同全部月核销明细的 monthlyAmount 之和（只算已生效金额）
 *   合同金额 = 该合同全部明细的 contractTotalAmount 之和
 * 差多少就报多少，**实时计算不做状态存储**，所以调平之后下次打开自动变"已平"。
 */
export async function GET() {
  try {
    const rows = await queryRows<Row>(
      `SELECT c.contractNo,
              COALESCE(w.written, 0) AS written,
              COALESCE(i.total, 0) AS target
         FROM prepaymentcontracts c
         LEFT JOIN (
           SELECT contractNo, SUM(monthlyAmount) AS written
             FROM monthlyprepaymentwriteoffs GROUP BY contractNo
         ) w ON w.contractNo = c.contractNo
         LEFT JOIN (
           SELECT contractNo, SUM(COALESCE(contractTotalAmount, 0)) AS total
             FROM prepaymentcontractitems GROUP BY contractNo
         ) i ON i.contractNo = c.contractNo
        WHERE c.status = '已确认'
        ORDER BY c.contractNo`,
    );
    const items = rows.map((row) => {
      const written = roundMoney(Number(row.written ?? 0));
      const target = roundMoney(Number(row.target ?? 0));
      const gap = roundMoney(target - written);
      return {
        contractNo: String(row.contractNo ?? ""),
        written,
        target,
        gap,
        status: gap === 0 ? "已平" : gap > 0 ? "少" : "多",
        label: gap === 0 ? "已平" : `未平（${gap > 0 ? "少" : "多"} ${Math.abs(gap)}）`,
      };
    });
    return NextResponse.json({
      items,
      unbalancedCount: items.filter((item) => item.status !== "已平").length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "核销状态加载失败" }, { status: 500 });
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
