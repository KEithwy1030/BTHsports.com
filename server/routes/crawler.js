const express = require('express');
const { pool } = require('../config/database');
const StreamCrawler = require('../crawler/StreamCrawler');
const router = express.Router();

// 手动触发爬取
router.post('/trigger', async (req, res) => {
  try {
    const crawler = new StreamCrawler();
    
    console.log('🔄 手动触发爬取任务...');
    
    // 爬取比赛列表
    const matches = await crawler.crawlPopozhiboMatches();
    await crawler.saveMatches(matches);
    
    // 爬取正在直播比赛的信号源
    const liveMatches = matches.filter(m => m.status === 'live');
    let sourcesCount = 0;
    
    for (const match of liveMatches) {
      const sources = await crawler.crawlMatchStreamSources(match.matchId);
      await crawler.saveStreamSources(match.matchId, sources);
      sourcesCount += sources.length;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    await crawler.closeBrowser();
    
    res.json({
      code: 200,
      message: '爬取任务完成',
      data: {
        matchesFound: matches.length,
        liveMatches: liveMatches.length,
        sourcesFound: sourcesCount
      }
    });
    
  } catch (error) {
    console.error('手动爬取失败:', error.message);
    res.status(500).json({
      code: 500,
      message: '爬取任务失败',
      error: error.message
    });
  }
});

// 获取爬虫日志
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, platform, status } = req.query;
    const offset = (page - 1) * limit;
    
    let sql = 'SELECT * FROM crawler_logs WHERE 1=1';
    const params = [];
    
    if (platform) {
      sql += ' AND platform = ?';
      params.push(platform);
    }
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    
    const [logs] = await pool.execute(sql, params);
    
    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM crawler_logs WHERE 1=1';
    const countParams = [];
    
    if (platform) {
      countSql += ' AND platform = ?';
      countParams.push(platform);
    }
    
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    
    const [countResult] = await pool.execute(countSql, countParams);
    const total = countResult[0].total;
    
    res.json({
      code: 200,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('获取爬虫日志失败:', error.message);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 获取爬虫统计信息（简化版本）
router.get('/stats', async (req, res) => {
  try {
    const crawler = new StreamCrawler();
    const stats = crawler.getCrawlerStats();
    
    res.json({
      code: 200,
      data: stats
    });
    
  } catch (error) {
    console.error('获取爬虫统计失败:', error.message);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      error: error.message
    });
  }
});

// 清理过期数据
router.post('/cleanup', async (req, res) => {
  try {
    const { days = 7 } = req.body;
    
    // 删除过期的爬虫日志
    const [logResult] = await pool.execute(
      'DELETE FROM crawler_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [days]
    );
    
    // 删除已结束且无信号源的比赛
    const [matchResult] = await pool.execute(`
      DELETE m FROM matches m
      LEFT JOIN live_sources ls ON m.id = ls.match_id
      WHERE m.status = 'finished' 
      AND m.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      AND ls.id IS NULL
    `, [days]);
    
    res.json({
      code: 200,
      message: '清理完成',
      data: {
        deletedLogs: logResult.affectedRows,
        deletedMatches: matchResult.affectedRows
      }
    });
    
  } catch (error) {
    console.error('清理数据失败:', error.message);
    res.status(500).json({
      code: 500,
      message: '清理失败',
      error: error.message
    });
  }
});

module.exports = router;
