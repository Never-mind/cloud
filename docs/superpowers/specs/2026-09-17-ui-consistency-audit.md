# 界面一致性排查报告（日期时间之外）

排查日期：2026-09-17
排查范围：`src/components` 全部页面组件、`src/app` 全部路由页
排查方式：源码扫描 + 公共组件用量统计（不含上一轮已完成的日期时间统一）
设计基线：`DESIGN.md` + `src/app/globals.css` 的主题变量

## 1. 已经统一、无需处理的部分

先说好消息，这几类是干净的：

| 项 | 结论 |
| --- | --- |
| 原生弹窗 | 除 `app-dialog.tsx` 的降级实现外，无 `window.confirm` / `alert` |
| 数字输入 | 无裸 `<input type="number">`，全部走 `NumberInput` |
| 自制遮罩弹层 | 除 `app-dialog.tsx` 外无 `fixed inset-0` 手写弹层；弹层统一 `Modal`(16) / `Drawer`(3) |
| 页面容器 | 除 `sticky-table.tsx` 自身外，所有列表页都用 `Panel` 包裹 |
| 导出/筛选交互 | 三横列菜单、分页、导出走公共实现 |

## 2. 待统一的问题（按可见度排序）

### 2.1 表头样式有 4 种写法（最明显）

标准写法是 `whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium`，但实际存在 4 种偏差：

| 偏差 | 数量 | 主要文件 |
| --- | --- | --- |
| 缺 `font-medium`（表头**不加粗**） | **37** | `purchase-order-form-page`(17)、`prepayment-contract-detail-page`(11)、`request-order-form-page`(7)、`cloud-reconciliation-page`、`import-center-page` |
| 缺 `whitespace-nowrap`（表头**会折行**） | **24** | 同上为主 |
| 用 `py-2`（行高**矮一档**） | **10** | `import-center-page`(3)、`home-dashboard-panel`、`users-page`、`capex-pricing-page`、`quotation-list-page`、`frappe-demand-sync-page`、`non-instance-settlement-page` 等 |
| 额外加 `text-ink-2` | 2 | `capex-pricing-page`、`quotation-list-page` |

对照：标准写法出现 119 次。也就是说约 1/4 的表头是"另一种长相"。

### 2.2 没有 `Select` 公共组件（根因）

`src/components/ui.tsx` 只导出 `Button` / `Input` / `Textarea` / `Panel` / `AuditInfoBar`，**没有下拉框组件**。结果 33 个文件里手写了 **84 个裸 `<select>`，出现 12 种不同类名**：

```text
h-9 w-full rounded border border-line bg-white px-3 text-sm outline-none focus:border-primary   ×8
h-9 rounded border border-line bg-white px-3 text-sm                                            ×7
h-9 w-full rounded border border-line bg-white px-3 text-sm                                     ×6
h-9 w-full rounded border border-line bg-white px-2                                             ×5
h-9 min-w-32 rounded border border-line bg-white px-3 text-sm outline-none focus:border-primary  ×5
h-9 rounded border border-line bg-white px-2 text-sm                                            ×4
h-9 rounded border border-line                                                                   ×4
h-9 min-w-[160px] rounded border border-line bg-white px-2                                       ×4
...
```

差异点：`px-2` vs `px-3`、有没有 `text-sm`、有没有 `outline-none focus:border-primary`（**部分下拉框聚焦时是浏览器默认蓝框**）、`w-full` vs 固定宽度。

这是"同一个筛选栏里两个下拉框长得不一样"的直接原因。

### 2.3 硬编码色值

25 个文件、40+ 处直接用十六进制色值，其中不少在 `globals.css` 里已经有对应 token：

| 硬编码 | 处数 | 对应 token |
| --- | --- | --- |
| `border-[#fbc4c4]` | 4 | `border-danger-border`(#fde2e2) 或新增 token |
| `bg-[#f4f9ff]` / `border-[#d9ecff]` | 6 / 5 | `bg-info-soft` / `border-info-border` |
| `bg-[#fff7e6]` | 3 | `bg-warning-soft` |
| `text-[#f5a623]` / `text-[#b88600]` | 2 / 1 | `text-warning` / `text-warning-ink` |
| `bg-[#f0fff4]` / `bg-[#f0fff7]` | 3 | `bg-success-soft` |
| `text-[#8aa0b8]` | 2 | 与 `text-[#bfcbd9]` 同处导航，两种灰 |
| `bg-[#eef1f5]` / `bg-[#f8fafc]` / `bg-[#f8fafc]` 等 | 9 | `bg-canvas` / `bg-surface-2` |

### 2.4 表头不吸顶

70 个 `<thead>` 里**只有 2 个**是 `sticky top-0 z-10`（华为云对账、服务映射）。
其它长表格滚动时表头会滚出视野，用户看不到列名。

### 2.5 表格容器高度有 7 种写法

```text
table-scroll overflow-auto                      ×44   ← 标准
h-full w-full overflow-auto                     ×3
max-h-[calc(100vh-280px)] overflow-auto         ×2
overflow-auto                                   ×2
max-h-72 overflow-auto                          ×1
table-scroll max-h-[calc(100vh-300px)] ...      ×1
table-scroll max-h-[calc(100vh-340px)] ...      ×1
```

硬编码的 `100vh-xxx` 就是"有的页面列表下面留一大块空白、有的又把列表压得很矮"的原因。

### 2.6 空状态两套写法

| 写法 | 数量 |
| --- | --- |
| `TableStateContent`（公共组件，带加载态） | 53 |
| 手写 `<td className="py-12 text-center text-ink-3">暂无数据</td>` | 41 |
| 手写 `py-10`（padding 又不一样） | 9 |

手写的缺少"加载中"状态，文案也不统一（暂无数据 / 暂无明细 / 无数据 / 暂无记录）。

### 2.7 自绘分页（1 处）

`customer-po-page.tsx:274` 自己写了分页条：

```tsx
<span>第 {page} / {totalPages} 页</span> + 条/页下拉 + 上一页 / 下一页
```

其它 15 个列表都用 `PaginationBar`。这是唯一一个分页样式不同的页面。

### 2.8 查询按钮配色不统一

「查询」按钮大部分是 `tone="secondary"`，但这两处用的是默认样式：

- `frappe-demand-sync-page.tsx:405 / 412`
- `cloud-reconciliation-page.tsx:259`

### 2.9 少数表格没有滚动/吸顶容器

以下文件的 `<table>` 没有用 `StickyTable` 包装：
`home-dashboard-panel`、`power-price-calculation-drawer`、`purchase-price-calculation-demo-page`、`users-page`。
（部分是详情页内嵌的小表，属于可接受范围，需要逐个确认。）

## 3. 建议的修复顺序

| 顺序 | 内容 | 影响面 | 预估 |
| --- | --- | --- | --- |
| 1 | 新增 `Select` 公共组件，替换 84 个裸 `<select>` | 33 个文件，下拉框样式立刻一致 | 1 天 |
| 2 | 表头统一：补齐 `font-medium` + `whitespace-nowrap`，`py-2` 归到 `py-3` | 37 + 24 + 10 处 | 0.5 天 |
| 3 | 表格容器统一 `table-scroll overflow-auto`，去掉硬编码 `100vh-xxx` | 7 处 | 0.5 天 |
| 4 | 空状态统一到 `TableStateContent`（含文案） | 50 处 | 0.5 天 |
| 5 | 硬编码色值归到 token（必要时补几个 token） | 25 个文件 | 0.5 天 |
| 6 | `customer-po-page` 改用 `PaginationBar`；查询按钮 tone 统一 | 3 处 | 0.5 天 |
| 7 | 长表格补 `sticky top-0`（需评估与现有布局的兼容） | 68 个 thead | 1 天 |

合计约 4.5 天，纯前端改动，**不涉及数据库**。

## 4. 建议同步更新的规范文档

`DESIGN.md` 目前只写了整体风格，建议补一节「组件与类名约定」：

- 表格：`th` 固定 `whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium`；`td` 固定 `whitespace-nowrap`（仅备注等长文本用 `whitespace-normal break-words`）。
- 表单：输入框/下拉框/文本域一律用 `Input` / `Select` / `Textarea` / `NumberInput`，不写裸标签。
- 空状态与加载：一律 `TableStateContent`。
- 颜色：只用 `globals.css` 的 token，禁止 `bg-[#...]`。
- 表格容器：统一 `<StickyTable className="table-scroll overflow-auto">`。

## 5. 修复情况（第 1 ~ 3 项已完成）

按优先级先做了前 3 项，其余项待排期。

### 5.1 新增 `Select` 公共组件

`src/components/ui.tsx` 新增 `Select`，与 `Input` 同一套高度、圆角、边框、聚焦样式（`h-9` + `focus:border-primary focus:ring-2`）。宽度通过 `className` 传 `w-full` / `min-w-*` / `w-28` 等布局类控制。

替换结果：

| 项目 | 修复前 | 修复后 |
| --- | --- | --- |
| 裸 `<select>` | 84 个，12 种类名 | **0 个** |
| `<Select>` | 0 | 87 个 |
| 涉及文件 | — | 34 个（自动补齐 import，import 列表按字母排序） |

顺带修掉了原来**没有写 className 的裸下拉框**（采购订单表单 4 个、实体列表 3 个、服务费 2 个、需求单表单 2 个、可用预付款 2 个、订单详情 2 个、可用账单 2 个等），这些原来用的是浏览器默认样式。

### 5.2 表头统一

对全部 `<th>` 做规范化：缺 `whitespace-nowrap` 的补上，缺 `font-medium` 的补上，缺对齐类的补 `text-left`（已有 `text-right`/`text-center` 的不动），`py-2` 归到 `py-3`。

| 项目 | 修复前 | 修复后 |
| --- | --- | --- |
| `th` 总数 | 142 | 142 |
| 未规范表头 | **68** | **0** |

### 5.3 表格容器统一

| 位置 | 修复前 | 修复后 |
| --- | --- | --- |
| `frappe-demand-sync-page`（台账、映射） | `max-h-[calc(100vh-280px)] overflow-auto` | `table-scroll overflow-auto` |
| `settlement-project-page` | `table-scroll max-h-[calc(100vh-300px)] overflow-auto` | `table-scroll overflow-auto` |
| `po-invoice-summary-page` | `table-scroll max-h-[calc(100vh-340px)] overflow-auto` | `table-scroll overflow-auto` |
| 华为云对账 3 张表 | `h-full w-full overflow-auto`（**缺 `table-scroll`，滚动条样式不同**） | `table-scroll h-full w-full overflow-auto`（保留填满视口的行为） |
| 导入中心 2 张表 | `overflow-auto`（缺 `table-scroll`） | `table-scroll overflow-auto` |

写死的 `100vh-XXXpx` 魔法值已全部清除；固定高度页保留 `h-full`，只补统一的横向滚动与滚动条样式。

### 5.4 验收

| 项目 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| `npm test` | 318 个单测通过 |
| `npm run build` | 通过 |
| 页面回归 | 29 个主要页面全部 200 |
| 扫描复核 | 裸 `<select>` = 0；未规范表头 = 0；`max-h-[calc(100vh-` 残留 = 0 |

### 5.5 仍未处理

第 4 ~ 7 项（空状态统一 50 处、硬编码色值 25 个文件、`customer-po-page` 自绘分页、长表格吸顶表头）按原计划待排期；其中吸顶表头涉及布局，风险相对大，建议单独一轮。

顺带把 `DESIGN.md` 补齐了：

- 修正第 6.2 节的时间格式（原写 `YYYY-MM-DD HH:mm:ss`，与现行规范冲突，已改为到分并标注日志例外）。
- 新增第 6.4 节「组件与类名约定」，把上面这些规则固化下来。
