# 🚀 Zeabur 部署检查清单

## ✅ 部署前最终检查

### 1. 代码配置检查

- [x] **环境变量加载** - 支持 Zeabur 自动注入
- [x] **PORT 配置** - 使用 `process.env.PORT`
- [x] **CORS 配置** - 生产环境默认允许所有来源
- [x] **数据库配置** - 支持环境变量注入，有错误处理
- [x] **前端构建** - `prestart` 脚本自动构建
- [x] **浏览器功能** - 已禁用，不影响核心功能
- [x] **静态文件服务** - 支持前端构建产物
- [x] **SPA 路由** - 已配置 Vue Router 支持

### 2. 依赖检查

- [x] **所有依赖** - 已在 `package.json` 中声明
- [x] **Node.js 版本** - 建议 20+（Zeabur 自动检测）
- [x] **前端依赖** - `client/package.json` 存在

### 3. 文件结构检查

- [x] **入口文件** - `server/index.js` 存在
- [x] **前端源码** - `client/src/` 存在
- [x] **构建配置** - `client/vite.config.js` 存在
- [x] **数据库脚本** - `server/config/schema.sql` 存在

## 📋 部署步骤

### 第一步：准备 GitHub 仓库

1. 确保所有代码已提交到 GitHub
2. 检查 `.gitignore` 是否正确（避免提交 `node_modules`、`.env` 等）

### 第二步：在 Zeabur 创建项目

1. 登录 [Zeabur](https://zeabur.com)
2. 点击 "New Project"
3. 选择 "Import from GitHub"
4. 选择你的仓库
5. Zeabur 会自动检测为 Node.js 项目

### 第三步：创建 MySQL 服务

1. 在项目页面点击 **"Add Service"**
2. 选择 **"MySQL"**
3. Zeabur 会自动：
   - 创建 MySQL 实例
   - 注入环境变量：`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

### 第四步：配置环境变量（可选）

在项目设置中，可以添加：

- `CORS_ORIGINS` - 如果需要限制 CORS（默认允许所有）
- `ENABLE_BROWSER` - 保持默认 `false`（云环境不支持）

**注意**：`PORT` 和 `NODE_ENV` 由 Zeabur 自动设置，无需手动配置

### 第五步：部署

1. Zeabur 会自动执行：
   ```
   npm install          # 安装依赖
   npm run build:client # 构建前端（prestart 脚本）
   npm start            # 启动服务
   ```

2. 等待部署完成（首次部署可能需要 3-5 分钟）

### 第六步：初始化数据库

**重要**：部署完成后必须初始化数据库表结构

#### 方法 1：使用 Zeabur 数据库控制台

1. 在 Zeabur 项目页面找到 MySQL 服务
2. 点击进入数据库管理界面
3. 执行 `server/config/schema.sql` 中的 SQL 语句

#### 方法 2：使用 MySQL 客户端

```bash
# 从 Zeabur 获取数据库连接信息
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p<DB_PASSWORD> <DB_NAME> < server/config/schema.sql
```

#### 方法 3：使用在线工具

- 使用 [phpMyAdmin](https://www.phpmyadmin.co/) 或类似工具
- 连接到 Zeabur 提供的数据库
- 导入 `server/config/schema.sql`

## 🧪 部署后测试清单

### 基础功能测试

#### 1. 健康检查
```bash
curl https://your-app.zeabur.app/health
```
**预期结果**：
```json
{"status":"OK","timestamp":"2025-01-XX..."}
```

#### 2. 前端页面
```
访问：https://your-app.zeabur.app/
```
**预期结果**：
- 页面正常加载
- 不显示 404 错误
- 前端界面显示正常

#### 3. API 接口测试

**测试比赛列表**：
```bash
curl https://your-app.zeabur.app/api/matches
```
**预期结果**：
- 返回 JSON 格式数据
- 包含 `code: 200` 和 `data.matches` 数组
- 即使数据库未初始化也能返回（可能为空数组）

**测试信号源获取**（需要有效的 matchId）：
```bash
curl https://your-app.zeabur.app/api/live/sources/200001
```
**预期结果**：
- 返回信号源列表或 404（如果比赛不存在）
- 不返回 500 错误

### 核心功能测试

#### 4. 比赛列表功能
1. 打开前端页面
2. 查看比赛列表是否显示
3. 检查是否有比赛数据

**预期结果**：
- 比赛列表正常显示
- 可以查看比赛信息（队伍、时间、联赛等）

#### 5. 信号源获取功能
1. 选择一个比赛
2. 点击进入详情页
3. 尝试获取信号源

**预期结果**：
- 能够获取到信号源列表
- 信号源 URL 格式正确（包含 .m3u8 或播放页面）

#### 6. 视频播放功能
1. 选择一个信号源
2. 尝试播放视频

**预期结果**：
- 播放器正常加载
- 视频可以播放（取决于信号源是否有效）

### 数据库功能测试（需要先初始化数据库）

#### 7. 方案管理功能
```bash
curl https://your-app.zeabur.app/api/plans
```
**预期结果**：
- 如果数据库已初始化：返回方案列表
- 如果数据库未初始化：返回 500 错误（正常，需要先初始化）

## ⚠️ 常见问题排查

### 问题 1：部署失败

**检查**：
1. 查看 Zeabur 构建日志
2. 检查是否有依赖安装错误
3. 确认 Node.js 版本兼容性

**解决**：
- 检查 `package.json` 中的依赖版本
- 确保 `client/package.json` 存在

### 问题 2：前端页面 404

**检查**：
1. 查看构建日志，确认前端是否成功构建
2. 检查 `client/dist` 目录是否生成

**解决**：
- 手动触发构建：在 Zeabur 控制台执行 `npm run build:client`
- 检查 `client/vite.config.js` 配置

### 问题 3：数据库连接失败

**检查**：
1. 查看应用日志，确认数据库连接状态
2. 检查环境变量是否正确注入

**解决**：
- 确认 MySQL 服务已创建
- 检查数据库环境变量是否正确
- 数据库未初始化不影响核心功能（比赛列表、信号源）

### 问题 4：API 返回 500 错误

**检查**：
1. 查看 Zeabur 应用日志
2. 确认具体错误信息

**解决**：
- 如果是数据库相关错误：初始化数据库表结构
- 如果是其他错误：查看日志定位问题

## 📊 功能状态确认

| 功能 | 是否需要数据库 | 部署后状态 |
|------|---------------|-----------|
| 前端页面 | ❌ | ✅ 立即可用 |
| 健康检查 | ❌ | ✅ 立即可用 |
| 比赛列表 API | ❌ | ✅ 立即可用（HTTP 爬取） |
| 信号源获取 | ❌ | ✅ 立即可用（HTTP 请求） |
| 视频播放 | ❌ | ✅ 立即可用 |
| 方案管理 | ✅ | ⚠️ 需初始化数据库 |

## ✅ 部署确认

完成以下检查后，可以确认部署成功：

- [ ] 健康检查返回 OK
- [ ] 前端页面正常显示
- [ ] 比赛列表 API 正常返回
- [ ] 信号源获取功能正常
- [ ] 视频可以播放（取决于信号源有效性）
- [ ] 数据库已初始化（如果需要方案管理功能）

## 🎉 部署完成

如果以上测试都通过，恭喜！你的网站已经成功部署到 Zeabur 并可以正常使用了！

---

**提示**：首次部署后，爬虫会在 5 分钟内自动开始工作，比赛数据会逐渐更新。

