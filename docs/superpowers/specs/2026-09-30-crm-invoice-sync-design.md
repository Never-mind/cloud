# CRM 发票 / 回款同步设计（华为云「账期发票（CRM）」）

日期：2026-09-30
涉及本地：`merge_cloud_rows`（回填目标）、`merge_cloud_crm_invoices`、`merge_cloud_crm_receipts`、
`merge_cloud_crm_customer_mappings`、`merge_cloud_crm_sync_runs`、`merge_cloud_attachments`
涉及远端：CRM OpenAPI `GET /openapi/v1/invoices`、`GET /openapi/v1/receipts`、`GET /openapi/v1/exchange-rates`

## 1. 需求

华为云业务的发票在远端 CRM 系统里开具，本系统的「跨月对账台账」需要人工把发票号、币种、未税/税金/含税、开票日期填进去，
回款也要人工登记。希望：

1. 把 CRM 的发票、回款拉成本地清单，能在系统里直接看；
2. 按账期自动回填到对账行的「客户开票 / 客户实收」字段；
3. 发票 PDF 能直接在系统里查看/下载，不依赖远端链接有效期。

## 2. 远端接口事实（2026-09-30 实测）

| 接口 | 关键字段 | 备注 |
| --- | --- | --- |
| `/openapi/v1/invoices` | `id`、`invoiceNo`、`customerShortName`、`customerSubjectName`、`belongMonth`、`currency`、`invoiceAmountTaxExcluded`、`taxAmount`、`invoiceAmountTaxIncluded`、`invoiceDate`、`paymentTermDays`、`dueDate`、`invoiceType`(1 预付/2 后付)、`invoiceStatus`(1 审核通过/2 已作废)、`attachmentUrl` | 业务线 2 = Cloud |
| `/openapi/v1/receipts` | `id`、`customerShortName`、`currency`、`receiptStatus`、`receiptAmount`、收款银行/账户、`bankSerialNo`、`payerName`、`invoiceNos` | 无具体到账日，只能按到账月份归集 |
| `/openapi/v1/exchange-rates` | `currency`、`targetCurrency`、`exchangeRate` | 部分月份为空 |

三个接口 OPTIONS 实测均为 `Allow: GET`，**没有写接口**，因此本系统不能通过它申请开票，只能拉取。

## 3. 业务确认口径（2026-09-30）

1. 只同步业务线 2（Cloud / 华为云）。
2. 落地形态：新增「账期发票（CRM）」页签，并在页签内回填对账台账。
3. 客户匹配键：主体名称优先、简称兜底，支持人工调整。
4. 映射维护：在页签里手工配一次入库，之后每次同步自动套用；未匹配的在页头提示。
5. 一个客户某账期有多行时：按金额就近匹配到一行，匹配不上标「未匹配」。
6. 本地已有人工数据时：**为空才写**，已有值不一致只提示差异，不覆盖。
7. **已作废发票不参与回填**（业务明确）。← 唯一被单独强调的一条
8. 发票 PDF 下载存本地附件。
9. 回款同期做，独立开关。
10. 汇率取 CRM 值，CRM 无值时保留人工填写。
11. 同步方式：手工按钮 + 每天定时一次，默认最近 3 个月。
12. 权限沿用「华为云业务」模块，不新增权限节点；密钥走环境变量。

## 4. 表设计

| 表 | 唯一键 | 作用 |
| --- | --- | --- |
| `merge_cloud_crm_invoices` | `crmInvoiceId` | 发票本地副本；`backfillStatus` 记录 pending/backfilled/mismatch/unmatched/void |
| `merge_cloud_crm_receipts` | `crmReceiptId` | 回款本地副本 |
| `merge_cloud_crm_customer_mappings` | `crmValueNormalized` | CRM 客户 → 本地对账客户；`source=auto/manual` |
| `merge_cloud_crm_sync_runs` | `syncRunId` | 每次同步的台账（条数、回填、差异、错误明细） |

附件复用 `merge_cloud_attachments`，`ownerType='crm_invoice'`、`ownerId=发票本地记录 ID`。

建表脚本 `npm run schema:crm-invoices`（幂等，只新增表）。

## 5. 同步流程

```
解析月份（默认最近 N 个月）
  → 逐月拉发票 / 回款 / 汇率（汇率失败不影响主流程）
  → 发票、回款按远端 ID upsert 成本地副本
  → 解析客户：主体名称 → 简称 → 本地档案自动匹配（命中即写映射表）
  → 发票回填（作废跳过）：
      定位候选行 = 该账期 + 该客户（customerId 优先，历史行按客户文本兜底）
      选行 = 优先无发票号的行 → 含税应收与发票金额最接近
      逐字段写：本地为空才写；已有值且不同 → 记差异
  → 回款回填：写币种/实收金额/collected=1/收款日期（空则当月首日，备注说明）
  → 下载发票 PDF 到附件表
  → 更新发票/回款记录的回填状态与说明，写同步台账
```

`dryRun=1` 时上述写操作全部跳过，只统计数量，用于正式同步前核对影响面。

## 6. 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/cloud/crm-invoices?kind=invoices\|receipts` | 列表、分页、筛选、币种合计、汇总指标 |
| `GET` | `/api/cloud/crm-invoices?view=mappings` | CRM 客户清单与映射状态 |
| `GET` | `/api/cloud/crm-invoices?view=last-run` | 最近一次同步台账 |
| `POST` | `/api/cloud/crm-invoices/sync` | 触发同步（`months`、`dryRun`、`includeReceipts`、`downloadAttachments`） |
| `POST` / `DELETE` | `/api/cloud/crm-invoices/mappings` | 保存 / 清除客户映射 |
| `GET` | `/api/cloud/crm-invoices/export` | 导出发票或回款 |
| `GET/POST/DELETE` | `/api/cloud/attachments/crm_invoice/*` | 发票 PDF 列表 / 上传 / 下载 / 删除 |

权限：路由前缀落在 `/api/cloud` 上，按「华为云业务」模块鉴权（查看=GET，同步/保存=新增动作，导出=导出动作）。

## 7. 定时任务

- 脚本：`npm run sync:crm-invoices`（可用 `-- 2026-09 2026-08` 指定账期，`--dry-run` 只统计）。
- 注册：`scripts/register-crm-invoice-sync-task.ps1`，默认任务名 `Suanli CRM Invoice Sync`，每天 06:30。

## 8. 上线后仍需业务确认的点

- 华为云主体的发票（`华为云计算技术有限公司` / `Sparkoo Technologies Chile SpA`）在本地对账台账没有对应客户行，
  同步后会显示「本地无对账行」。这类发票是否要落到某个本地客户、或需要对账台账补行，需要业务确认。
- `智娱（HK WANZHONG TECHNOLOGY LIMITED）`、`雷电（Thunderbolt）` 等 CRM 客户在本地没有同名的客户档案，
  需要在「客户映射」里人工指定，或在客户档案里补建。

## 9. 测试与验证（本地实测）

- `npm test`：`src/lib/crm-config.test.ts` 覆盖地址/密钥/业务线/月份/超时的解析与兜底。
- 本地真实数据实测：同步 2026-07~09 共 51 张发票、8 条回款、50 个附件；回填 5 条（2 发票 + 3 回款），
  其余按「未配置映射」或「本地无对账行」给出原因，作废发票不参与回填。
- 重复同步幂等：第二次运行全部走 update，不产生重复记录。
