# 启动 Docker 生产环境脚本

Write-Host "`n🚀 ========== 启动 Docker 生产环境 ==========" -ForegroundColor Cyan

# 检查 Docker
Write-Host "`n1. 检查 Docker 状态..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    Write-Host "   ✅ Docker: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Docker 未安装或未运行" -ForegroundColor Red
    exit 1
}

# 检查端口占用
Write-Host "`n2. 检查端口占用..." -ForegroundColor Yellow
$port7001 = Get-NetTCPConnection -LocalPort 7001 -ErrorAction SilentlyContinue
if ($port7001) {
    Write-Host "   ⚠️  端口 7001 已被占用" -ForegroundColor Yellow
    Write-Host "   正在停止旧容器..." -ForegroundColor Yellow
    docker-compose -f docker-compose.prod.yml down 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

# 设置环境变量
Write-Host "`n3. 设置环境变量..." -ForegroundColor Yellow
$env:DB_PASSWORD = "k19941030"
$env:DB_NAME = "BTHsprots"
$env:JWT_SECRET = "your-secret-key-change-in-production"
Write-Host "   ✅ 环境变量已设置" -ForegroundColor Green

# 停止旧容器
Write-Host "`n4. 清理旧容器..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml down 2>&1 | Out-Null
Write-Host "   ✅ 清理完成" -ForegroundColor Green

# 构建并启动
Write-Host "`n5. 构建并启动服务（这可能需要几分钟）..." -ForegroundColor Yellow
Write-Host "   正在构建 Docker 镜像..." -ForegroundColor Cyan

$buildOutput = docker-compose -f docker-compose.prod.yml up --build -d 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ 服务启动命令执行成功" -ForegroundColor Green
} else {
    Write-Host "   ❌ 服务启动失败" -ForegroundColor Red
    Write-Host $buildOutput
    exit 1
}

# 等待服务启动
Write-Host "`n6. 等待服务启动（30秒）..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# 检查容器状态
Write-Host "`n7. 检查容器状态..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml ps

# 检查应用健康状态
Write-Host "`n8. 检查应用健康状态..." -ForegroundColor Yellow
$maxRetries = 10
$retryCount = 0
$isReady = $false

while ($retryCount -lt $maxRetries -and -not $isReady) {
    $retryCount++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:7001/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $isReady = $true
            Write-Host "   ✅ 应用服务已就绪！" -ForegroundColor Green
        }
    } catch {
        Write-Host "   ⏳ 等待中... ($retryCount/$maxRetries)" -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
}

if (-not $isReady) {
    Write-Host "   ⚠️  应用服务可能还在启动中，请稍候..." -ForegroundColor Yellow
    Write-Host "   查看日志: docker-compose -f docker-compose.prod.yml logs app" -ForegroundColor Cyan
}

# 显示访问信息
Write-Host "`n📋 ========== 访问信息 ==========" -ForegroundColor Cyan
Write-Host "   后端 API: http://localhost:7001" -ForegroundColor Green
Write-Host "   前端页面: http://localhost:7001 (生产构建版本)" -ForegroundColor Green
Write-Host "`n   如果前端开发服务器在运行，访问: http://localhost:7000" -ForegroundColor Yellow
Write-Host "   (前端开发服务器会代理 API 请求到 Docker 后端的 7001 端口)" -ForegroundColor Yellow

Write-Host "`n📝 常用命令:" -ForegroundColor Cyan
Write-Host "   查看日志: docker-compose -f docker-compose.prod.yml logs -f app" -ForegroundColor White
Write-Host "   停止服务: docker-compose -f docker-compose.prod.yml down" -ForegroundColor White
Write-Host "   重启服务: docker-compose -f docker-compose.prod.yml restart" -ForegroundColor White

Write-Host "`n✅ Docker 生产环境启动完成！" -ForegroundColor Green

