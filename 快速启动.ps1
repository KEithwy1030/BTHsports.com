# 快速启动 Docker 生产环境
Write-Host "🚀 启动 Docker 生产环境..." -ForegroundColor Green

# 停止旧容器
Write-Host "`n🧹 清理旧容器..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml down 2>&1 | Out-Null

# 先启动 MySQL
Write-Host "`n📦 启动 MySQL..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml up -d mysql

# 等待 MySQL 启动
Write-Host "`n⏳ 等待 MySQL 启动（60秒）..." -ForegroundColor Yellow
$mysqlHealthy = $false
for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Seconds 5
    $status = docker-compose -f docker-compose.prod.yml ps mysql 2>&1
    if ($status -match "healthy") {
        Write-Host "   ✅ MySQL 健康检查通过！" -ForegroundColor Green
        $mysqlHealthy = $true
        break
    }
    Write-Host "   等待中... ($($i+1)/12)" -ForegroundColor Yellow
}

if (-not $mysqlHealthy) {
    Write-Host "`n⚠️  MySQL 健康检查未通过，但继续启动 App..." -ForegroundColor Yellow
    docker-compose -f docker-compose.prod.yml logs mysql | Select-Object -Last 10
}

# 启动 Redis（如果未启动）
Write-Host "`n📦 启动 Redis..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml up -d redis

# 启动 App
Write-Host "`n📦 启动 App..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml up -d app

# 等待 App 启动
Write-Host "`n⏳ 等待 App 启动（10秒）..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 显示状态
Write-Host "`n📊 服务状态:" -ForegroundColor Cyan
docker-compose -f docker-compose.prod.yml ps

# 测试健康检查
Write-Host "`n🔍 测试应用健康检查..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:7001/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ 应用健康检查通过！" -ForegroundColor Green
    Write-Host "   响应: $($response.Content)" -ForegroundColor White
} catch {
    Write-Host "   ⚠️  健康检查失败，应用可能仍在启动中" -ForegroundColor Yellow
    Write-Host "   错误: $_" -ForegroundColor Red
}

Write-Host "`n📝 访问地址:" -ForegroundColor Cyan
Write-Host "   - 应用: http://localhost:7001" -ForegroundColor White
Write-Host "   - 健康检查: http://localhost:7001/health" -ForegroundColor White

Write-Host "`n📋 查看日志:" -ForegroundColor Cyan
Write-Host "   - App: docker-compose -f docker-compose.prod.yml logs -f app" -ForegroundColor White
Write-Host "   - MySQL: docker-compose -f docker-compose.prod.yml logs -f mysql" -ForegroundColor White

