param(
  [string]$TaskName = "Suanli Import Jobs Cleanup",
  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot),
  [int]$Days = 7
)

# 每周清一次导入任务的预览快照（previewJson），避免它一直占库（实测 69 个任务占了 129MB）。
$resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$command = "Set-Location -LiteralPath '$resolvedProjectPath'; npm.cmd run cleanup:import-jobs -- --days=$Days"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "03:30"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "Weekly cleanup of import job preview snapshots" -Force | Out-Null
Write-Output "Registered scheduled task: $TaskName (weekly Sunday 03:30, keep $Days days)"
