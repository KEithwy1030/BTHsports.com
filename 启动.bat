@echo off
chcp 65001 >nul
echo.
echo ========== 启动 Docker 生产环境 ==========
echo.

REM 设置环境变量
set DB_PASSWORD=k19941030
set DB_NAME=BTHsprots
set JWT_SECRET=your-secret-key-change-in-production

echo 1. 清理旧容器...
docker-compose -f docker-compose.prod.yml down

echo.
echo 2. 构建并启动服务（这可能需要几分钟）...
docker-compose -f docker-compose.prod.yml up --build -d

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ 启动失败！
    pause
    exit /b 1
)

echo.
echo ✅ 服务启动命令执行成功！
echo.
echo ⏳ 等待服务启动（30秒）...
timeout /t 30 /nobreak >nul

echo.
echo 📋 检查服务状态:
docker-compose -f docker-compose.prod.yml ps

echo.
echo ========== 启动完成 ==========
echo.
echo 📝 访问信息:
echo    - 后端 API: http://localhost:7001
echo    - 前端页面: http://localhost:7001 (生产构建版本)
echo    - 前端开发服务器: http://localhost:7000 (如果单独运行)
echo.
echo 📝 查看日志:
echo    docker-compose -f docker-compose.prod.yml logs -f app
echo.
echo 按任意键退出...
pause >nul

