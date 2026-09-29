param(
  [string]$TaskName = "Suanli Notification Scan",
  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot),
  [string]$At = "09:00"
)

# 每天固定时间扫描并发送到点的业务提醒（如：验收完成后 N 天提醒开票/收款）。
# 用法：powershell -ExecutionPolicy Bypass -File scripts/register-notification-task.ps1
$resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$command = "Set-Location -LiteralPath '$resolvedProjectPath'; npm.cmd run notify:run"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "Daily business notification scan (Feishu + in-app)" -Force | Out-Null
Write-Output "Registered scheduled task: $TaskName (daily at $At)"
