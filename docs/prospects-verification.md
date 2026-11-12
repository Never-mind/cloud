# 潜在客户验收记录（2026-11-10）

## 已完成

- 新增、跟进、转新客户和关联已有客户；联系人带入、历史及附件保留。
- 独立本地测试数据库集成验证：同单并发幂等、跨记录同税号防重、失败事务回滚、已转化只读。结果见本地 `backup/prospects/integration-verified.json`。
- 页面检查：列表、详情、跟进表单、转化表单的资料预填及布局。浏览器写入验收因自动审批限制未完成。
- 最终32项测试通过：`prospect.test.ts`、`prospect-service.test.ts`、`prospect-access.test.ts`、`permission-definitions.test.ts`、`attachment-storage-guard.test.ts`。
- `npx tsc --noEmit --incremental false` 通过。
- 最终构建 `.next-prospects-final-20261110` 通过，包含潜在客户页面与接口。构建ID：`EOOJ4JctUPTtSszo_YT1E`。

## 已启用（2026-11-10 18:23，北京时间）

在用户再次要求重启后，受控重启命令获准并成功执行。保持现有生产库 `139.9.122.9/cloud`，启动前核对数据库身份。

- 已完成5条增量迁移语句；原表结构备份：`backup/prospects/schema-before-1794306216707.json`。
- 5174已运行 `.next-prospects-final-20261110`；登录页HTTP 200，并通过两份静态代码文件的SHA-256比对验证版本。
- 启动错误日志为空。飞书开票、付款自动同步及Frappe每30分钟/登录触发同步均正常启用。
- 启动日志：`tmp/prospects-5174-20261110-182339.stdout.log`。
- 没有向生产库写入测试潜在客户。

本机后续可用 `tmp/restart-prospects-5174.ps1` 重启；脚本校验运行代码与进程身份，再执行可重复的结构迁移和服务替换。

原5174构建保留，可用于服务回退；数据库只新增表和可空字段，不需要删除业务数据。代码未推送仓库。
