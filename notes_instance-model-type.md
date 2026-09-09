# 实例型号类型调研记录

## 现有结构

- `schema.sql` 中 `merge_power_instancemodels` 当前字段为 `deviceCode`、`modelCode`、`xxllCode`、`nameZh`、`nameEn`、`b6Type`、审计时间字段。
- `src/lib/modules.ts` 的 `instance-models` 配置当前列表字段为设备编码、机型、xxll编码、中英文名称、默认B6类型；表单没有类型字段。
- `src/lib/crud.ts` 的通用 CRUD 按 `formFields` 白名单写入，必填校验按配置执行；类型校验需要额外的实体级规范化/校验。
- `src/components/entity-page.tsx` 的 `select` 表单使用 option label/value，但普通列表单元格调用 `formatValue(row[column.key], column.type)`；`getConfiguredValue` 目前只用于业务伙伴特殊单元格。
- `src/lib/display-format.ts` 已有 `lineType` 的英文值到中文显示映射，可复用相同模式增加实例型号类型映射。

## 影响面

- 直接主数据：实例型号列表、详情/编辑、模板导入、Excel 导出、筛选候选值、关键字查询。
- 读取关联：需求行、采购行、物流、实例合同、CAPEX/OPEX价格、月账单/预付款/服务费、结差等服务通过 `deviceCode` 读取 `modelCode`/`nameEn`。
- 历史快照：`capexpricingitems`、`billinginstanceledgers`、`monthlybillingwriteoffs`、`prepaymentcontractitems`、`monthlyprepaymentwriteoffs`、`servicefeesnapshotitems`、`balancesettlementitems` 及内部服务费相关表存在型号或业务快照字段；是否加入类型快照应按业务需要落地。

## 约束

- 数据库保存英文枚举值，前端显示中文标签。
- 现有数据必须无感迁移为 `Equipment`，旧接口调用不能因新增字段失败。
- 类型变更不应改变历史已确认单据的统计口径；历史快照应优先保留生成时类型。
