const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../env.dev') });

const app = express();
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
  origin: ['http://localhost:7000', 'http://127.0.0.1:7000'],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

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
