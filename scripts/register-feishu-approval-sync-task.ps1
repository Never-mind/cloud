param(
  [string]$TaskName = "Suanli Feishu Approval Sync",
  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot),
  [int]$EveryMinutes = 2
)

# 历史外部调度入口；常驻后端已内置开票/付款同步，当前部署无需注册本任务。
# 本任务每 2 分钟调用开票同步及历史付款补录，不能视为当前付款增量轮询：
#   1. 开票审批：拉回撤回 / 驳回 / 通过状态，并补出票；
#   2. 成本款付款审批：同步总状态，并把「确认是否到账」节点通过时间回填实际付款日期。
# 生产使用内置调度时请停用旧任务；使用前核对部署文档第 7.3 节与付款补录范围。
$resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$command = "Set-Location -LiteralPath '$resolvedProjectPath'; npm.cmd run feishu:approval-sync; npm.cmd run feishu:cost-payment-sync"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "Poll Feishu invoicing and cost-payment approval status" -Force | Out-Null
Write-Output "Registered scheduled task: $TaskName (every $EveryMinutes minutes)"
