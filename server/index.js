const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const cron = require('node-cron');

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
// 生产环境允许所有来源，开发环境使用白名单
const isProduction = process.env.NODE_ENV === 'production';
const DEFAULT_CORS_ORIGINS = isProduction 
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
    // 生产环境：直接允许所有来源
    if (isProduction) {
      return callback(null, true);
    }
    
    // 开发环境：进行白名单检查
    // 允许没有 origin 的请求（如 Postman、curl 等）
    if (!origin) {
      return callback(null, true);
    }
    
    // 检查是否允许所有来源（开发环境也可能设置 *）
    if (allowAllOrigins) {
      return callback(null, true);
    }
    
    // 检查是否在白名单中
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // 不在白名单中，拒绝请求
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// 健康检查（最早处理）
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 静态文件服务 - 必须在所有路由之前，确保静态资源优先匹配
const clientDistPath = path.join(__dirname, '../client/dist');
const publicPath = path.join(__dirname, '../public');

// 检查并记录静态文件目录状态
if (fs.existsSync(clientDistPath)) {
  const assetsPath = path.join(clientDistPath, 'assets');
  const indexPath = path.join(clientDistPath, 'index.html');
  
  console.log('📦 前端构建产物目录存在:', clientDistPath);
  console.log('   assets 目录:', fs.existsSync(assetsPath) ? '存在' : '不存在');
  console.log('   index.html:', fs.existsSync(indexPath) ? '存在' : '不存在');
  
  // 静态资源目录（明确指定，避免被 SPA 路由拦截）
  if (fs.existsSync(assetsPath)) {
    app.use('/assets', express.static(assetsPath, {
      setHeaders: (res, filePath) => {
        // 确保正确的 MIME 类型
        if (filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.css')) {
          res.setHeader('Content-Type', 'text/css');
        }
      }
    }));
  }
  
  // 其他静态资源目录
  if (fs.existsSync(path.join(clientDistPath, 'icon'))) {
    app.use('/icon', express.static(path.join(clientDistPath, 'icon')));
  }
  if (fs.existsSync(path.join(clientDistPath, 'teams'))) {
    app.use('/teams', express.static(path.join(clientDistPath, 'teams')));
  }
  
  // 根目录静态文件（index.html 等）
  app.use(express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      // 确保正确的 MIME 类型
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      }
    }
  }));
} else {
  console.warn('⚠️ 前端构建产物目录不存在:', clientDistPath);
  console.warn('   请确保已执行: npm run build:client');
}

// 备用静态资源目录
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  console.log('📁 使用公共资源目录:', publicPath);
}

// 用户上传文件目录（头像等）
const uploadsPath = path.join(publicPath, 'uploads');
if (fs.existsSync(uploadsPath)) {
  app.use('/uploads', express.static(uploadsPath));
  console.log('📁 用户上传文件目录:', uploadsPath);
}

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/follow', require('./routes/follow'));
app.use('/api/chat', require('./routes/chat').router);
app.use('/api/matches', require('./routes/matches'));
app.use('/api/live', require('./routes/live'));
app.use('/api/crawler', require('./routes/crawler'));
app.use('/api/jrkan', require('./routes/jrkan'));
app.use('/api/signals', require('./routes/signals'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/plans', require('./routes/plans'));

// SPA 路由支持 - 所有其他路由返回 index.html（Vue Router 处理）
app.get('*', (req, res, next) => {
  // 跳过 API 路由
  if (req.path.startsWith('/api')) {
    return next();
  }
  
  // 跳过静态资源请求（有文件扩展名且不是 .html）
  const ext = path.extname(req.path).toLowerCase();
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.json'];
  if (ext && staticExtensions.includes(ext)) {
    // 静态资源应该已经被上面的静态文件服务处理了
    // 如果到这里说明文件不存在，返回 404
    return res.status(404).json({ error: 'Static file not found', path: req.path });
  }
  
  // 返回前端入口文件
  const indexPath = path.join(__dirname, '../client/dist/index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'text/html');
    return res.sendFile(indexPath);
  }
  
  // 如果前端未构建，返回错误
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

  // 启动聊天记录清理定时任务（每小时执行一次）
  console.log('🧹 启动聊天记录清理定时任务...');
  const { cleanupExpiredChatMessages } = require('./routes/chat');
  
  // 立即执行一次清理
  cleanupExpiredChatMessages();
  
  // 每小时执行一次清理
  cron.schedule('0 * * * *', () => {
    cleanupExpiredChatMessages();
  });
});

module.exports = app;
