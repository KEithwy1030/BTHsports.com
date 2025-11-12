const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

(() => {
  const projectRoot = path.join(__dirname, '..');
  const candidates = [
    process.env.ENV_FILE,
    process.env.NODE_ENV === 'production' ? '.env' : null,
    '.env',
    'env.local',
    'env.dev'
  ].filter(Boolean);

  let loaded = false;
  for (const candidate of candidates) {
    const envPath = path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate);
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    dotenv.config();
  }
})();

// CORS 配置：支持 Zeabur 自动注入
// 如果未设置 CORS_ORIGINS，开发环境使用 localhost，生产环境允许所有来源
const DEFAULT_CORS_ORIGINS = process.env.NODE_ENV === 'production' 
  ? '*' 
  : 'http://localhost:7000,http://127.0.0.1:7000';
const allowedOrigins = (process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowAllOrigins = allowedOrigins.includes('*');

const app = express();
// PORT: Zeabur 会自动注入，如果没有则使用默认值
const PORT = process.env.PORT || 7001;

// 初始化爬虫和服务
const StreamCrawler = require('./crawler/StreamCrawler');
const SignalRefresher = require('./services/SignalRefresher');
const crawler = new StreamCrawler();
const signalRefresher = new SignalRefresher();

app.set('streamCrawler', crawler);
app.set('signalRefresher', signalRefresher);

// 中间件
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// 静态文件服务 - 支持前端构建产物和公共资源
// 优先使用 client/dist（生产环境），其次使用 public（开发环境）
const clientDistPath = path.join(__dirname, '../client/dist');
const publicPath = path.join(__dirname, '../public');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  console.log('📦 使用前端构建产物:', clientDistPath);
}
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  console.log('📁 使用公共资源目录:', publicPath);
}

// 路由
app.use('/api/matches', require('./routes/matches'));
app.use('/api/live', require('./routes/live'));
app.use('/api/crawler', require('./routes/crawler'));
app.use('/api/jrkan', require('./routes/jrkan'));
app.use('/api/signals', require('./routes/signals'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/plans', require('./routes/plans'));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// SPA 路由支持 - 所有非 API 路由返回 index.html（Vue Router 处理）
app.get('*', (req, res, next) => {
  // 跳过 API 路由和静态资源
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return next();
  }
  
  // 返回前端入口文件
  const indexPath = path.join(__dirname, '../client/dist/index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  
  // 如果前端未构建，返回 404
  res.status(404).json({ error: 'Frontend not built. Please run: cd client && npm run build' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 服务器运行在端口 ${PORT}`);
  console.log(`📺 在线看球平台已启动`);
  
  // 启动爬虫定时任务
  console.log('🕷️ 初始化爬虫系统...');
  crawler.startScheduledCrawling();
  
  // 启动信号源自动刷新服务
  console.log('🔄 启动信号源自动刷新服务...');
  signalRefresher.startAutoRefresh();
  
  // 立即执行一次爬取
  console.log('🔄 立即执行首次爬取...');
  crawler.crawlPopozhiboMatches().then(matches => {
    console.log(`✅ 首次爬取完成，获取到 ${matches.length} 场比赛`);
  }).catch(error => {
    console.error('❌ 首次爬取失败:', error.message);
  });
});

module.exports = app;
