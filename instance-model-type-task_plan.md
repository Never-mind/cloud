# 实例型号类型扩展工作计划

## 目标

为实例型号增加 `Equipment`、`Material`、`Component` 三种数据库类型，并在前端显示为“设备”“配件”“组件”；现有实例型号统一回填为 `Equipment`。

## 阶段

- [x] 梳理实例型号主数据、通用实体接口、导入导出和下游引用
- [x] 确认数据库字段命名、枚举值、兼容和历史快照策略
- [x] 编写开发方案交付文档
- [x] 按方案实施数据库迁移和代码变更（主数据、UI、导入导出、校验）
- [x] 执行迁移预检、自动化测试和构建验收
- [ ] 执行生产数据库迁移和灰度验收（需部署窗口与数据库备份）

## 当前实现范围

- 已完成实例型号主数据、配置化列表/表单、中文展示、筛选、模板导入、Excel 导出、CRUD 校验、schema、幂等迁移和回滚脚本。
- 下游财务/结差记录暂不新增历史 `instanceType` 快照字段；现有业务仍按 `deviceCode` 关联实例型号。若后续要求按类型统计或主数据改类型后保持历史分类，需要按方案第 6.2 节追加快照迁移。

## 发现

- 主表为 `merge_power_instancemodels`，公开唯一键为 `deviceCode`。
- 通用主数据配置在 `src/lib/modules.ts`，保存/导入接口复用 `src/lib/crud.ts` 和 `/api/entities/[entity]`。
- `EntityPage` 的普通列表当前通过 `formatValue` 展示原始值，不能仅靠 `select.options` 完成 label 映射。
- 需求、采购、CAPEX、账单、预付款、服务费和结差等流程存在通过设备编码读取实例型号的逻辑；其中多个表保存了型号名称快照。
- 迁移使用 `scripts/migrate.ts` 的幂等 `addColumnIfMissing` 模式，初始化结构由 `schema.sql` 维护。
