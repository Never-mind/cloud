# 实施记录

原有基础：merge_common_invoices、merge_common_invoice_items、merge_common_invoice_allocations、merge_common_feishu_approvals.allocationSourceIds。

需解除的耦合：saveInvoice 以 resolved.lines[index] 回填金额，无法支持票面仅一行；审批回票现以当时账单重新求和且要求币种相等，无法处理跨币种合并回票。

既有安全校验应延续：同一开票主体同一发票号禁止重复建票、每个来源不能被其他有效发票/审批占用；变更分摊必须锁定并整批提交。

## 2026-10-29 验证与发布

- 全量回归：134 个测试文件、856 个用例通过。类型检查通过，独立生产构建通过；最终页面提示修订另经构建与浏览器校验。
- 后端案例：六个 USD 100 账期按汇率 7 开 CNY 4,200，一张票、一行票面、各月 700，原应收不变；同票重新分摊、移除月份、旧 revision、任一写入失败回滚、整票作废均有用例。
- 隔离浏览器验证 8 条流程：华为云及服务费外部上传各一条，本地/Cloud/VAT 合并一行各一条，原票复用、回票登记、切换实际客户 B 后再关联六个月。接口全部拦截到固定测试数据，生产业务写入 0、真实审批 0。
- 修复回票多文件登记 SQL 的 prepared statement 数组参数：每个附件绑定独立占位符，确保多文件确认可以一起保存。
- 新增结构迁移已执行 5 条 DDL：两处快照字段、关联来源 TEXT、增加主体＋票号索引、移除全局票号索引。业务行未更新。原结构备份：`tmp/invoice-allocation-schema/before-1793245933315.json`。
- 远程库只读校验通过：新字段和索引正确；华为云 122 条来源、服务费 106 条来源的查询正常，分别验证了一个客户的候选月份和占用提示。没有读取或输出凭据。
- 运行前保留旧构建，使用 `tmp/start-remote-db-local-verified.cjs` 启动 5174；启动后检查登录、失效会话恢复及静态资源。
- 最终构建 BnLMGI7XdtdOesVUcgyUq 已激活到 5174，进程 22152；旧构建位于 `backup/runtime-5174-before-multi-period-20261029/.next`。
- 运行检查：匿名登录 200、飞书登录按钮可见；不存在账号的签名会话正确返回 logout/login 并清 cookie，没有服务端渲染异常。浏览器页面错误、资源异常和失败请求均为 0。未测试真实发起飞书审批或写入生产发票。
