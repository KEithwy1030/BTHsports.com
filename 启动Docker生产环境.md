# 🚀 启动 Docker 生产环境测试

## 当前状态
✅ Docker Desktop 已启动

## 启动步骤

### 方式 1：使用测试脚本（推荐）

在 PowerShell 中运行：
```powershell
.\test-docker-prod.ps1
```

### 方式 2：手动启动

#### 步骤 1：构建并启动服务
```powershell
docker-compose -f docker-compose.prod.yml up --build -d
```

**注意**：
- 首次启动需要下载镜像和构建，可能需要 5-10 分钟
- `-d` 参数表示后台运行
- `--build` 参数会重新构建镜像

#### 步骤 2：查看启动日志
```powershell
# 查看所有服务日志
docker-compose -f docker-compose.prod.yml logs -f

# 只查看应用日志
docker-compose -f docker-compose.prod.yml logs -f app

# 查看 MySQL 日志
docker-compose -f docker-compose.prod.yml logs -f mysql
```

#### 步骤 3：检查服务状态
```powershell
# 查看容器状态
docker-compose -f docker-compose.prod.yml ps

# 或使用 Docker 命令
docker ps
```

#### 步骤 4：等待服务启动
- MySQL 需要 30-60 秒初始化
- 应用需要等待 MySQL 就绪后才能启动
- 总共可能需要 1-2 分钟

#### 步骤 5：测试应用
```powershell
# 健康检查
curl http://localhost:7001/health

# 或使用浏览器访问
# http://localhost:7001/health
```

## 📊 服务信息

启动成功后，可以通过以下地址访问：

| 服务 | 地址 | 说明 |
|------|------|------|
| 应用 | http://localhost:7001 | 前端 + 后端 API |
| 健康检查 | http://localhost:7001/health | 应用健康状态 |
| MySQL | localhost:3306 | 数据库（root/k19941030） |
| Redis | localhost:6379 | 缓存服务 |

## 🔍 常用命令

### 查看日志
```powershell
# 实时查看应用日志
docker-compose -f docker-compose.prod.yml logs -f app

# 查看最近 100 行日志
docker-compose -f docker-compose.prod.yml logs --tail=100 app
```

### 停止服务
```powershell
# 停止所有服务
docker-compose -f docker-compose.prod.yml down

# 停止并删除数据卷（清空数据）
docker-compose -f docker-compose.prod.yml down -v
```

### 重启服务
```powershell
# 重启应用服务
docker-compose -f docker-compose.prod.yml restart app

# 重启所有服务
docker-compose -f docker-compose.prod.yml restart
```

### 进入容器
```powershell
# 进入应用容器
docker-compose -f docker-compose.prod.yml exec app sh

# 进入 MySQL 容器
docker-compose -f docker-compose.prod.yml exec mysql bash
```

## 🐛 问题排查

### 问题 1：构建失败
**错误**：`npm ci` 失败或构建错误

**解决**：
```powershell
# 查看详细错误
docker-compose -f docker-compose.prod.yml build --no-cache

# 检查 Dockerfile 语法
docker build -t test-image .
```

### 问题 2：端口被占用
**错误**：`Error: bind: address already in use`

**解决**：
```powershell
# 检查端口占用
netstat -ano | findstr ":7001"

# 停止本地服务
# 或修改 docker-compose.prod.yml 中的端口映射
```

### 问题 3：MySQL 连接失败
**错误**：`Error: connect ECONNREFUSED`

**解决**：
```powershell
# 等待 MySQL 完全启动
docker-compose -f docker-compose.prod.yml logs mysql

# 检查 MySQL 健康状态
docker-compose -f docker-compose.prod.yml ps mysql
```

### 问题 4：应用无法启动
**错误**：应用容器一直重启

**解决**：
```powershell
# 查看应用日志
docker-compose -f docker-compose.prod.yml logs app

# 检查环境变量
docker-compose -f docker-compose.prod.yml config
```

## ✅ 测试清单

启动成功后，按以下顺序测试：

- [ ] 健康检查：`http://localhost:7001/health` 返回 `{"status":"OK"}`
- [ ] 前端页面：`http://localhost:7001` 显示前端界面
- [ ] API 接口：`http://localhost:7001/api/matches` 返回比赛列表
- [ ] 用户注册：测试注册功能是否正常
- [ ] 信号源播放：测试比赛播放功能
- [ ] 聊天功能：测试聊天区功能

## 📝 下一步

1. 运行启动命令
2. 等待服务启动（1-2 分钟）
3. 访问 http://localhost:7001 开始测试
4. 如有问题，查看日志排查

