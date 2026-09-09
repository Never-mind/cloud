param(
  [string]$TaskName = "Suanli Operation Log Cleanup",
  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot)
)

$resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$command = "Set-Location -LiteralPath '$resolvedProjectPath'; npm.cmd run cleanup:operation-logs"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -Daily -At 3:00AM
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "Daily cleanup of expired Suanli operation logs" -Force | Out-Null
Write-Output "Registered scheduled task: $TaskName"
