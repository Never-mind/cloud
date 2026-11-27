# 备件管理费

入口：**算力系统 → 财务管理 → 管理费 → 备件管理费**。

## 功能

- 手工新增或编辑备件管理费。
- 下载 Excel 模板并批量导入。
- 按开始月份生成前 24 个月和后 36 个月共 60 个月计划。
- 校验 `管理费总额 = 前24个月月金额 × 24 + 后36个月月金额 × 36`。
- 已对账月份冻结，修改时保留归档行，只重算开放月份。
- 停用后保留历史对账数据，删除未对账计划。
- 新增、导入、修改和停用操作写入 `merge_power_internalservicespareaudits`。

## 数据口径

- 备件台账复用 `merge_power_internalserviceledgers`，以 `ledgerType='spare'` 区分。
- 备件月明细写入 `merge_power_monthlyinternalservicefees`，使用 `sourceType='spare'`。
- 备件管理费默认按 USD 维护。
- 备件不进入整机实例，也不生成 JC。
- 已有对账月份通过 `archived=1` 冻结，不覆盖历史快照。

## 上线

先备份，再执行增量迁移：

```powershell
npm run schema:internal-fee-spares
npm run schema:internal-fee-spares -- --apply
npm run verify:internal-fee-spares
```

完成构建和部署后，在“功能启用”中启用“备件管理费”，或在取得授权后批量授权：

```powershell
npm run grant:internal-fee-spares
npm run grant:internal-fee-spares -- --apply
```

批量授权脚本会为当时数据库中的全部账户授予查看、新增、修改、删除、导出、导入和确认权限，并启用模块开关。

## 测试

```powershell
npx vitest run src/lib/internal-service-fee-spare.test.ts
npx tsc --noEmit
npm run build
```
