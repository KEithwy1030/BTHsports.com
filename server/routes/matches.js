const express = require('express');
const JRSKanCrawler = require('../crawler/JRSKanCrawler');
const router = express.Router();

const crawler = new JRSKanCrawler();

// 模拟比赛数据 (简化版本，直接从爬虫获取)
let cachedMatches = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

function normalizeScore(match) {
  if (match.homeScore || match.awayScore) {
    return {
      homeScore: Number(match.homeScore) || 0,
      awayScore: Number(match.awayScore) || 0
    };
  }

  if (match.score && match.score.includes('-')) {
    const [homeScore = 0, awayScore = 0] = match.score.split('-').map(num => Number(num) || 0);
    return { homeScore, awayScore };
  }

  return { homeScore: 0, awayScore: 0 };
}

function detectMatchId(match) {
  if (match.channels && match.channels.length > 0) {
    const channelWithSteam = match.channels.find(ch => ch.steamId);
    if (channelWithSteam) {
      return channelWithSteam.steamId;
    }
  }
  return match.id || `jrs_${Date.now()}`;
}

// 过滤"主播解说"频道
function filterCommentatorChannels(channels) {
  if (!Array.isArray(channels)) {
    return [];
  }
  
  // 🚫 过滤"主播解说"的关键词
  const excludeKeywords = ['主播', '解说', 'commentator', 'host'];
  const isExcludedChannel = (channelName) => {
    if (!channelName) return false;
    const lowerName = channelName.toLowerCase();
    return excludeKeywords.some(keyword => lowerName.includes(keyword.toLowerCase()));
  };
  
  // 过滤掉"主播解说"频道
  const filteredChannels = channels.filter(channel => {
    if (isExcludedChannel(channel.name)) {
      console.log(`🚫 过滤掉"主播解说"频道: ${channel.name}`);
      return false;
    }
    return true;
  });
  
  return filteredChannels;
}

async function getMatchesFromCrawler() {
  const now = Date.now();
  if (!cachedMatches.length || (now - lastFetchTime > CACHE_DURATION)) {
    console.log('🔄 缓存过期或为空，重新获取比赛数据...');
    
    try {
      cachedMatches = await crawler.crawlSchedule();
      console.log(`📋 从JRKAN获取 ${cachedMatches.length} 个比赛`);
    } catch (error) {
      console.error('❌ 获取比赛数据失败:', error.message);
      // 使用空数组作为备用
      cachedMatches = [];
    }
    lastFetchTime = now;
  } else {
    console.log(`📋 使用缓存的 ${cachedMatches.length} 个比赛数据`);
  }
  return cachedMatches;
}

// 获取比赛列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 1000, league, status, showFinished = 'false' } = req.query;
    
    // 从缓存获取比赛数据
    const matches = await getMatchesFromCrawler();
    
    // SEO优化：保留所有历史比赛，但默认只显示进行中/即将开始的比赛
    const FIVE_HOURS = 5 * 60 * 60 * 1000;
    const VIEW_LIMIT = 2.5 * 60 * 60 * 1000;
    const now = Date.now();
    const showFinishedMatches = showFinished === 'true';
    
    let filteredMatches = matches.filter(match => {
      // 如果明确要求显示已结束的比赛，则不过滤
      if (showFinishedMatches) {
        return true;
      }
      
      // 默认只显示进行中/即将开始的比赛（用于前端列表显示）
      // 但所有比赛数据都保留，用于SEO和详情页访问
      if (match.status === '已结束') {
        return false; // 默认不显示，但数据保留
      }
      
      const matchTime = crawler.parseTime(match.time);
      if (!matchTime || Number.isNaN(matchTime.getTime())) {
        return true; // 时间无法解析时保留，避免误删
      }
      return now - matchTime.getTime() <= FIVE_HOURS;
    });
    
    if (league) {
      filteredMatches = filteredMatches.filter(match => match.league === league);
    }
    
    if (status) {
      filteredMatches = filteredMatches.filter(match => match.status === status);
    }
    
    // 分页
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedMatches = filteredMatches.slice(startIndex, endIndex);
    
    const formattedMatches = paginatedMatches.map(match => {
      const id = detectMatchId(match);
      const { homeScore, awayScore } = normalizeScore(match);
      const matchTime = crawler.parseTime(match.time);
      let canWatch = true;
      if (matchTime && !Number.isNaN(matchTime.getTime())) {
        if (now - matchTime.getTime() > VIEW_LIMIT) {
          canWatch = false;
        }
      }
      return {
        id,
        home_team: match.homeTeam || '',
        away_team: match.awayTeam || '',
        league: match.league || '',
        time: match.time || '',
        home_team_logo: match.homeLogo || '/teams/default.png',
        away_team_logo: match.awayLogo || '/teams/default.png',
        homeScore,
        awayScore,
        canWatch,
        channels: filterCommentatorChannels(match.channels || [])
      };
    });

    res.json({
      code: 200,
      data: {
        matches: formattedMatches,
        total: filteredMatches.length,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('获取比赛列表失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取比赛列表失败',
      error: error.message
    });
  }
});

// 获取比赛详情（支持历史比赛访问，用于SEO）
router.get('/detail/:id', async (req, res) => {
  try {
    const requestedId = req.params.id;
    
    // 从缓存获取所有比赛数据（包括历史比赛）
    const allMatches = await getMatchesFromCrawler();
    
    // SEO优化：允许访问所有比赛（包括已结束的），保留历史页面用于SEO
    const match = allMatches.find(m => {
      const detectedId = detectMatchId(m);
      return detectedId === requestedId || m.id === requestedId;
    });
    
    // 如果当前缓存中没有，尝试从数据库查找历史比赛（如果有数据库的话）
    // 这里先保持简单，只从缓存查找
    if (!match) {
      return res.status(404).json({
        code: 404,
        message: '比赛未找到'
      });
    }
    
    const { homeScore, awayScore } = normalizeScore(match);
    const matchDetail = {
      id: detectMatchId(match),
      home_team: match.homeTeam || '',
      away_team: match.awayTeam || '',
      league: match.league || '',
      match_time: match.time || '',
      status: match.status || '未开始',
      home_team_logo: match.homeLogo || '/teams/default.png',
      away_team_logo: match.awayLogo || '/teams/default.png',
      home_score: homeScore,
      away_score: awayScore,
      channels: filterCommentatorChannels(match.channels || [])
    };
    
    res.json({
      code: 200,
      data: matchDetail
    });
    
  } catch (error) {
    console.error('获取比赛详情失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取比赛详情失败',
      error: error.message
    });
  }
});

module.exports = router;