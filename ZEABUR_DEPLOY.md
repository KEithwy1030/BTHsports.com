# Zeabur 部署指南

## ✅ 部署前检查清单

### 1. 环境变量配置

在 Zeabur 后台设置以下环境变量：

#### 必需配置（MySQL 服务会自动注入）
- `DB_HOST` - 数据库主机（Zeabur 自动注入）
- `DB_PORT` - 数据库端口（Zeabur 自动注入）
- `DB_USER` - 数据库用户名（Zeabur 自动注入）
- `DB_PASSWORD` - 数据库密码（Zeabur 自动注入）
- `DB_NAME` - 数据库名称（Zeabur 自动注入）

#### 可选配置
- `PORT` - 服务器端口（Zeabur 自动注入，无需手动设置）
- `NODE_ENV` - 环境模式（Zeabur 自动设置为 `production`）
- `CORS_ORIGINS` - CORS 允许的来源（默认允许所有来源 `*`）
- `ENABLE_BROWSER` - 是否启用浏览器自动化（默认 `false`，云环境建议禁用）

### 2. 数据库初始化

**重要**：部署后需要手动初始化数据库表结构

1. 在 Zeabur 上创建 MySQL 服务
2. 连接到数据库（使用 Zeabur 提供的连接信息）
3. 执行 `server/config/schema.sql` 中的 SQL 语句创建表结构

或者使用 MySQL 客户端工具：
```bash
mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < server/config/schema.sql
```

### 3. 前端构建

项目已配置自动构建：
- `npm start` 会自动执行 `prestart` 脚本
- `prestart` 会先构建前端（`npm run build:client`）
- 构建产物位于 `client/dist` 目录

**注意**：首次部署可能需要较长时间（安装依赖 + 构建）

### 4. 部署步骤

1. **连接 GitHub 仓库到 Zeabur**
   - 在 Zeabur 创建新项目
   - 选择你的 GitHub 仓库
   - Zeabur 会自动检测为 Node.js 项目

2. **创建 MySQL 服务**
   - 在 Zeabur 项目页面点击 "Add Service"
   - 选择 "MySQL"
   - Zeabur 会自动注入数据库环境变量

3. **配置环境变量**（可选）
   - 如果需要限制 CORS，设置 `CORS_ORIGINS`
   - 其他配置使用默认值即可

4. **部署**
   - Zeabur 会自动执行：
     - `npm install`（安装依赖）
     - `npm run build:client`（构建前端）
     - `npm start`（启动服务）

5. **初始化数据库**
   - 部署完成后，连接到数据库执行 `schema.sql`

### 5. 验证部署

部署成功后，访问以下端点验证：

- **健康检查**: `https://your-app.zeabur.app/health`
  - 应返回: `{"status":"OK","timestamp":"..."}`

- **前端页面**: `https://your-app.zeabur.app/`
  - 应显示前端界面

- **API 测试**: `https://your-app.zeabur.app/api/matches`
  - 应返回比赛列表（即使数据库未初始化也能返回空数组）

### 6. 常见问题

#### 问题 1: 前端页面显示 404
**原因**: 前端未构建或构建失败
**解决**: 
- 检查构建日志
- 确保 `client/package.json` 存在
- 手动执行 `cd client && npm install && npm run build`

#### 问题 2: 数据库相关 API 返回 500 错误
**原因**: 数据库未连接或表未创建
**解决**:
- 检查数据库环境变量是否正确注入
- 执行 `server/config/schema.sql` 初始化表结构
- 检查数据库连接日志

#### 问题 3: 爬虫功能不工作
**原因**: 浏览器自动化在云环境不可用（正常现象）
**解决**: 
- 这是预期行为，浏览器功能已自动禁用
- 爬虫仍可使用 HTTP 请求方式工作
- 如需启用，设置 `ENABLE_BROWSER=true`（不推荐，资源消耗大）

#### 问题 4: 端口错误
**原因**: 未使用 Zeabur 注入的 PORT
**解决**: 
- 代码已自动使用 `process.env.PORT`
- 无需手动配置

### 7. 功能状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 前端页面 | ✅ 正常 | 自动构建并服务 |
| API 接口 | ✅ 正常 | 所有接口可用 |
| 比赛列表 | ✅ 正常 | 使用 HTTP 爬取 |
| 信号源获取 | ✅ 正常 | 使用 HTTP 请求 |
| 方案管理 | ⚠️ 需数据库 | 需要初始化数据库表 |
| 浏览器爬虫 | ❌ 已禁用 | 云环境不支持（正常） |

### 8. 性能优化建议

1. **数据库连接池**: 已配置连接池，默认 10 个连接
2. **静态资源**: 前端构建产物由 Express 直接服务
3. **爬虫频率**: 默认每 5 分钟爬取一次，可在环境变量中调整

### 9. 监控和日志

- Zeabur 提供内置日志查看
- 健康检查端点: `/health`
- 爬虫统计: `/api/crawler/stats`（如果已实现）

---

**部署完成后，网站功能应该可以正常使用！** 🎉

如有问题，请检查：
1. 环境变量是否正确配置
2. 数据库是否已初始化
3. 前端是否成功构建
4. 查看 Zeabur 日志排查错误

