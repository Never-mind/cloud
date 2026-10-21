param(
  [string]$TaskName = "Suanli Feishu Approval Sync",
  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot),
  [int]$EveryMinutes = 2
)

# 每 2 分钟同步两类飞书审批：
#   1. 开票审批：拉回撤回 / 驳回 / 通过状态，并补出票；
#   2. 成本款付款审批：同步总状态，并把「确认是否到账」节点通过时间回填实际付款日期。
# 不挂这个任务时，飞书里撤回或审批通过后，系统里的状态和付款日期不会自动更新。
$resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$command = "Set-Location -LiteralPath '$resolvedProjectPath'; npm.cmd run feishu:approval-sync; npm.cmd run feishu:cost-payment-sync"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "Poll Feishu invoicing and cost-payment approval status" -Force | Out-Null
Write-Output "Registered scheduled task: $TaskName (every $EveryMinutes minutes)"
