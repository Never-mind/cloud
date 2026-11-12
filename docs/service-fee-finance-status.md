# 服务费无需开票、无需回款

完成日期：2026-11-12。

算力服务费对账单按当期原币种的含税服务费 `serviceFeeTotal` 判断：绝对值严格小于1时，原开票状态、收款状态位置分别显示“无需开票”“无需回款”。包括零值及负数尾差；等于1、-1及金额缺失时按原登记状态显示。无需办理状态优先于历史登记状态。

状态直接保存到 `merge_power_servicefeesnapshots.invoiceStatus`（未开票/已开票/无需开票）和 `repaymentStatus`（未回款/已回款/无需回款）。两个字段原本为 VARCHAR(32)，不新增字段，不修改表结构。已有符合条件账单需要一次性补更新。

生成、重新生成及确认账单时写入状态；回款保存、发票登记、追加、作废、审批回票等路径保持小额账单的“无需”状态。列表、筛选、导出直接读取保存值，不再在查询时计算状态。

发票记录、金额、日期和银行流水保留。未确认账单重新生成后，若金额达到1或-1，先前“无需”状态依据留存资料恢复：有票号或发票附件则已开票；有回款日期且已登记金额则已回款（包含已登记零金额）；没有对应资料则为未办理。其他原有已/未状态保持。无需状态仍由金额规则自动决定，不能手动用于正常金额账单。

已接入桌面/移动列表、展开明细、实收编辑弹窗中的状态、状态筛选、表头候选值、排序、分页计数及通用Excel导出。编辑回款支持提交“无需回款”，后端会锁定账单并复核金额，避免旧客户端覆盖或正常金额误设为无需回款。

验证结果：

- 118项测试通过，覆盖正负尾差、±1边界、空值、账单生成/重新生成、保存与恢复状态、发票追加/作废/回票、SQL筛选和分页。
- 最终Next.js生产构建及TypeScript检查通过。
- 生产库16张历史账单已在事务中更新并独立回查通过，除两项状态和更新时间外，所有字段逐项比对一致；备份、执行及回查记录位于 `backup/service-fee-finance-status-20261112`（before.json、transaction-before.json、applied.json、verified.json）。
- 生产库直接读取、专用列表、通用导出及表头筛选均返回16张无需办理账单，未开票筛选正确排除这些账单。
- 本地5174已重启为 `.next-service-fee-status-persisted-20261112`，启动时校验仍连接既有生产库；登录页返回200，13个静态资源和功能代码块均与新构建逐字节一致。
- 浏览器会话未登录，未进行登录后页面交互验证。

本地验证记录：`tmp/service-fee-status-persisted-verified.json`、`tmp/service-fee-status-persisted-runtime.json`。

## 部署后处理已有账单

新版本未来生成或编辑账单会自动保存状态。部署时对历史账单运行一次：

```powershell
npm run data:service-fee-finance-status -- --plan backup/service-fee-finance-status
# 核对计划、备份及目标数据库后执行。
npm run data:service-fee-finance-status -- --apply backup/service-fee-finance-status
npm run data:service-fee-finance-status -- --verify backup/service-fee-finance-status
```

脚本默认只读生成计划，校验数据库标识与字段类型；apply仅更新计划中符合小额规则的行，执行前逐行比对并备份，任何变化即回滚。已执行的计划不可重复apply，可重复verify。不会覆盖发票台账或回款明细。
