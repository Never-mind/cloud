# 实例型号远程同步规则调整方案

编写日期：2026-09-10
涉及远端：`Material`（`http://192.168.2.27:1337`）
涉及本地：`merge_power_instancemodels`、`merge_power_material_sync_runs`、实例型号页面「同步远端 Material」

## 1. 目标

1. 按远端 `material_type`（`Equipment` / `Component` / `Material`）分别决定本地建档用的编码，而不是一律用 `customer_item_code`。
2. `Equipment` 必须使用远端 `Customer Part No.`，且必须是 `06` 或 `99` 开头；不满足时**不建档**，并明确提示用户「需在远端维护为该类型编码后才能同步」。
3. `Component`、`Material` 使用远端 `Customer Item Code`（SL 编码）建档。
4. 本地写入的 `instanceType` 与远端类型一致（当前代码把新行一律写成 `Material`，是错的）。
5. 保留原有建档逻辑：匹配已存在记录、跳过重复、缺失提醒、同步锁、同步台账。

## 2. 现状

### 2.1 现有同步逻辑（`src/lib/material-sync-service.ts`）

读取远端字段：`name`、`customer_part_no`、`customer_item_code`、`model`、`material_code`、`name_zh`、`modified`——**没有读取 `material_type`**。

对每条远端 Material 依次判断：

1. `customer_part_no` 命中本地 `deviceCode` → 计入 `matchedByCustomerPartNo`，跳过；
2. `customer_item_code` 命中本地 `deviceCode` → 计入 `skippedByCustomerItemCode`，跳过；
3. `customer_item_code` 或 `model` 为空 → 计入 `skippedInvalid`，写错误明细；
4. 本批次内 `customer_item_code` 重复 → 计入 `skippedDuplicateRemote`；
5. 否则 `INSERT IGNORE`：`deviceCode = customer_item_code`、`modelCode = model`、`xxllCode = material_code`、`nameZh = name_zh`、`nameEn = model`、**`instanceType` 固定写 `'Material'`**。

即：**建档键永远是 `customer_item_code`，`customer_part_no` 只用于匹配老数据，类型永远是 `Material`**。

### 2.2 远端数据现状（2026-09-10 实测，共 100 条）

| 类型 | 条数 | 有 06 开头 part no | part no 为空 | part no 非 06/99 | item code | model 为空 | name_zh 为空 | material_code 为空 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Equipment | 50 | 48 | 2 | 0 | 100% 为 `SL…` | 0 | 14 | 2 |
| Component | 28 | 3 | 24 | 1 | 100% 为 `SL…` | 0 | **28** | **28** |
| Material | 22 | 9 | 13 | 0 | 100% 为 `SL…` | 0 | **22** | **22** |

- `material_type` 只有这三个取值，无空值。
- **99 开头目前 0 条**，规则先按前缀校验预留。
- 批次内不存在目标键重复（Equipment 的 part no、Component/Material 的 item code 均唯一）。
- Component / Material 的 `name_zh` 与 `material_code` **全部为空**（这两类远端本来就不维护）。

### 2.3 本地数据现状（开发库 `merge`）

- `merge_power_instancemodels` 共 **72 条，全部为 `Equipment`，deviceCode 全部 06 开头**，创建时间集中在 2026-08-28。
- 与远端比对：**44 条 Equipment 能按 `customer_part_no` 命中**本地记录；`customer_item_code` 命中 0 条。
- 汇总字段 `merge_power_material_sync_runs` 共 42 次运行记录，最近多次结果为「读取 100、匹配 44、按 item code 视为已存在 56、新增 0」。
- ⚠️ 需要注意：本地库里不存在任何 `SL…` 的 `deviceCode`，但台账却显示 56 条「按 item code 已存在」。说明这些同步实际写入了另一个库（很可能是生产 `cloud`），或历史数据被清理过。**是否已有老逻辑按 item code 建的实例型号行，需要先确认**（见第 7 节）。

### 2.4 与新需求的差距

| 项 | 现状 | 目标 |
| --- | --- | --- |
| 建档键 | 一律 `customer_item_code` | Equipment 用 `customer_part_no`；Component/Material 用 `customer_item_code` |
| 类型 | 一律写 `Material` | 写远端真实类型 |
| Equipment 编码校验 | 无 | 必须 `06`/`99` 开头，否则阻断并提示 |
| 提示信息 | 只有汇总数字 | 需要给出被阻断清单与原因 |

## 3. 新规则

### 3.1 类型 → 建档键

| 远端 `material_type` | 本地 `deviceCode` 取值 | 校验 | 写入 `instanceType` |
| --- | --- | --- | --- |
| `Equipment` | `customer_part_no` | 非空且匹配 `^(06\|99)` | `Equipment` |
| `Component` | `customer_item_code` | 非空（`SL` 前缀仅提醒，不阻断） | `Component` |
| `Material` | `customer_item_code` | 非空（`SL` 前缀仅提醒，不阻断） | `Material` |
| 其它/空值 | —— | 不建档，计入「类型无法识别」错误明细 | —— |

### 3.2 单条处理流程

```text
type      = material_type
key       = type == "Equipment" ? customer_part_no : customer_item_code
altKey    = type == "Equipment" ? customer_item_code : customer_part_no

1) key 或 altKey 命中本地 deviceCode        → 已存在，跳过（沿用原 matched/skippedExisting 口径）
2) type == "Equipment" 且 key 不满足 ^(06|99) → 阻断，计入 blockedByPartNoRule，写明细提示
3) type 不在三种之内                          → 阻断，计入 invalidType
4) key 为空 或 model 为空                     → 阻断，沿用原 skippedInvalid 口径
5) 本批次内 key 重复                          → skippedDuplicateRemote
6) 通过 → INSERT IGNORE (deviceCode=key, instanceType=type, modelCode=model,
           xxllCode=material_code, nameZh=name_zh, nameEn=model)
```

第 1 步同时用两个键匹配，是为了兼容**老逻辑按 item code 建的存量行**：否则同一个物理物料会在新规则下再建一条 part no 行，形成重复档案。

### 3.3 阻断提示文案

Equipment 编码不合规时，对每条生成明细：

> 远端物料 `MAT-00049` 类型为 Equipment，但 Customer Part No. 为空，需在远端维护为 06 或 99 开头的编码后才能同步到本地。

同步结束后的提示需要包含：**被阻断条数 + 逐条明细（远端编号、item code、当前 part no、机型）**，便于直接发给远端维护。明细同样写入同步台账的 `errorJson`，可在页面上回看。

### 3.4 落库字段映射

| 本地字段 | 取值 |
| --- | --- |
| `deviceCode` | Equipment → `customer_part_no`；Component/Material → `customer_item_code` |
| `instanceType` | 远端 `material_type` |
| `modelCode` | `model` |
| `nameEn` | `model`（沿用现状） |
| `nameZh` | `name_zh`（为空时见第 7 节待确认项） |
| `xxllCode` | `material_code`（可为空） |
| `b6Type` | 不写入，保持人工维护 |

## 4. 同步结果与页面提示

建议把汇总从「一个数字」扩展为分类型结果，并落库便于排查：

```text
读取 100 条：Equipment 50 / Component 28 / Material 22
新增 54 条（Equipment 4、Component 28、Material 22）
已存在 44 条
被阻断 2 条（需远端维护 Customer Part No.）
重复 0 条，其它错误 0 条

被阻断清单：
  MAT-00049  item=SL061100132519  part=空      机型=HE801.0.0.9
  MAT-00098  item=SL061100128490  part=空      机型=aSV903.0.0.9
```

页面改动：

- 实例型号页「同步远端 Material」按钮的完成提示改为上述结构化摘要 + 阻断清单（支持复制）。
- 顶部「最近同步」信息补充分类型新增数与阻断数。
- 建议增加「**试运行（dry-run）**」勾选：只计算不写库，返回将新增/阻断/已存在的清单。首次上线前用它核对影响面，避免误建。

## 5. 影响面

| 位置 | 影响 |
| --- | --- |
| `merge_power_material_sync_runs` | 需新增统计列（见第 8 节），保留 `errorJson` 明细 |
| 需求单同步（`frappe-demand-sync-service`） | 物料→本地实例型号的匹配按 `customer_item_code`、`customer_part_no` 双键查找，**兼容新规则**，无需改动 |
| 采购/物流/财务 | 通过 `deviceCode` 引用实例型号；新增 SL 编码行不影响既有引用，但**筛选实例型号的下拉候选会变多**（新增 50 个 Component/Material） |
| 实例型号表单校验 | 目前 `deviceCode` 无格式校验；若手动新增/导入不套用新规则，会出现「同步被阻断但手工能建」的不一致（见第 7 节） |
| 中文名称必填 | 表单把 `nameZh` 设为必填，而 Component/Material 远端全部为空（见第 7 节） |

## 6. 数据与迁移

- 本次**只增加一条建档规则，不修改历史数据**；同步是幂等的，重复执行不会重复建档。
- 预期新增：Equipment 4 条 + Component 28 条 + Material 22 条 = **54 条**（以当前远端 100 条、本地 72 条为基准）。
- 被阻断：Equipment 2 条（`MAT-00049`、`MAT-00098`），需远端补齐 `Customer Part No.`。
- 若生产库已有老逻辑按 item code 建的实例型号行，需要先决定处理方式（第 7 节问题 1），再执行同步。

## 7. 待确认问题

1. **存量 SL 编码行怎么处理？** 生产库是否已有老逻辑按 `customer_item_code` 建的行（类型被写成 `Material`）？如果有，建议按远端类型纠正 `instanceType` 并保留；不建议删除（可能已被需求单引用）。
2. **Component / Material 的 item code 是否强制 `SL` 前缀？** 当前 100 条全部是 SL，建议「不以 SL 开头则提醒但不阻断」。
3. **Equipment 的 part no 不合规时是整条阻断吗？** 按需求是阻断 + 提示远端维护；确认不做「先建档后标记待维护」。
4. **`name_zh` 为空怎么办？** Component/Material 全部为空，而本地表单中文名称是必填：建议允许这两类为空（或用机型兜底），否则建档后无法在页面编辑保存。
5. **手动新增/模板导入是否套用同一规则？** 建议 Equipment 同样要求 06/99 开头，避免绕过同步建脏数据；如果暂时不做，需要接受两种入口口径不一致。
6. **99 开头 Equipment 目前没有样本**，规则按前缀预留，是否确认。

## 8. 实施步骤

| 步骤 | 内容 | 预估 |
| --- | --- | --- |
| 1 | 同步服务读取 `material_type`，实现类型分支建档、双键匹配、`instanceType` 按类型写入 | 0.5 天 |
| 2 | Equipment 编码校验与阻断明细（含提示文案） | 0.5 天 |
| 3 | 台账新增统计列（createdEquipment / createdComponent / createdMaterial / blockedByPartNoRule）+ 迁移脚本 | 0.5 天 |
| 4 | 页面同步结果结构化提示 + 阻断清单 + 试运行开关 | 0.5 天 |
| 5 | 单元测试（各类型建档键、06/99 校验、双键匹配、阻断计数） | 0.5 天 |
| 6 | 先用试运行核对 54 新增 / 2 阻断，再正式同步并验收 | 0.5 天 |

合计约 **3 天**。

## 附录：验证用接口

```bash
# 远端全部物料（含类型）
GET /api/resource/Material?limit_page_length=0&fields=["name","material_type","customer_part_no","customer_item_code","model","material_code","name_zh"]

# 本地实例型号
SELECT deviceCode, instanceType, modelCode, xxllCode, nameZh FROM merge_power_instancemodels;

# 同步台账
SELECT syncRunId, status, fetchedCount, matchedCount, createdCount, errorJson FROM merge_power_material_sync_runs ORDER BY startedAt DESC;
```
