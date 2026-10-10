param(
  [string]$TaskName = "Suanli Feishu Approval Sync",
  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot),
  [int]$EveryMinutes = 2
)

# 每 2 分钟把飞书开票审批的状态拉回来（撤回 / 驳回 / 通过），并把审批通过但还没出票的补出票。
# 不挂这个任务时，飞书里撤回或审批通过后，系统里会一直停在「审批中」。
$resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$command = "Set-Location -LiteralPath '$resolvedProjectPath'; npm.cmd run feishu:approval-sync"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description "Poll Feishu invoicing approval status" -Force | Out-Null
Write-Output "Registered scheduled task: $TaskName (every $EveryMinutes minutes)"
