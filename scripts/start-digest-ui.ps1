# 启动资讯日报前端（Next dev）。请保持本窗口打开，关掉即网站不可用。
# 用法: powershell -ExecutionPolicy Bypass -File .\scripts\start-digest-ui.ps1
# 浏览器: http://127.0.0.1:3000/digest

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host '未找到 pnpm.cmd，请先安装 pnpm。' -ForegroundColor Red
  exit 1
}

Write-Host '正在启动 Next.js…' -ForegroundColor Cyan
Write-Host '页面: http://127.0.0.1:3000/digest' -ForegroundColor Green
pnpm.cmd dev:web
