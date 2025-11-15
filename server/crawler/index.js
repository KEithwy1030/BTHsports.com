const StreamCrawler = require('./StreamCrawler');

async function main() {
  console.log('🎯 启动在线看球平台爬虫系统...');
  
  const crawler = new StreamCrawler();
  
  // 启动定时爬取
  crawler.startScheduledCrawling();
  
  console.log('ℹ️ StreamCrawler 已启用 JRKAN 专用模式（不再依赖第三方来源）');
  
  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n🛑 收到停止信号，正在关闭爬虫...');
    await crawler.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 收到终止信号，正在关闭爬虫...');
    await crawler.stop();
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = StreamCrawler;
