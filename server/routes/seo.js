// SEO 相关路由：sitemap.xml, robots.txt 等
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const JRSKanCrawler = require('../crawler/JRSKanCrawler');
const { pool } = require('../config/database');

const crawler = new JRSKanCrawler();

// 获取网站基础 URL（从环境变量或配置）
const getBaseUrl = () => {
  return process.env.SITE_URL || process.env.DOMAIN || 'https://your-domain.com';
};

// 从数据库获取历史比赛（用于补充 sitemap）
async function getHistoricalMatchesFromDB(limit = 500) {
  try {
    // 查询最近的历史比赛（已结束但保留在数据库中的）
    const [rows] = await pool.execute(`
      SELECT match_id, home_team, away_team, league, match_time, status, updated_at
      FROM matches
      WHERE status = 'finished'
      ORDER BY match_time DESC
      LIMIT ?
    `, [limit]);
    
    return rows.map(row => ({
      matchId: row.match_id,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      league: row.league,
      time: row.match_time,
      status: '已结束',
      updatedAt: row.updated_at
    }));
  } catch (error) {
    // 数据库查询失败不影响 sitemap 生成，只记录警告
    console.warn('⚠️ 从数据库获取历史比赛失败（不影响 sitemap 生成）:', error.message);
    return [];
  }
}

// 生成 sitemap.xml
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = getBaseUrl();
    
    // 从爬虫获取所有比赛数据（包括历史比赛）
    let matches = [];
    try {
      matches = await crawler.crawlSchedule();
      console.log(`📋 生成 sitemap，从爬虫获取 ${matches.length} 场比赛`);
    } catch (err) {
      console.warn('获取爬虫数据失败，使用静态 sitemap:', err.message);
    }
    
    // 从数据库获取历史比赛（补充数据）
    let dbMatches = [];
    try {
      dbMatches = await getHistoricalMatchesFromDB(500);
      if (dbMatches.length > 0) {
        console.log(`📋 从数据库补充 ${dbMatches.length} 场历史比赛`);
      }
    } catch (err) {
      // 数据库查询失败不影响主流程
      console.warn('从数据库获取历史比赛失败:', err.message);
    }
    
    // 构建 matchId 集合，避免重复
    const matchIdSet = new Set();
    
    // 处理爬虫获取的比赛
    const crawlerMatchUrls = matches.slice(0, 1000).map(match => {
      const matchId = match.channels?.[0]?.steamId || match.id || `jrs_${Date.now()}`;
      matchIdSet.add(matchId);
      const matchTime = crawler.parseTime(match.time);
      return {
        loc: `${baseUrl}/match/${matchId}`,
        changefreq: match.status === '已结束' ? 'monthly' : 'hourly',
        priority: match.status === '已结束' ? '0.6' : '0.9',
        lastmod: matchTime ? matchTime.toISOString() : undefined
      };
    });
    
    // 处理数据库中的历史比赛（补充爬虫未覆盖的）
    const dbMatchUrls = dbMatches
      .filter(match => {
        // 只添加爬虫中没有的 matchId
        const matchId = match.matchId;
        if (!matchId || matchIdSet.has(matchId)) {
          return false;
        }
        matchIdSet.add(matchId);
        return true;
      })
      .slice(0, 500) // 限制数量，避免 sitemap 过大
      .map(match => {
        const matchTime = match.time ? new Date(match.time) : null;
        return {
          loc: `${baseUrl}/match/${match.matchId}`,
          changefreq: 'monthly',
          priority: '0.6',
          lastmod: matchTime && !isNaN(matchTime.getTime()) ? matchTime.toISOString() : undefined
        };
      });
    
    // 构建 sitemap XML
    const urls = [
      // 静态页面
      { loc: baseUrl, changefreq: 'daily', priority: '1.0' },
      { loc: `${baseUrl}/plan`, changefreq: 'daily', priority: '0.8' },
      { loc: `${baseUrl}/experts`, changefreq: 'weekly', priority: '0.7' },
      
      // 动态比赛页面（爬虫数据 + 数据库补充）
      ...crawlerMatchUrls,
      ...dbMatchUrls
    ];
    
    // 生成 XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    urls.forEach(url => {
      xml += '  <url>\n';
      xml += `    <loc>${url.loc}</loc>\n`;
      if (url.lastmod) {
        xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
      }
      xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
      xml += `    <priority>${url.priority}</priority>\n`;
      xml += '  </url>\n';
    });
    
    xml += '</urlset>';
    
    console.log(`✅ 生成 sitemap 完成，共 ${urls.length} 个 URL`);
    
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('生成 sitemap 失败:', error);
    res.status(500).send('生成 sitemap 失败');
  }
});

// 提供 robots.txt
router.get('/robots.txt', (req, res) => {
  const robotsPath = path.join(__dirname, '../../public/robots.txt');
  
  if (fs.existsSync(robotsPath)) {
    const baseUrl = getBaseUrl();
    let robotsContent = fs.readFileSync(robotsPath, 'utf8');
    
    // 替换 sitemap URL
    robotsContent = robotsContent.replace(
      /# Sitemap:.*/,
      `Sitemap: ${baseUrl}/api/seo/sitemap.xml`
    );
    
    res.set('Content-Type', 'text/plain');
    res.send(robotsContent);
  } else {
    res.status(404).send('robots.txt not found');
  }
});

module.exports = router;

