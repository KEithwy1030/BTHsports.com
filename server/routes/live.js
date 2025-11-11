const express = require('express');
const StreamCrawler = require('../crawler/StreamCrawler');
const router = express.Router();

let fallbackCrawler = null;

function getCrawler(req) {
  const appCrawler = req.app && req.app.get ? req.app.get('streamCrawler') : null;
  if (appCrawler) {
    return appCrawler;
  }
  if (!fallbackCrawler) {
    fallbackCrawler = new StreamCrawler();
  }
  return fallbackCrawler;
}

// 获取直播信号源
router.get('/sources/:matchId', async (req, res) => {
  try {
    const matchId = req.params.matchId;
    const crawler = getCrawler(req);
    
    // 使用爬虫获取信号源
    const sources = await crawler.crawlMatchStreamSources(matchId);
    
    if (sources.length === 0) {
      return res.status(404).json({
        code: 404,
        message: '未找到可用的直播信号源'
      });
    }
    
    res.json({
      code: 200,
      data: {
        sources: sources.map(source => ({
          id: source.id,
          name: source.name,
          url: source.url,
          type: source.sourceType || source.type,
          quality: source.qualityScore || source.quality,
          isActive: source.isActive
        }))
      }
    });
    
  } catch (error) {
    console.error('获取信号源失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取信号源失败',
      error: error.message
    });
  }
});

module.exports = router;