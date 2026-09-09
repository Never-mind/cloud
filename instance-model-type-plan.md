# 实例型号类型扩展开发方案

## 1. 目标与边界

为算力系统的“实例型号”主数据增加三种类型：

| 数据库存储值 | 前端显示 |
| --- | --- |
| `Equipment` | 设备 |
| `Material` | 配件 |
| `Component` | 组件 |

现有全部实例型号回填为 `Equipment`，前端因此显示“设备”。数据库和 API 返回英文值，前端列表、表单、筛选、导入模板和导出文件显示中文标签。

第一阶段建议把类型作为实例型号主数据属性，并完成所有已有引用的读取兼容；第二阶段再根据业务规则决定 Material/Component 是否参与价格、计费和结差流程。不要在本次变更中把它们默认当作可计费设备，否则会改变现有财务口径。

## 2. 推荐数据模型

### 2.1 字段命名

主表新增 `instanceType`，而不是使用 `type` 或复用 `modelType`：

- `type` 过于通用，容易和请求类型、行类型混淆。
- `modelType` 在现有导入/合同数据中已经有其他语义。
- `instanceType` 能明确表示这是实例型号的分类。

建议定义：

```sql
`instanceType` VARCHAR(32) NOT NULL DEFAULT 'Equipment' COMMENT 'Equipment/Material/Component'
```

为查询和数据质量增加索引（若实际筛选量不大也可暂不加）：

```sql
KEY `idx_InstanceModels_instanceType` (`instanceType`)
```

不建议使用 MySQL `ENUM`：项目当前大量状态/类型使用 `VARCHAR`，VARCHAR 更利于未来扩展、跨环境迁移和回滚。

### 2.2 代码枚举与展示映射

新增 `src/lib/instance-model-type.ts`，集中维护：

- `INSTANCE_MODEL_TYPE_VALUES = ["Equipment", "Material", "Component"] as const`
- `INSTANCE_MODEL_TYPE_OPTIONS = [{ value: "Equipment", label: "设备" }, ...]`
- `isInstanceModelType(value)`
- `requireInstanceModelType(value)`，空值按兼容策略归一为 `Equipment`，非允许值直接报错
- `formatInstanceModelType(value)`，未知值保留原值并记录/提示，避免历史脏数据被静默改写

这样可以避免在多个页面散落字符串映射，也与现有 `request-type.ts`、`display-format.ts` 的模式一致。

## 3. 数据库迁移与回滚

### 3.1 初始化结构

在 `schema.sql`、`merge-schema-only.sql` 以及内部 ID 版本对应的 schema 中，为 `merge_power_instancemodels` 增加 `instanceType` 和索引，默认值为 `Equipment`。

### 3.2 在线迁移

在 `scripts/migrate.ts` 增加幂等步骤：

1. `addColumnIfMissing("instancemodels", "instanceType", ...)`。
2. 对空值、NULL 或历史中文值执行一次归一化：

   ```sql
   UPDATE instancemodels
      SET instanceType = CASE
        WHEN instanceType IN ('Material', '配件') THEN 'Material'
        WHEN instanceType IN ('Component', '组件') THEN 'Component'
        ELSE 'Equipment'
      END
   ```

3. 检查并补建 `idx_InstanceModels_instanceType`。
4. 迁移后验证总行数、三类计数、非法值数量和 NULL 数量。

迁移必须先备份或导出实例型号表；先在测试库执行，再在生产低峰期执行。脚本保持可重复运行，不使用破坏性重建表。

### 3.3 回滚

提供独立 `merge-instance-model-type-rollback.sql`：先删除索引，再删除 `instanceType` 列。回滚前应确认应用版本已回退到不读取该列的版本；回滚不会恢复迁移期间对脏值的规范化，因此如需完全恢复，必须使用迁移前备份。

## 4. 后端实现

### 4.1 主数据配置

修改 `src/lib/modules.ts` 的 `instance-models`：

- 列表新增“类型”，放在设备编码或机型之后。
- 表单新增必填“类型”，使用 `type: "select"` 和 `INSTANCE_MODEL_TYPE_OPTIONS`。
- 增加类型筛选，选项使用同一份 options。
- 描述和模板列名同步更新。

### 4.2 通用 CRUD 校验

在 `src/lib/crud.ts` 的实体归一化流程中，对 `instance-models`：

- 新建缺失类型时写入 `Equipment`，兼容旧客户端和旧模板。
- 新建/更新/导入时拒绝不在三种枚举中的值。
- 更新旧记录时若请求体未携带 `instanceType`，保留当前值；仅对真正空值执行默认值，避免编辑旧页面把类型覆盖掉。
- 对 API 返回继续返回英文 `instanceType`，不在后端把数据库值替换为中文。

### 4.3 查询、导入和导出

- `listEntityRows` 的字段白名单会自动包含新增表单字段；确认筛选字段走真实列，关键字可包含类型英文值，中文筛选通过候选 option 的 value 提交。
- `/api/entities/[entity]/template` 生成的模板新增“类型”列，并在说明行中列出允许值。
- `/api/entities/[entity]/import` 使用统一字段映射；导入中文“设备/配件/组件”时在归一化层转成英文值，导出仍按前端显示规则输出中文标签。
- 若通用导出当前直接导出原始行，应在导出格式化处按字段配置执行 `formatInstanceModelType`，确保 Excel 与列表一致。

## 5. 前端实现

### 5.1 普通实体列表的显示映射

`EntityPage` 当前普通单元格不会使用 `select.options` 的 label，因此需要补一层通用格式化：

- 给 `EntityField` 增加可选的 `format`/`displayOptions` 标识，或让单元格统一调用 `getConfiguredValue(row[column.key], column)`。
- 保持金额、日期、百分比、行类型等现有格式逻辑不变。
- 对 `instanceType` 使用 `formatInstanceModelType`，未知值显示原值并带数据质量提示。

优先采用“字段配置驱动”的方式，避免把 `instanceType` 判断硬编码到表格 JSX 中。

### 5.2 表单和筛选体验

- 新建默认选中“设备”。
- 编辑显示中文 label，提交 value 为英文枚举。
- 列表列显示中文；列头筛选选项显示中文，查询参数仍传英文。
- 类型列支持排序、筛选和导出。
- 设备编码相关 datalist/选择器可在候选说明中附带类型，便于区分同类编码；不改变设备编码作为唯一关联键的现状。

## 6. 下游数据与业务规则

### 6.1 推荐的兼容原则

所有通过 `deviceCode` 关联实例型号的查询先继续按现有逻辑工作；增加类型读取不应影响已有 Equipment 流程。为防止主数据修改影响历史数据，凡是“生成即锁定”的记录应保存 `instanceType` 快照。

### 6.2 建议增加快照的表

优先覆盖已明确保存 `modelCode`/`nameEn` 快照的表：

- `capexpricingitems`
- `billinginstanceledgers`、`monthlybillingwriteoffs`
- `prepaymentcontractitems`、`monthlyprepaymentwriteoffs`、预付款调整明细
- `servicefeesnapshotitems`
- `balancesettlementitems`
- 内部服务费台账及月度明细（若这些记录需要按类型统计）

字段统一命名 `instanceType`，注释标明 `instance type snapshot`。生成 SQL 的 SELECT、INSERT、UPDATE/UPSERT、导出列和详情展示都要同步；生成时从实例型号主表读取，历史记录不随主表后续编辑而变化。

如果本轮只需要主数据分类，不要求财务按类型统计，可把快照字段列为第二阶段，先完成主表、读取接口和 UI；但必须在接口类型定义中预留可选字段，避免以后再次改造所有链路。

### 6.3 业务过滤建议

在确认产品规则前，不要把 Material/Component 自动排除或自动纳入：

- CAPEX/OPEX、实例合同、月账单、预付款和实例结差当前默认面向 Equipment。
- Material/Component 是否可进入这些流程应由业务规则显式控制，建议后续增加 `isBillable`/流程适用范围配置，而不是用类型字符串隐式判断。

## 7. 测试方案

### 单元测试

- 类型枚举校验：三种合法值、空值默认、非法值报错、中文导入值转换。
- 显示格式化：英文值分别显示“设备/配件/组件”，未知值不丢失。
- 模块配置：类型出现在列表、表单、筛选，且为必填 select。
- 通用 CRUD：新建、更新、导入不会丢类型；旧请求体兼容默认 Equipment。

### 集成测试

- 迁移前存在旧数据：执行迁移后全部为合法英文值，现有数据均为 `Equipment`。
- API 列表/详情返回英文 `instanceType`；筛选按英文 value 生效。
- 模板导入中文标签后数据库保存英文值；导出/列表显示中文。
- 设备编码关联的需求、采购、物流和财务页面在 Equipment 数据上回归通过。
- 若实施快照：新生成记录类型正确，修改主数据类型后历史记录仍保持原值。

### 验收查询

```sql
SELECT instanceType, COUNT(*) FROM merge_power_instancemodels GROUP BY instanceType;
SELECT COUNT(*) AS invalid_count
  FROM merge_power_instancemodels
 WHERE instanceType IS NULL OR instanceType NOT IN ('Equipment', 'Material', 'Component');
```

预期 `invalid_count = 0`；现有数据迁移后的 `Equipment` 数量应等于迁移前实例型号总数减去明确识别为其他类型的记录数（当前需求描述下应为全部总数）。

## 8. 发布顺序与验收

1. 备份实例型号表并在测试库执行迁移。
2. 发布后端兼容版本：先允许缺列/空值读取并默认 Equipment，再发布数据库迁移。
3. 执行幂等迁移和数据校验。
4. 发布前端配置、显示映射、模板和筛选。
5. 用一条 Equipment、一条 Material、一条 Component 做新建、编辑、列表、导入、导出验收。
6. 回归需求单、采购订单、物流、实例合同、CAPEX、账单、预付款、服务费、结差。
7. 观察错误日志和非法枚举计数；稳定后再开放 Material/Component 进入后续业务流程（如业务确认允许）。

## 9. 交付物

- `src/lib/instance-model-type.ts`
- `schema.sql`、部署 schema 和 `scripts/migrate.ts` 的字段/索引迁移
- `merge-instance-model-type-rollback.sql`
- `src/lib/modules.ts`、`src/lib/crud.ts`、`src/lib/display-format.ts` 及实体页的类型展示/校验改动
- 相关单元与集成测试、迁移验证记录

## 10. 本次实施取舍

本次已完成主数据分类、前端展示/筛选、模板导入导出、CRUD 校验、schema、在线迁移和回滚；下游财务/结差历史快照暂不新增 `instanceType` 字段。这样不会改变现有计费、定价和结差口径。若后续需要按“设备/配件/组件”统计历史单据，再按第 6.2 节追加快照字段和生成逻辑。
