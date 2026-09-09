param(
  [string]$TaskName = "Suanli Material Sync",
  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot)
)

$resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$command = "Set-Location -LiteralPath '$resolvedProjectPath'; npm.cmd run sync:materials"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "Hourly Frappe Material sync" -Force | Out-Null
Write-Output "Registered scheduled task: $TaskName"
