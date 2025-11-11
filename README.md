# 🏀 在线看球平台

一个基于Vue.js + Node.js的在线体育直播平台，支持多信号源自动切换和实时爬取。

## ✨ 功能特性

- 🎥 **多信号源播放** - 支持HLS流播放，自动切换最佳信号源
- 🔄 **实时数据爬取** - 自动爬取比赛信息和直播信号源
- 📱 **响应式设计** - 支持PC、平板、手机多端访问
- 🚀 **高性能播放** - 基于HLS.js的流畅播放体验
- 📊 **数据监控** - 实时监控信号源质量和可用性

## 🛠 技术栈

### 后端
- **Node.js** - 服务器运行环境
- **Express.js** - Web框架
- **MySQL** - 数据存储
- **Redis** - 缓存系统
- **Puppeteer** - 网页爬虫
- **Cheerio** - HTML解析

### 前端
- **Vue.js 3** - 前端框架
- **Element Plus** - UI组件库
- **HLS.js** - 视频播放
- **Vite** - 构建工具

## 📦 本地开发环境搭建

### 环境要求
- **Node.js** 20+ (推荐使用LTS版本)
- **MySQL** 8.0+ (可选，如果使用数据库存储)
- **Redis** 6.0+ (可选，用于缓存)
- **Chrome浏览器** (用于puppeteer-core爬虫功能)

### 1. 克隆项目
```bash
git clone <repository-url>
cd Live_show
```

### 2. 安装依赖
```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd client
npm install
cd ..
```

### 3. 配置环境变量
```bash
# 复制环境配置文件
cp env.example env.dev

# 编辑配置文件（根据你的本地环境修改）
# Windows: notepad env.dev
# Mac/Linux: vim env.dev
```

**env.dev配置示例**：
```env
NODE_ENV=development
PORT=7001

# 数据库配置（如果使用）
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=live_sports

# Redis配置（如果使用）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# 爬虫配置
CRAWLER_INTERVAL=300000
CRAWLER_DELAY=2000
CRAWLER_RETRY=3
```

### 4. 启动本地服务

#### 方式1：同时启动前后端（推荐）
```bash
npm run dev
```

#### 方式2：分别启动
```bash
# 终端1：启动后端服务
npm run server:dev

# 终端2：启动前端服务
npm run client:dev
```

### 5. 访问应用
- **前端**: http://localhost:7000
- **后端API**: http://localhost:7001
- **健康检查**: http://localhost:7001/health

### 6. 启动爬虫（可选）
```bash
# 单独启动爬虫服务
npm run crawler
```

### 本地服务说明

**后端服务**：
- 使用 `nodemon` 实现热重载
- 修改 `server/` 目录下的文件会自动重启
- 端口：7001

**前端服务**：
- 使用 `Vite` 实现热重载（HMR）
- 修改 `client/src/` 下的文件会自动刷新浏览器
- 端口：7000

**Redis服务**（如果使用）：
- 需要本地安装Redis或使用Docker单独运行Redis
- 配置文件：`env.dev` 中的 `REDIS_HOST` 和 `REDIS_PORT`

**MySQL服务**（如果使用）：
- 需要本地安装MySQL
- 数据库初始化脚本：`server/config/schema.sql`

## 🚀 生产部署

### 1. 构建前端
```bash
cd client
npm run build
cd ..
```

### 2. 使用PM2部署
```bash
# 安装PM2
npm install -g pm2

# 启动服务
pm2 start server/index.js --name live-sports-api
pm2 save
pm2 startup
```

### 3. 配置Nginx反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 前端静态文件
    location / {
        root /path/to/client/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # 后端API代理
    location /api {
        proxy_pass http://localhost:7001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. 部署边缘播放代理（Zeabur 示例）

> 目的：将大流量的 m3u8/TS 转发迁移到边缘平台，避免主站服务器承担带宽。

1. 进入 `edge-proxy` 目录并安装依赖：
   ```bash
   cd edge-proxy
   npm install
   ```
2. 在 Zeabur 创建 **Node.js** 服务，上传/关联 `edge-proxy` 目录；
3. 设置环境变量：

   | Key | Value (示例) |
   | --- | --- |
   | `DEFAULT_REFERER` | `http://play.jgdhds.com/` |
   | `ALLOWED_ORIGINS` | `*` |
   | `SESSION_TTL_SECONDS` | `900` |
   | `REQUEST_TIMEOUT_MS` | `15000` |

4. 部署后记下域名（例如 `https://your-proxy.zeabur.app`）；
5. 在前端环境变量中设置 `VITE_STREAM_PROXY_ORIGIN=https://your-proxy.zeabur.app`，重新构建前端；
6. 验证：播放器直连失败时会自动 fallback 到该域名，主站日志应不再出现 `/api/jrkan/proxy-m3u8`。

## 📊 API接口

### 比赛相关
- `GET /api/matches` - 获取比赛列表
- `GET /api/matches/:id` - 获取比赛详情
- `GET /api/matches/leagues/list` - 获取联赛列表
- `GET /api/matches/search/:keyword` - 搜索比赛

### 直播相关
- `GET /api/live/sources/:matchId` - 获取直播信号源
- `POST /api/live/switch` - 切换信号源
- `POST /api/live/test/:sourceId` - 测试信号源
- `GET /api/live/now` - 获取正在直播的比赛

### 爬虫相关
- `POST /api/crawler/trigger` - 手动触发爬取
- `GET /api/crawler/logs` - 获取爬虫日志
- `GET /api/crawler/stats` - 获取爬虫统计

## 🔧 配置说明

### 环境变量
```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=live_sports

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# 服务器配置
PORT=3000
NODE_ENV=production

# 前端播放器代理
VITE_STREAM_PROXY_ORIGIN=https://your-proxy.domain

# 爬虫配置
CRAWLER_INTERVAL=300000  # 爬取间隔（毫秒）
CRAWLER_DELAY=2000      # 请求延迟（毫秒）
CRAWLER_RETRY=3         # 重试次数
```

### 爬虫配置
- **爬取频率**: 每5分钟更新比赛列表
- **信号源检测**: 每10分钟检测信号源可用性
- **数据清理**: 自动清理7天前的过期数据

## 📱 使用说明

### 用户操作
1. **浏览比赛** - 在首页查看今日比赛和热门联赛
2. **选择观看** - 点击比赛进入详情页面
3. **切换信号源** - 在播放器中选择最佳信号源
4. **搜索比赛** - 使用搜索功能快速找到目标比赛

### 管理员操作
1. **手动爬取** - 通过API接口手动触发数据爬取
2. **监控日志** - 查看爬虫运行状态和错误日志
3. **数据统计** - 监控比赛数量和信号源质量

## ⚠️ 注意事项

### 法律声明
- 本站所有直播信号均由用户收集或从搜索引擎整理获得
- 内容均来自互联网，我们不提供任何直播或视频内容
- 如有侵权请通知我们，我们会立即处理

### 技术限制
- 依赖第三方信号源，可能存在不稳定性
- 需要定期维护爬虫规则以适应网站变化
- 建议部署多个备用服务器确保服务可用性

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 联系方式

- 邮箱: tomhanks0203@gmail.com
- 项目地址: [GitHub Repository](https://github.com/your-username/live-sports-platform)

---

**开发时间**: 预计2周  
**技术难度**: 中等  
**维护成本**: 低  
