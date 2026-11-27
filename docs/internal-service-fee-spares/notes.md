# 调研记录

## 当前实现

- 现有备件管理费仅由 `scripts/reinitialize-internal-service-fees.ts` 从附件一次性创建。
- 备件台账写入 `internalserviceledgers`，以 `status=附件导入` 标识。
- 备件月度明细写入 `monthlyinternalservicefees`，以 `sourceType=spare` 标识。
- 当前没有备件新增 API、页面、导入入口或常规编辑逻辑。
- “待生成月账单”的备件筛选只用于采购数据，不创建管理费。
- “非实例费用结差”的备件结差属于结差业务，不是管理费。

## 待确认的技术点

- 已通过 `internalserviceledgers.ledgerType='spare'` 明确区分备件与整机。
- 已通过备件业务键防止重复录入。
- 已通过独立审计表记录新增、导入、修改和停用。
- 编辑时保留已归档月份，只删除并重建开放月份。
- 已接入功能开关、权限、导航、搜索、列表、表单和 Excel 导入。

## 本地验证

- 当前连接：`merge_local_20261125`。
- 已有备件台账：41。
- 已有备件月度明细：2,460。
- 每个既有备件台账均有 60 个月。
- 本地所有 16 个账户均已授予完整备件管理费权限。
- `internal-service-fee-spares` 功能开关已启用。
