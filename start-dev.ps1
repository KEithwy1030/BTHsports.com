# 本地开发环境启动脚本
# 用于Windows PowerShell

Write-Host "🚀 启动在线看球平台本地开发环境..." -ForegroundColor Green
Write-Host ""

# 检查Node.js
Write-Host "📦 检查Node.js环境..." -ForegroundColor Yellow
$nodeVersion = node -v 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 未找到Node.js，请先安装Node.js 20+" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js版本: $nodeVersion" -ForegroundColor Green

# 检查依赖
Write-Host ""
Write-Host "📦 检查依赖..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "⚠️  未找到node_modules，正在安装依赖..." -ForegroundColor Yellow
    npm install
}

if (-not (Test-Path "client/node_modules")) {
    Write-Host "⚠️  未找到client/node_modules，正在安装前端依赖..." -ForegroundColor Yellow
    Set-Location client
    npm install
    Set-Location ..
}

# 检查环境配置文件
Write-Host ""
Write-Host "⚙️  检查环境配置..." -ForegroundColor Yellow
if (-not (Test-Path "env.dev")) {
    Write-Host "⚠️  未找到env.dev文件，正在从env.example创建..." -ForegroundColor Yellow
    if (Test-Path "env.example") {
        Copy-Item "env.example" "env.dev"
        Write-Host "✅ 已创建env.dev，请根据你的环境修改配置" -ForegroundColor Green
    } else {
        Write-Host "❌ 未找到env.example文件" -ForegroundColor Red
    }
}

# 启动服务
Write-Host ""
Write-Host "🚀 启动开发服务..." -ForegroundColor Green
Write-Host "前端: http://localhost:7000" -ForegroundColor Cyan
Write-Host "后端: http://localhost:7001" -ForegroundColor Cyan
Write-Host ""
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Yellow
Write-Host ""

# 启动开发服务
npm run dev

