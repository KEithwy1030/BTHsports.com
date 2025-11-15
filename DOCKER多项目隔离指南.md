# Docker 多项目隔离指南

## ⚠️ 潜在冲突点

### 1. 端口冲突（高风险）

**当前项目使用的端口：**
- **生产环境** (`docker-compose.prod.yml`):
  - `7001` - 应用端口
  - `6379` - Redis 端口
  - MySQL 不映射外部端口（已优化）

- **开发环境** (`docker-compose.yml`):
  - `7000` - 前端端口
  - `7001` - 后端端口
  - `3306` - MySQL 端口
  - `6379` - Redis 端口

**冲突风险：**
- ✅ **低风险**：生产环境（MySQL 不映射端口）
- ⚠️ **高风险**：开发环境（所有端口都映射）

### 2. 数据卷名称冲突（中等风险）

**当前项目使用的数据卷：**
- `live_show_mysql_data` - MySQL 数据
- `live_show_redis_data` - Redis 数据
- `live_show_api_node_modules` - API node_modules（开发环境）
- `live_show_client_node_modules` - Client node_modules（开发环境）

**冲突风险：**
- ✅ **低风险**：数据卷名称包含项目名（`live_show_` 前缀）

### 3. 网络名称冲突（低风险）

**当前项目使用的网络：**
- `live_show_default` - 默认网络（基于目录名）

**冲突风险：**
- ✅ **低风险**：网络名称基于项目目录名，不同项目目录不会冲突

### 4. 容器名称冲突（低风险）

**当前项目容器名称：**
- `live_show-app-1` - 应用容器
- `live_show-mysql-1` - MySQL 容器
- `live_show-redis-1` - Redis 容器

**冲突风险：**
- ✅ **低风险**：容器名称包含项目名（`live_show_` 前缀）

## ✅ 解决方案

### 方案 1：使用项目名称隔离（推荐）

Docker Compose 默认使用目录名作为项目名，不同目录的项目会自动隔离。

**优点：**
- 无需额外配置
- 自动隔离网络、数据卷、容器名称

**使用方式：**
```powershell
# 项目 A（在目录 A 中）
cd E:\ProjectA
docker-compose -f docker-compose.prod.yml up -d

# 项目 B（在目录 B 中）
cd E:\ProjectB
docker-compose -f docker-compose.prod.yml up -d
```

### 方案 2：自定义项目名称

使用 `-p` 参数指定项目名：

```powershell
# 项目 A
docker-compose -p project-a -f docker-compose.prod.yml up -d

# 项目 B
docker-compose -p project-b -f docker-compose.prod.yml up -d
```

### 方案 3：修改端口映射（如果端口冲突）

如果多个项目需要使用相同端口，修改端口映射：

```yaml
# docker-compose.prod.yml
services:
  app:
    ports:
      - "7002:7001"  # 外部端口改为 7002，避免冲突
```

### 方案 4：使用自定义网络和数据卷名称

在 `docker-compose.prod.yml` 中显式指定：

```yaml
services:
  app:
    networks:
      - live_show_network
    # ...

networks:
  live_show_network:
    name: live_show_network  # 自定义网络名称

volumes:
  mysql_data:
    name: live_show_mysql_data  # 自定义数据卷名称
  redis_data:
    name: live_show_redis_data
```

## 📊 冲突检查清单

在启动新项目前，检查：

- [ ] **端口占用**：`netstat -ano | findstr ":7001 :6379"`
- [ ] **数据卷名称**：`docker volume ls | Select-String "live_show"`
- [ ] **网络名称**：`docker network ls | Select-String "live_show"`
- [ ] **容器名称**：`docker ps -a | Select-String "live_show"`

## 🎯 最佳实践

### 1. 项目隔离原则

✅ **推荐做法：**
- 每个项目使用独立的目录
- 使用项目特定的端口范围
- 数据卷名称包含项目名

❌ **避免：**
- 多个项目共享同一目录
- 使用相同的端口映射
- 使用通用的数据卷名称（如 `mysql_data`）

### 2. 端口分配建议

为不同项目分配不同的端口范围：

| 项目 | 应用端口 | MySQL 端口 | Redis 端口 |
|------|---------|-----------|-----------|
| Live_show (生产) | 7001 | 不映射 | 6379 |
| Live_show (开发) | 7000, 7001 | 3306 | 6379 |
| 项目 B (生产) | 8001 | 不映射 | 6380 |
| 项目 B (开发) | 8000, 8001 | 3307 | 6380 |
| 项目 C (生产) | 9001 | 不映射 | 6381 |

### 3. 数据卷命名规范

使用项目名作为前缀：
- ✅ `live_show_mysql_data`
- ✅ `project_b_mysql_data`
- ❌ `mysql_data`（可能冲突）

## 🔍 检查命令

### 查看所有 Docker 资源

```powershell
# 查看所有容器
docker ps -a

# 查看所有网络
docker network ls

# 查看所有数据卷
docker volume ls

# 查看端口占用
netstat -ano | findstr "LISTENING"
```

### 查看特定项目的资源

```powershell
# 查看项目容器
docker-compose -f docker-compose.prod.yml ps

# 查看项目网络
docker network inspect live_show_default

# 查看项目数据卷
docker volume inspect live_show_mysql_data
```

## 🛡️ 当前项目隔离状态

### ✅ 已优化的配置

1. **生产环境 MySQL 不映射端口**
   - 避免与本地 MySQL 冲突
   - 容器内应用通过服务名连接

2. **数据卷名称包含项目名**
   - `live_show_mysql_data`
   - `live_show_redis_data`

3. **网络自动隔离**
   - 基于目录名：`live_show_default`

### ⚠️ 需要注意的配置

1. **Redis 端口 6379**
   - 如果其他项目也使用，需要修改

2. **应用端口 7001**
   - 如果其他项目也使用，需要修改

## 💡 建议

**当前项目配置已经比较安全：**
- ✅ 生产环境 MySQL 不映射端口（已优化）
- ✅ 数据卷名称包含项目名
- ✅ 网络自动隔离

**如果其他项目也使用 Docker：**
1. 确保使用不同的项目目录
2. 如果端口冲突，修改 `docker-compose.prod.yml` 中的端口映射
3. 使用 `docker-compose -p <项目名>` 显式指定项目名（可选）

**总结：当前配置与其他项目冲突的风险较低，主要注意端口冲突即可。**

