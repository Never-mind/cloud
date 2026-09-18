# 搜索选择控件统一方案与实施记录

日期：2026-09-18
背景：系统里"输入关键词再选择"的控件存在两套完全不同的实现，外观与交互都不统一
基准样式：月账单调整单明细里"点击实例编码"的效果（同时显示编码与产品信息）

## 1. 排查结果：系统里一共有 16 处

### 1.1 浏览器原生 `<datalist>`（11 个）

| 位置 | 字段 | 下拉里的说明文字 |
| --- | --- | --- |
| `billing-adjustment-detail-page` | 实例编码 ★ | 机型 + 英文名 |
| `billing-available-page` | 实例合同号 | 币种 / 24 个月价 / 36 个月价 |
| `capex-pricing-page`（2 个） | 设备编码 / B6类型 | `机型 / 英文名 / B6类型`；`别名 / 范围` |
| `entity-page`（5 个） | 实例编码、B6类型、产品编码、产品分类、合同号 | 各自 label |
| `party-archive-detail-page`（1 个） | 档案表单里的自定义可选项字段 | option.label |
| `request-order-form-page`（1 个） | 实例编码 | **死代码：没有任何输入框绑定** |

### 1.2 自研"输入 + 下拉面板"（5 处）

| 位置 | 组件 | 面板定位 | 面板样式 |
| --- | --- | --- | --- |
| `request-order-form-page` | `SearchPicker` | `fixed` + JS 算坐标 | 无圆角 `shadow-xl` |
| `cloud-reconciliation-page` | `PartnerSelect` | `fixed` + JS 算坐标 | 有圆角 `shadow-lg` |
| `settlement-project-detail-workspace` | `PartnerLookup` | `fixed` + JS 算坐标 | 有圆角 `shadow-lg` + 空态 |
| `customer-po-page` | 内联伙伴筛选 | `absolute left-0 right-0 top-[62px] z-30` | 无圆角、`hover:bg-info-soft` |
| `customer-po-page` | `ProductMasterPicker` | Portal + `fixed` | 无圆角、`hover:bg-info-soft` |

### 1.3 不统一的 12 个维度

| 维度 | 原状 |
| --- | --- |
| 面板定位 | `absolute` 跟随父容器 / `fixed` + JS 坐标 / Portal，三种 |
| 圆角 | 2 处有、3 处没有 |
| 阴影 | `shadow-lg` / `shadow-xl` / 无 |
| hover 底色 | `hover:bg-canvas`（19 处）vs `hover:bg-info-soft`（7 处） |
| z-index | `z-30` / `z-[100]` / `z-[120]` |
| 选项文案 | `编码 - 名称` / `编码 名称` / 只有名称 / 主值+副信息 |
| 选项行数 | 全是单行（只有 datalist 能显示两段） |
| 空态 | 3 处有、2 处不弹面板 |
| 加载态 | 只有 2 处有 |
| **键盘操作** | **16 处全部没有** ↑↓ / Enter / Esc |
| 结果条数 | 有的 `slice(0,8)`，有的全量渲染（几千条会卡） |
| 关闭逻辑 | blur + 120ms setTimeout / window 监听，两套且都脆弱 |

### 1.4 关于"月账单调整单那个为什么好看"

它用的是**浏览器原生 datalist**：原生下拉会同时显示 `value`（编码）和 label（机型 + 英文名）。

但它的样式**完全不可控**（Chrome / Edge / Safari 各异，Firefox 甚至只显示 value），套不上设计令牌，也没有空态、加载态、键盘高亮。所以方案不是"把别处改成 datalist"，而是**做一个组件把它的信息量做出来**。

## 2. 方案：新增 `SearchSelect`

放在 `src/components/search-select.tsx`，与 `Input` 共用同一套基础样式。

```tsx
<SearchSelect
  value={deviceCode}
  onChange={setDeviceCode}
  options={instanceModels.map((m) => ({
    value: m.deviceCode,                  // 选中后提交的值
    label: m.deviceCode,                  // 输入框回显
    hint: `${m.modelCode} ${m.nameEn}`,   // 下拉第二行灰色说明
  }))}
  placeholder="搜索实例编码"
/>
```

### 2.1 统一后的规格

| 维度 | 统一为 |
| --- | --- |
| 外观 | 复用 `Input` 的高度 / 圆角 / 边框 / 聚焦环，右侧固定图标（有值时显示清除按钮） |
| 定位 | 内部封装 `fixed` + 计算坐标，宽度 `max(输入框宽度, 260px)`，不被表格 `overflow` 裁切 |
| 面板 | `z-[120]`、`rounded`、`border-line`、`shadow-lg`、`max-h-64`、细滚动条 |
| 选项 | 两行：第一行 `编码 - 名称`，第二行灰色说明（机型 / 英文名 / 规格） |
| hover / 键盘高亮 | 统一 `bg-canvas`，鼠标与键盘共用同一高亮 |
| 空态 / 加载态 | `暂无匹配选项`（可按场景覆盖）/ `加载中…` |
| 搜索 | 同时匹配 value / code / label / hint / keywords |
| 条数 | 默认最多 50 条，超出提示"共匹配 N 条，仅显示前 50 条，请继续输入缩小范围" |
| 键盘 | ↑↓ 移动、Enter 选中、Esc 关闭、Tab 关闭 |
| 关闭 | 点击面板外、滚动、resize 统一处理 |
| 远端搜索 | 可选 `onSearch(keyword)`，由调用方 debounce 后回填 `options` |
| 自由输入 | **不支持**——只允许从选项中选择 |

## 3. 实施记录

### 3.1 已完成

| 对象 | 处理 |
| --- | --- |
| `request-order-form-page` 的 `SearchPicker`（4 处） | 换成 `SearchSelect`；实例编码补上机型/英文名说明，不再允许手输 |
| `request-order-form-page` 的死 datalist | 删除（原来白白渲染全部实例型号） |
| `cloud-reconciliation-page` 的 `PartnerSelect` | 换成 `SearchSelect` 包装，保留远端搜索（180ms debounce）与"已保存值不在选项里"的占位 |
| `settlement-project-detail-workspace` 的 `PartnerLookup` | 同上，供应商与客户合并成一个列表 |
| `customer-po-page` 的伙伴筛选、`ProductMasterPicker` | 换成 `SearchSelect`，产品匹配保留下拉清除 |
| `billing-adjustment-detail-page` 实例编码 | datalist → `SearchSelect`（保留选中后自动带出机型/英文名） |
| `billing-available-page` 实例合同号 | datalist → `SearchSelect`（选项按国家 + 实例编码过滤） |
| `capex-pricing-page` 设备编码 / B6类型 | datalist → `SearchSelect`（B6 选中后仍自动套用规则） |
| `party-archive-detail-page` 自定义可选项字段 | datalist → `SearchSelect` |

同时删除的旧代码：`SearchPicker`、旧 `PartnerSelect` 实现、旧 `PartnerLookup` 实现、`PartySearchSelect` 的内联面板、`ProductMasterPicker` 的 Portal 面板，以及 `SearchOption` 类型。

### 3.2 尚未处理（需要单独一轮）

`entity-page.tsx` 里还剩 **5 个 datalist**（实例合同-实例编码、实例型号-B6类型、客户PO明细/报价明细-产品编码、产品档案-产品分类、账单台账-合同号）。

原因：这 5 处都在**同一个通用档案表单**里，而且这个表单的字段用的是 `value` + `defaultValue` 混用的写法——多数字段是非受控的（例如实例合同的 `deviceCode` 并没有从 `editing` 初始化 state），直接换成受控的 `SearchSelect` 会让"编辑已有档案时回显为空"。

要正确迁移，需要先把该表单的这几个字段改成受控并补上初始化，属于对通用表单的改动，影响所有档案类页面的新增/编辑。建议单独一轮做，配套回归。

## 4. 验收

| 项目 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| `npm test` | 322 个单测通过 |
| `npm run build` | 通过 |
| 页面回归 | 19 个主要页面全部 200 |
| 依赖的远端搜索接口 | `/api/po/customer-pos/references`、`/api/po/product-lookup`、`/api/cloud/master-data` 均 200 |

## 5. 行为变化（需要知会使用方）

1. **需求单的实例编码不再允许手输**：以前可以输入一个系统里没有的编码，现在只能从实例档案里选。如果确实需要为未建档的实例下单，需要先建档。
2. **原生下拉换成自研面板**：以前点击可能不弹出、只能靠输入过滤；现在点击即弹出全量（前 50 条）列表。
3. **下拉里新增了第二行说明**：编码下方会显示机型 / 英文名 / 规格等信息。
