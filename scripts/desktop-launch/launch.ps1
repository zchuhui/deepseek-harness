# launch.ps1 — Double-click launcher for the local dsh web service.
#
# Finds an executable dsh (a repository checkout first, then a global dsh on
# PATH), ensures the web server is running on the selected port, and opens the
# default browser. See scripts/desktop-launch/README.md for usage.
#
# Windows PowerShell 5.1 compatible: no pwsh-only syntax. Comments are English;
# user-facing messages are Chinese.

param(
    [int]$Port = 3080,
    [string]$Url = "",
    [switch]$NoBrowser,
    [switch]$Detached
)

# Resolve the URL to open, and the loopback readiness endpoint for the port.
if ([string]::IsNullOrEmpty($Url)) {
    $Url = "http://127.0.0.1:$Port"
}
$healthUrl = "http://127.0.0.1:$Port"

# Walk up from $StartDir looking for a checkout whose package.json name is
# @deepseek-ai/dsh-root. Returns the checkout root, or $null when not found.
function Find-CheckoutRoot {
    param([string]$StartDir)

    $dir = $StartDir
    while (-not [string]::IsNullOrEmpty($dir)) {
        $pkg = Join-Path $dir "package.json"
        if (Test-Path -LiteralPath $pkg -PathType Leaf) {
            try {
                $json = Get-Content -LiteralPath $pkg -Raw | ConvertFrom-Json
                if ($json.name -eq "@deepseek-ai/dsh-root") {
                    return $dir
                }
            } catch {
                # Unreadable or invalid package.json; keep walking up.
            }
        }
        $parent = Split-Path -Parent $dir
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $dir) {
            break
        }
        $dir = $parent
    }
    return $null
}

# $true when a TCP connection to 127.0.0.1:$Port is accepted (port occupied).
function Test-PortListening {
    param([int]$Port)

    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(1500)) {
            return $false
        }
        try {
            $tcp.EndConnect($async)
            return $true
        } catch {
            return $false
        }
    } catch {
        return $false
    } finally {
        $tcp.Close()
    }
}

# $true when $Url answers with a 2xx status.
function Test-HttpOk {
    param([string]$Url)

    try {
        $null = Invoke-WebRequest -Uri $Url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# $true when $Url answers with any HTTP response (2xx or an error status).
function Test-HttpResponding {
    param([string]$Url)

    try {
        $null = Invoke-WebRequest -Uri $Url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        if ($null -ne $_.Exception.Response) {
            return $true
        }
        return $false
    }
}

# 1. Probe the port: reuse an already-running dsh web, or fail on a foreign
#    occupant (occupied without a healthy dsh response).
if (Test-PortListening $Port) {
    if (Test-HttpOk $healthUrl) {
        Write-Host "检测到 dsh web 已在运行:$Url" -ForegroundColor Green
        if (-not $NoBrowser) {
            Start-Process $Url
        }
        exit 0
    }
    Write-Host "端口 $Port 被占用且无 dsh 响应:未检测到可复用的 dsh web。请关闭占用该端口的进程,或用 -Port 指定其他端口后重试。" -ForegroundColor Red
    exit 1
}

# 2. Resolve how to launch dsh web.
$checkoutRoot = Find-CheckoutRoot (Get-Location).Path
if ($null -eq $checkoutRoot) {
    $checkoutRoot = Find-CheckoutRoot $PSScriptRoot
}

$exe = ""
$dshArgs = @()
$workDir = (Get-Location).Path

if ($null -ne $checkoutRoot) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($null -eq $node) {
        Write-Host "检测到仓库 checkout,但未找到 Node.js。请安装 Node.js 22.19+ 或 24+,并在仓库根目录运行 pnpm install 与 pnpm build。" -ForegroundColor Red
        exit 2
    }
    $exe = $node.Source
    $dshArgs = @("--import", "tsx/esm", "apps/cli/src/bin.ts", "web", "--port", "$Port")
    $workDir = $checkoutRoot
} else {
    $dshCmd = Get-Command dsh.cmd -ErrorAction SilentlyContinue
    if ($null -eq $dshCmd) {
        $dshCmd = Get-Command dsh -ErrorAction SilentlyContinue
    }
    if ($null -eq $dshCmd) {
        Write-Host "未找到 dsh。请在仓库根目录运行 pnpm build,或全局安装:npm i -g @deepseek-ai/dsh" -ForegroundColor Red
        exit 2
    }
    $exe = $dshCmd.Source
    $dshArgs = @("web", "--port", "$Port")
}

# 3. Start the service: hidden when -Detached, otherwise attached to this
#    console so its logs stay visible.
$proc = $null
try {
    if ($Detached) {
        $proc = Start-Process -FilePath $exe -ArgumentList $dshArgs -WorkingDirectory $workDir -WindowStyle Hidden -PassThru
    } else {
        $proc = Start-Process -FilePath $exe -ArgumentList $dshArgs -WorkingDirectory $workDir -NoNewWindow -PassThru
    }
} catch {
    Write-Host "启动 dsh web 失败:$($_.Exception.Message)" -ForegroundColor Red
    Write-Host "请确认已运行 pnpm install 与 pnpm build,且 Node.js 版本为 22.19+ 或 24+。"
    exit 1
}

# 4. Poll readiness: up to 60 seconds, one HTTP GET per second. Any HTTP
#    response counts as ready (the web server has no dedicated health route).
$ready = $false
$crashed = $false
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    try {
        if ($proc.HasExited) {
            $crashed = $true
            break
        }
    } catch {
        # The process handle is not ready to report exit state; keep polling.
    }
    if (Test-HttpResponding $healthUrl) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if ($crashed) {
    $code = ""
    try { $code = [string]$proc.ExitCode } catch { }
    if ([string]::IsNullOrEmpty($code)) {
        Write-Host "dsh 运行时启动失败:进程在服务就绪前退出。" -ForegroundColor Red
    } else {
        Write-Host "dsh 运行时启动失败:进程在服务就绪前退出(退出码 $code)。" -ForegroundColor Red
    }
    Write-Host "请确认已生成构建产物(pnpm build);若从源码启动,请先 pnpm install。去掉 -Detached 重新运行可查看详细日志。"
    exit 1
}

if (-not $ready) {
    Write-Host "dsh 运行时未启动:等待 $healthUrl 就绪超过 60 秒。" -ForegroundColor Red
    Write-Host "请确认已生成构建产物(pnpm build),或去掉 -Detached 重新运行以查看详细日志。"
    exit 1
}

# 5. Open the browser, then block (foreground) or return (detached).
if (-not $NoBrowser) {
    Write-Host "dsh web 已就绪,正在打开浏览器:$Url" -ForegroundColor Green
    Start-Process $Url
} else {
    Write-Host "dsh web 已就绪:$Url" -ForegroundColor Green
}

if (-not $Detached) {
    # Keep the console attached to the service; closing it stops dsh.
    Wait-Process -Id $proc.Id -ErrorAction SilentlyContinue
}
