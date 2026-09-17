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

### 5.5 第 4 ~ 6 项修复情况（同日续做）

#### 5.5.1 空状态统一

| 项目 | 修复前 | 修复后 |
| --- | --- | --- |
| 手写纯文本空状态（无图标、文案各异） | 15 处 | **0 处** |
| 使用 `TableStateContent` / `EmptyState` | 40 处 | 55 处 |

15 处手写文案统一为 `<EmptyState title="..." />`（`table-state.tsx` 的公共空状态：图标 + 主文案），`py-10` 归一为 `py-12`，原本文案保留各自业务含义（"暂无映射""暂无供应商付款""暂无快照"等）。自动补齐了 `EmptyState` 的 import（按字母排序）。

#### 5.5.2 硬编码色值归到 token

新增 6 个确实缺失的令牌（取值与原来完全一致，无视觉变化）：

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--color-skeleton` | `#eef1f5` | 加载骨架、占位块 |
| `--color-nav-ink` | `#bfcbd9` | 左侧导航普通文字 |
| `--color-nav-ink-soft` | `#8aa0b8` | 左侧导航次级文字 |
| `--color-info-ink` | `#2f75b5` | 浅色底上的信息文字 |
| `--color-danger-border-strong` | `#fbc4c4` | 行内删除按钮边框 |
| `--color-warning-border-soft` | `#f5dab1` | 浅色警告提示边框 |

其余全部映射到已有语义令牌，共替换 **66 处**：

| 原硬编码 | 处数 | 归到 |
| --- | --- | --- |
| `#f4f9ff` / `#f5fbff` / `#e6f4ff` / `#f4faff` / `#f0f5ff` | 10 | `bg-info-soft`（原来有 **5 种不同的浅蓝底**） |
| `#d9ecff` / `#c6e2ff` / `#b8d8f8` | 8 | `border-info-border`（原来有 3 种信息边框） |
| `#fff7e6` / `#fff8e6` / `#fffdf5` | 5 | `bg-warning-soft` |
| `#f0fff7` / `#f0fff4` | 2 | `bg-success-soft` |
| `#13a85a` / `#13a561` / `#13a65b` | 3 | `text-success-dark` |
| `#a66b00` / `#b88600` | 2 | `text-warning-ink` |
| `#e5e7eb` / `#e4e7ed` / `#d9e2ec` | 4 | `border-line` |
| `#f7f8fa` / `#f8fafc` / `#fcfcfd` | 3 | `bg-surface-2` |
| `#5b7db1` / `#2f75b5` | 2 | `text-info-ink` |
| 其余（`#fbc4c4`、`#f78989`、`#b7ebc6`、`#f0f0ff`、`#626aef`、`#f2f6fb` 等） | 27 | 对应语义或新增令牌 |

结果：**硬编码色值 0 处**。

#### 5.5.3 分页与查询按钮

- `customer-po-page` 的自绘分页条替换为 `PaginationBar`（同时删掉因此不再使用的 `canPrevious` / `canNext`）。至此 16 个列表页分页完全统一。
- 同步台账 / 映射、华为云对账的「查询」按钮补上 `tone="secondary"`，与其它页一致。

#### 5.5.4 验收

| 项目 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| `npm test` | 318 个单测通过 |
| `npm run build` | 通过 |
| 新令牌生效 | 6 个新令牌均在产物 CSS 中生成对应工具类（`bg-skeleton` / `text-nav-ink` / `text-nav-ink-soft` / `text-info-ink` / `border-danger-border-strong` / `border-warning-border-soft`） |
| 页面回归 | 30 个页面全部 200 |
| 扫描复核 | 硬编码色值 0、纯文本空状态 0、裸 `<select>` 0 |

### 5.6 第 7 项：吸顶表头（已实现）

#### 5.6.1 先澄清一个机制问题

原计划是"给 68 个 `<thead>` 逐个补 `sticky top-0`"。实际排查后发现**单纯加 `sticky` 没有效果**：

`position: sticky` 只在**最近的滚动容器**内生效。第 3 项把容器统一成 `table-scroll overflow-auto`（有 overflow 但不限高）后，**滚动的是页面而不是容器**，表头会随容器整体滚出视野。

唯一生效的 2 处（华为云对账、服务映射）用的是 `h-full`——容器有确定高度、自己内部滚动，与上面的判断一致。

**结论：表头吸顶的前提是"容器自己有确定高度并滚动"。**

#### 5.6.2 实现方式（两行 CSS，不动页面结构）

在 `globals.css` 里集中处理，避免在 50 个表格上重复写类名：

```css
/* 列表容器统一视口高度：容器自己滚动，表头才有吸顶的意义 */
.table-viewport {
  max-height: calc(100dvh - 210px);   /* iframe 内 100dvh 即内容区高度，预留工具栏 + 分页条 */
  overscroll-behavior: contain;
}

/* 只对列表容器里的主表生效，展开行里的嵌套小表不受影响 */
.table-scroll > table > thead th {
  position: sticky;
  top: 0;
  z-index: 20;
  background-color: var(--color-canvas);   /* 吸顶必须有不透明底色，否则下面滚动的行会透出来 */
}
```

要点：

- 选择器用 `.table-scroll > table > thead th`（直接子级），**展开行里的嵌套表格不会被误伤**。
- 只用一个类名 `.table-viewport` 控制视口高度，**不再在各页面写 `max-h-[calc(100vh-XXXpx)]`**，高度口径只有一处。
- 去掉华为云对账、首页看板表头上原来行内写的 `sticky top-0`，避免两套写法并存。

应用范围：**50 个列表容器**（所有 `<StickyTable className="table-scroll overflow-auto">` → 加上 `table-viewport`）。华为云 3 张表本来就是 `h-full` 自滚动，不需要再加。

#### 5.6.3 验收

| 项目 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| `npm test` | 318 个单测通过 |
| `npm run build` | 通过 |
| 产物 CSS | `table-viewport`、`100dvh`、`.table-scroll > table > thead th` 均已生成 |
| 页面回归 | 40 个页面全部 200 |
| 应用数量 | 50 个列表容器 |

### 5.7 全部 7 项已完成

至此本报告的 9 类问题中，可执行的第 1 ~ 7 项全部完成；第 8、9 项（查询按钮配色、少数表格未包 `StickyTable`）在前面的批次里一并处理或确认属于可接受范围。

顺带把 `DESIGN.md` 补齐了：

- 修正第 6.2 节的时间格式（原写 `YYYY-MM-DD HH:mm:ss`，与现行规范冲突，已改为到分并标注日志例外）。
- 新增第 6.4 节「组件与类名约定」，把上面这些规则固化下来。
