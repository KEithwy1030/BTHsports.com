const express = require('express');
const { pool } = require('../config/database');
const StreamCrawler = require('../crawler/StreamCrawler');
const router = express.Router();

// 手动触发爬取
router.post('/trigger', async (req, res) => {
  console.log('⚠️ /api/crawler/trigger 已禁用（仅保留 JRKAN 实时抓取）');
  res.status(410).json({
    code: 410,
    message: '手动触发接口已禁用，全部数据实时来自 JRKAN'
  });
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
    
    // SEO优化：不再删除历史比赛，保留所有比赛用于SEO
    // 只清理无用的信号源数据，保留比赛记录
    const [sourceResult] = await pool.execute(`
      DELETE ls FROM live_sources ls
      INNER JOIN matches m ON ls.match_id = m.id
      WHERE m.status = 'finished' 
      AND m.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [days]);
    
    res.json({
      code: 200,
      message: '清理完成（已保留历史比赛用于SEO）',
      data: {
        deletedLogs: logResult.affectedRows,
        deletedSources: sourceResult.affectedRows,
        note: '历史比赛已保留，用于SEO优化'
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
