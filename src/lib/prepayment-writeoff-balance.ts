// 预付款核销平衡的口径。
//
// 合同金额按 24 期均摊、最后一期吸收四舍五入，历史数据会留下几分钱的尾差；
// 这些尾差没有业务含义，却会让核销状态列一片“未平”。
// 所以约定：|合同金额 − 已生效月核销合计| ≤ 容差即视为已平，超过容差才算未平。
//
// 容差由业务确认（20260922 确认为 3），接口文案、列表筛选、文档必须共用这一个值。
export const WRITE_OFF_BALANCE_TOLERANCE = 3;

/** 差额先按金额保留两位，再判断是否落在容差内。 */
export function isWriteOffBalanced(gap: number) {
  return Math.abs(roundMoney(gap)) <= WRITE_OFF_BALANCE_TOLERANCE;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
