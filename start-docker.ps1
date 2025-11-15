# Docker 生产环境启动脚本
Write-Host "🚀 正在启动 Docker 生产环境..." -ForegroundColor Green
Write-Host ""

# 切换到项目目录
Set-Location $PSScriptRoot

# 检查 Docker
Write-Host "📋 检查 Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    Write-Host "✅ $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker 未安装或未启动" -ForegroundColor Red
    exit 1
}

# 停止可能存在的旧容器
Write-Host "`n🧹 清理旧容器..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml down 2>&1 | Out-Null

# 构建并启动
Write-Host "`n🔨 构建镜像（这可能需要几分钟，请耐心等待）..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml build 2>&1 | Tee-Object -Variable buildOutput

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ 构建失败！" -ForegroundColor Red
    Write-Host $buildOutput
    exit 1
}

Write-Host "`n🚀 启动服务..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml up -d 2>&1 | Tee-Object -Variable startOutput

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ 启动失败！" -ForegroundColor Red
    Write-Host $startOutput
    exit 1
}

Write-Host "`n⏳ 等待服务启动（30秒）..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# 检查状态
Write-Host "`n📊 服务状态:" -ForegroundColor Cyan
docker-compose -f docker-compose.prod.yml ps

# 测试健康检查
Write-Host "`n🔍 测试健康检查..." -ForegroundColor Yellow
$maxRetries = 10
$retryCount = 0
$success = $false

while ($retryCount -lt $maxRetries -and -not $success) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:7001/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ 应用健康检查通过！" -ForegroundColor Green
            $response.Content
            $success = $true
        }
    } catch {
        $retryCount++
        Write-Host "   尝试 $retryCount/$maxRetries..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
}

if (-not $success) {
    Write-Host "`n⚠️  健康检查失败，但服务可能仍在启动中" -ForegroundColor Yellow
    Write-Host "   查看日志: docker-compose -f docker-compose.prod.yml logs -f app" -ForegroundColor Yellow
}

Write-Host "`n📝 服务信息:" -ForegroundColor Cyan
Write-Host "   - 应用地址: http://localhost:7001" -ForegroundColor White
Write-Host "   - 健康检查: http://localhost:7001/health" -ForegroundColor White
Write-Host "   - MySQL: localhost:3306 (root/k19941030)" -ForegroundColor White
Write-Host "   - Redis: localhost:6379" -ForegroundColor White

Write-Host "`n📋 常用命令:" -ForegroundColor Cyan
Write-Host "   - 查看日志: docker-compose -f docker-compose.prod.yml logs -f app" -ForegroundColor White
Write-Host "   - 停止服务: docker-compose -f docker-compose.prod.yml down" -ForegroundColor White
Write-Host "   - 查看状态: docker-compose -f docker-compose.prod.yml ps" -ForegroundColor White

Write-Host "`n✅ 启动完成！" -ForegroundColor Green

