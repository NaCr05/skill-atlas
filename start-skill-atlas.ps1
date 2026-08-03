$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[BLOCKED] 未找到 Node.js 20+ / Node.js 20+ was not found."
  Write-Host "[FIX] 安装后重新打开终端 / Install it, then reopen the terminal:"
  Write-Host "winget install OpenJS.NodeJS.LTS"
  exit 1
}

& node (Join-Path $PSScriptRoot "scripts\startup\launcher.mjs") @args
exit $LASTEXITCODE
