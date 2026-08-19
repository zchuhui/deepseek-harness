# cleanup-dsh-node.ps1 — Terminate leftover dsh runtime node.exe processes.
#
# Detects node.exe processes that belong to a dsh runtime (the desktop shell's
# embedded runtime, a built `lib/bin.js` launch, a source `apps/cli/src/bin.ts`
# launch, or `pnpm dsh`) and kills their process trees, so a subsequent launch
# never collides on a held loopback port. Unrelated node.exe processes are left
# alone unless -All is passed.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File cleanup-dsh-node.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File cleanup-dsh-node.ps1 -WhatIf
#   powershell -NoProfile -ExecutionPolicy Bypass -File cleanup-dsh-node.ps1 -All
#
# Windows PowerShell 5.1 compatible: no pwsh-only syntax. Comments are English;
# user-facing messages are Chinese.

param(
    # Terminate every node.exe, not only dsh runtime processes. Dangerous: this
    # also stops unrelated Node tooling (editors, dev servers, package managers).
    [switch]$All,

    # Print the processes that would be terminated without killing anything.
    [switch]$WhatIf
)

# $true when a node.exe process is a dsh runtime, judged by its command line or
# executable path. The markers are the shell's embedded runtime and the three
# dsh launch shapes; anything else is left for the caller to judge.
function Test-IsDshNode {
    param([string]$CommandLine, [string]$ExecutablePath)

    if (-not [string]::IsNullOrEmpty($ExecutablePath) -and $ExecutablePath -match '\\runtime\\node\.exe$') {
        return $true
    }
    if ([string]::IsNullOrEmpty($CommandLine)) {
        return $false
    }
    return ($CommandLine -match 'lib[\\/]bin\.js') -or
           ($CommandLine -match 'apps[\\/]cli[\\/]src[\\/]bin\.ts') -or
           ($CommandLine -match 'pnpm.*\bdsh\b')
}

$nodes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue)
if ($nodes.Count -eq 0) {
    Write-Host "未发现残留的 node.exe 进程。" -ForegroundColor Green
    exit 0
}

$targets = @()
foreach ($node in $nodes) {
    if ($All) {
        $targets += $node
    } elseif (Test-IsDshNode $node.CommandLine $node.ExecutablePath) {
        $targets += $node
    }
}

if ($targets.Count -eq 0) {
    Write-Host "未发现残留的 dsh node.exe 进程(其他 node.exe 未受影响)。" -ForegroundColor Green
    exit 0
}

$scope = if ($All) { "所有 node.exe" } else { "dsh 运行时 node.exe" }
$verb = if ($WhatIf) { "将清理" } else { "正在清理" }
Write-Host "$verb $($targets.Count) 个残留的 $scope 进程:" -ForegroundColor Yellow

foreach ($target in $targets) {
    $cmd = $target.CommandLine
    if ([string]::IsNullOrEmpty($cmd)) { $cmd = $target.ExecutablePath }
    if ([string]::IsNullOrEmpty($cmd)) { $cmd = "(no command line)" }
    if ($cmd.Length -gt 100) { $cmd = $cmd.Substring(0, 100) + "..." }
    Write-Host ("  PID {0}: {1}" -f $target.ProcessId, $cmd)
}

if ($WhatIf) {
    Write-Host "预览模式:未终止任何进程。去掉 -WhatIf 可实际清理。" -ForegroundColor Cyan
    exit 0
}

$failed = @()
foreach ($target in $targets) {
    # taskkill /T /F terminates the whole tree; capture output so the report
    # stays clean. Exit 0 is success; 128 means the process already exited.
    $null = & taskkill /PID $target.ProcessId /T /F 2>&1
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 128) {
        $failed += $target.ProcessId
    }
}

if ($failed.Count -eq 0) {
    Write-Host "已清理 $($targets.Count) 个进程。" -ForegroundColor Green
} else {
    Write-Host "部分进程清理失败(PID: $($failed -join ', '))。" -ForegroundColor Red
    exit 1
}
