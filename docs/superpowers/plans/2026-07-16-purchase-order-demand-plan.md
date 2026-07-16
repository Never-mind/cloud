# Purchase Order Demand Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在采购订单详情页增加可维护、导入导出的要货计划 SN 码和要货计划子页签，并在物流列表为 PO 订单提供详情链接。

**Architecture:** 使用两张带 `power_` 前缀的新明细表，通过现有实体配置和通用 CRUD API 提供数据访问。详情页抽取可复用的子表页签组件，导入中心沿用 Excel 预览、错误报告和导入历史流程。

**Tech Stack:** Next.js App Router、React、TypeScript、MySQL、Vitest、ExcelJS。

---

### Task 1: 数据库和实体配置

**Files:**
- Modify: `schema.sql`
- Modify: `src/lib/modules.ts`
- Test: `src/lib/modules.test.ts`

- [ ] 为两个新实体写失败测试，要求实体配置含正确表名、主键和 PO 关联字段。
- [ ] 执行 `npm test -- src/lib/modules.test.ts`，确认因实体不存在失败。
- [ ] 新增 `power_purchaseorderplanitems` 与 `power_purchaseordersnitems`，并注册实体配置。
- [ ] 再次执行 `npm test -- src/lib/modules.test.ts`，确认通过。

### Task 2: 子表服务与导入映射

**Files:**
- Create: `src/lib/purchase-order-demand-plan.ts`
- Modify: `src/lib/import-center.ts`
- Modify: `src/lib/import-center-service.ts`
- Test: `src/lib/purchase-order-demand-plan.test.ts`
- Test: `src/lib/import-center.test.ts`

- [ ] 为导入匹配和必填字段写失败测试。
- [ ] 执行目标测试并确认失败。
- [ ] 实现采购明细解析、模板列、预览操作和错误报告。
- [ ] 执行目标测试并确认通过。

### Task 3: 采购订单详情页签

**Files:**
- Create: `src/components/purchase-order-demand-plan-tabs.tsx`
- Modify: `src/components/order-detail-page.tsx`
- Test: `src/lib/purchase-order-demand-plan.test.ts`

- [ ] 为字段集合与 PO 跳转路径写失败测试。
- [ ] 实现页签、新增编辑删除、搜索、分页、字段显示设置与导入导出入口。
- [ ] 执行测试并确认通过。

### Task 4: 物流 PO 链接和回归验证

**Files:**
- Modify: `src/components/entity-page.tsx`
- Test: `src/lib/order-list-view.test.ts`

- [ ] 为物流 PO 单号生成采购订单详情链接写失败测试。
- [ ] 实现仅物流列表的 PO 单号链接渲染。
- [ ] 运行 `npm test` 和 `npm run build`，确认所有测试和生产构建通过。
