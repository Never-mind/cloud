param(
  [string]$TaskName = "Suanli CRM Invoice Sync",
  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot),
  [string]$At = "06:30"
)

# 每天跑一次 CRM 发票 / 回款同步（默认同步最近 3 个月，见 CRM_SYNC_MONTHS）。
$resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$command = "Set-Location -LiteralPath '$resolvedProjectPath'; npm.cmd run sync:crm-invoices"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "Daily CRM invoice and receipt sync" -Force | Out-Null
Write-Output "Registered scheduled task: $TaskName (daily at $At)"
