# Docker 环境配置指南

## 📋 概述

使用 Docker 运行项目可以模拟 Zeabur 部署环境，提前发现环境相关问题。

## 🚀 快速开始

### 开发模式（热重载）

```bash
# 启动所有服务（前端、后端、MySQL、Redis）
docker-compose up

# 后台运行
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

**访问地址：**
- 前端：http://localhost:7000
- 后端API：http://localhost:7001
- MySQL：localhost:3306
- Redis：localhost:6379

### 生产模式（模拟 Zeabur）

```bash
# 构建并启动生产环境
docker-compose -f docker-compose.prod.yml up --build

# 后台运行
docker-compose -f docker-compose.prod.yml up -d --build

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f app

# 停止服务
docker-compose -f docker-compose.prod.yml down
```

**访问地址：**
- 应用：http://localhost:7001
- MySQL：localhost:3306
- Redis：localhost:6379

## 🔧 配置说明

### 环境变量

#### 开发模式（docker-compose.yml）
- `NODE_ENV=development` - 开发模式
- `DB_HOST=mysql` - 数据库主机（Docker 服务名）
- `REDIS_HOST=redis` - Redis 主机（Docker 服务名）
- `ENABLE_BROWSER=false` - 禁用浏览器功能（模拟云环境）

#### 生产模式（docker-compose.prod.yml）
- `NODE_ENV=production` - 生产模式
- `CORS_ORIGINS=*` - 允许所有来源（模拟 Zeabur）
- 其他配置与开发模式相同

### 数据库初始化

首次启动时，MySQL 容器会自动执行 `server/config/` 目录下的 SQL 文件。

如果需要手动初始化：

```bash
# 进入 MySQL 容器
docker-compose exec mysql mysql -uroot -pk19941030 BTHsprots

# 或执行 SQL 文件
docker-compose exec -T mysql mysql -uroot -pk19941030 BTHsprots < server/config/schema.sql
```

### 数据持久化

- **MySQL 数据**：存储在 Docker volume `mysql_dev_data` 或 `mysql_data`
- **Redis 数据**：存储在 Docker volume `redis_dev_data` 或 `redis_data`

删除数据卷（清空数据）：
```bash
docker-compose down -v
```

## 🐛 常见问题

### 1. 端口被占用

**问题**：`Error: bind: address already in use`

**解决**：
```bash
# 检查端口占用
netstat -ano | findstr :7000
netstat -ano | findstr :7001

# 修改 docker-compose.yml 中的端口映射
ports:
  - "7002:7001"  # 改为其他端口
```

### 2. 数据库连接失败

**问题**：`Error: connect ECONNREFUSED`

**解决**：
```bash
# 检查 MySQL 服务状态
docker-compose ps mysql

# 查看 MySQL 日志
docker-compose logs mysql

# 等待 MySQL 完全启动（健康检查通过）
docker-compose up -d mysql
# 等待 30 秒后再启动应用
```

### 3. 前端无法连接后端

**问题**：前端代理配置错误

**解决**：
- 开发模式：确保 `VITE_API_PROXY_TARGET=http://api:7001`（使用 Docker 服务名）
- 生产模式：前端已构建，直接访问后端 API

### 4. 浏览器功能不可用

**说明**：这是预期行为。Docker 环境中默认禁用浏览器自动化功能，模拟 Zeabur 云环境。

如需启用（仅本地测试）：
```yaml
environment:
  ENABLE_BROWSER: "true"
  CHROME_PATH: "/usr/bin/chromium-browser"  # 需要在镜像中安装 Chrome
```

## 📊 与 Zeabur 环境对比

| 配置项 | Docker 环境 | Zeabur 环境 | 说明 |
|--------|------------|------------|------|
| Node.js 版本 | 20-alpine | 20 | ✅ 一致 |
| 操作系统 | Alpine Linux | Linux | ✅ 一致 |
| 数据库 | MySQL 8.0 | MySQL 8.0+ | ✅ 一致 |
| Redis | 可选 | 可选 | ✅ 一致 |
| 浏览器功能 | 默认禁用 | 默认禁用 | ✅ 一致 |
| 环境变量注入 | 手动配置 | 自动注入 | ⚠️ 需手动配置 |
| 端口 | 固定映射 | 动态分配 | ⚠️ 需注意 |
| 数据持久化 | Docker volume | Zeabur volume | ✅ 类似 |

## 🎯 使用建议

1. **开发阶段**：使用 `docker-compose.yml`（开发模式，支持热重载）
2. **部署前测试**：使用 `docker-compose.prod.yml`（生产模式，模拟 Zeabur）
3. **问题排查**：在 Docker 环境中复现问题，更容易定位环境相关问题

## 📝 注意事项

1. **首次启动较慢**：需要下载镜像和安装依赖，可能需要 5-10 分钟
2. **数据持久化**：使用 `docker-compose down -v` 会删除所有数据
3. **资源占用**：Docker 环境会占用更多系统资源（内存、磁盘）
4. **网络隔离**：容器间通过服务名通信，外部通过 localhost 访问

## 🔄 更新代码

### 开发模式
代码修改会自动热重载，无需重启容器。

### 生产模式
需要重新构建镜像：
```bash
docker-compose -f docker-compose.prod.yml up --build
```

