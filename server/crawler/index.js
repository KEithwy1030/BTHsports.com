const StreamCrawler = require('./StreamCrawler');

async function main() {
  console.log('🎯 启动在线看球平台爬虫系统...');
  
  const crawler = new StreamCrawler();
  
  // 启动定时爬取
  crawler.startScheduledCrawling();
  
  // 立即执行一次爬取
  try {
    console.log('🔄 执行初始爬取...');
    const matches = await crawler.crawlPopozhiboMatches();
    await crawler.saveMatches(matches);
    
    // 爬取正在直播比赛的信号源
    const liveMatches = matches.filter(m => m.status === 'live');
    for (const match of liveMatches) {
      const sources = await crawler.crawlMatchStreamSources(match.matchId);
      await crawler.saveStreamSources(match.matchId, sources);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('✅ 初始爬取完成');
  } catch (error) {
    console.error('❌ 初始爬取失败:', error.message);
  }
  
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
