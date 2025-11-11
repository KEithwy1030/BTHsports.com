const express = require('express');
const router = express.Router();
const JRKANSignalCrawler = require('../crawler/JRKANSignalCrawler');
const StreamValidator = require('../crawler/StreamValidator');

const crawler = new JRKANSignalCrawler();
const validator = new StreamValidator();

// 信号源缓存（5分钟有效期）
const signalCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟

/**
 * 获取单个信号源
 * POST /api/signals/single
 * Body: { streamUrl: "http://play.jgdhds.com/play/steam800705.html" }
 */
router.post('/single', async (req, res) => {
  try {
    const { streamUrl } = req.body;
    
    if (!streamUrl) {
      return res.status(400).json({
        success: false,
        message: '缺少streamUrl参数'
      });
    }

    // 检查缓存
    const cached = signalCache.get(streamUrl);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      console.log('💾 使用缓存的信号源:', streamUrl);
      return res.json({
        success: true,
        data: cached.data,
        cached: true
      });
    }

    // 抓取信号源
    const signal = await crawler.crawlSignal(streamUrl);
    
    if (!signal) {
      return res.status(404).json({
        success: false,
        message: '无法获取信号源'
      });
    }

    // 缓存结果
    signalCache.set(streamUrl, {
      data: signal,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      data: signal,
      cached: false
    });

  } catch (error) {
    console.error('获取信号源失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 批量获取信号源（带验证）
 * POST /api/signals/batch
 * Body: { streamUrls: ["url1", "url2", ...], validate: true }
 */
router.post('/batch', async (req, res) => {
  try {
    const { streamUrls, validate = false } = req.body;
    
    if (!streamUrls || !Array.isArray(streamUrls)) {
      return res.status(400).json({
        success: false,
        message: 'streamUrls必须是数组'
      });
    }

    const results = [];
    const needCrawl = [];

    // 先检查缓存
    for (const url of streamUrls) {
      const cached = signalCache.get(url);
      if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        results.push({ ...cached.data, cached: true });
      } else {
        needCrawl.push(url);
      }
    }

    // 抓取未缓存的
    if (needCrawl.length > 0) {
      console.log(`🎬 需要抓取 ${needCrawl.length} 个信号源`);
      let newSignals = await crawler.crawlSignals(needCrawl);
      
      // 如果启用验证，过滤无效信号源
      if (validate && newSignals.length > 0) {
        console.log(`🔍 启用验证模式，开始验证信号源...`);
        newSignals = await validator.batchValidate(newSignals, true);
        console.log(`✅ 验证完成，保留 ${newSignals.length} 个有效信号源`);
      }
      
      // 缓存新抓取的结果
      newSignals.forEach(signal => {
        if (signal) {
          signalCache.set(signal.sourceUrl, {
            data: signal,
            timestamp: Date.now()
          });
          results.push({ ...signal, cached: false });
        }
      });
    }

    // 获取统计信息
    const stats = validate && results.length > 0 
      ? validator.getValidationStats(results)
      : null;

    res.json({
      success: true,
      data: results,
      total: results.length,
      cached: results.filter(r => r.cached).length,
      new: results.filter(r => !r.cached).length,
      validated: validate,
      validationStats: stats
    });

  } catch (error) {
    console.error('批量获取信号源失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * 清除缓存
 * POST /api/signals/clear-cache
 */
router.post('/clear-cache', (req, res) => {
  signalCache.clear();
  res.json({
    success: true,
    message: '缓存已清除'
  });
});

module.exports = router;

