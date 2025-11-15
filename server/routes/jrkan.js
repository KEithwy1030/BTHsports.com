const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');
const JRSKanCrawler = require('../crawler/JRSKanCrawler');
const JRKANSignalCrawler = require('../crawler/JRKANSignalCrawler');
const StreamIdMapper = require('../crawler/StreamIdMapper');
const mappingDB = require('../utils/MappingDB');
const DomainHealthChecker = require('../utils/DomainHealthChecker');
const logger = require('../utils/logger');
const router = express.Router();

// 初始化爬虫和工具
const crawler = new JRSKanCrawler();
const signalCrawler = new JRKANSignalCrawler();
const streamIdMapper = new StreamIdMapper();
const domainHealthChecker = new DomainHealthChecker();

const DEFAULT_REFERER = 'http://play.jgdhds.com/';

const decodeBase64Param = (token = '') => {
  if (!token) return '';
  try {
    return Buffer.from(token, 'base64').toString('utf-8');
  } catch (error) {
    console.warn('Base64解码失败:', error.message);
    return '';
  }
};

const encodeBase64Param = (value = '') => {
  if (!value) return '';
  try {
    return Buffer.from(value, 'utf-8').toString('base64');
  } catch (error) {
    console.warn('Base64编码失败:', error.message);
    return '';
  }
};

const rewriteM3u8Manifest = (content, baseUrl, sessionToken = '', refererToken = '', streamId = '') => {
  if (!content) return '';
  const lines = content.split(/\r?\n/);
  let base;
  try {
    base = new URL(baseUrl);
  } catch (error) {
    console.warn('无法解析m3u8基准URL:', baseUrl);
    base = null;
  }
  return lines
    .map(line => {
      if (!line || line.startsWith('#')) {
        return line;
      }
      if (!base) {
        return line;
      }
      let absoluteUrl;
      try {
        absoluteUrl = new URL(line, base).toString();
      } catch (error) {
        console.warn('无法构建片段URL:', line, error.message);
        return line;
      }
      let proxied = `/api/jrkan/proxy-segment?url=${encodeURIComponent(absoluteUrl)}`;
      if (streamId) {
        proxied += `&streamId=${encodeURIComponent(streamId)}`;
      }
      if (sessionToken) {
        proxied += `&session=${encodeURIComponent(sessionToken)}`;
      }
      if (refererToken) {
        proxied += `&referer=${encodeURIComponent(refererToken)}`;
      }
      return proxied;
    })
    .join('\n');
};

// 缓存数据
let cachedMatches = [];
let lastFetchTime = 0;
const CACHE_DURATION = 8 * 60 * 1000; // 8分钟缓存（配合前端2分钟刷新）

// 定时任务：每10分钟更新一次（强制更新）
cron.schedule('*/10 * * * *', async () => {
  try {
    console.log('🕐 定时任务：开始强制更新JRS数据...');
    
    // 强制抓取新数据，忽略缓存
    const newMatches = await crawler.crawlSchedule();
    cachedMatches = newMatches;
    lastFetchTime = Date.now();
    
    console.log(`✅ 定时任务：强制更新完成，获取 ${newMatches.length} 场比赛`);
    
    // 保存映射关系到数据库
    let savedCount = 0;
    for (const match of newMatches) {
      if (match.channels && match.channels.length > 0) {
        const result = await mappingDB.saveMappings(match.id, match.channels, {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          league: match.league,
          time: match.time
        });
        if (result.success) {
          savedCount += result.count;
        }
      }
    }
    
    console.log(`💾 定时任务：保存了 ${savedCount} 个信号源映射`);
  } catch (error) {
    console.error('❌ 定时任务：强制更新失败:', error.message);
  }
});

// 获取JRS比赛数据
async function getJRSMatches() {
  const now = Date.now();
  
  // 如果缓存未过期，直接返回缓存数据
  if (cachedMatches.length && (now - lastFetchTime < CACHE_DURATION)) {
    console.log('📋 返回JRS缓存数据');
    return cachedMatches;
  }

  try {
    console.log('🔄 开始抓取JRS赛程数据...');
    
    // 抓取新数据
    const newMatches = await crawler.crawlSchedule();
    
    if (newMatches && newMatches.length > 0) {
      cachedMatches = newMatches;
      lastFetchTime = now;
      console.log(`✅ 成功抓取JRS数据: ${newMatches.length} 场比赛`);
    } else {
      console.log('⚠️ 未获取到JRS数据，使用缓存');
    }
    
    return cachedMatches;
  } catch (error) {
    console.error('❌ JRS数据抓取失败:', error.message);
    
    // 如果抓取失败但有缓存数据，返回缓存
    if (cachedMatches.length > 0) {
      console.log('📋 抓取失败，返回缓存数据');
      return cachedMatches;
    }
    
    throw error;
  }
}

// 获取比赛列表
router.get('/matches', async (req, res) => {
  try {
    const matches = await getJRSMatches();
    
    // 转换数据格式以适配前端
    const formattedMatches = matches.map(match => ({
      id: match.id || `jrkan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      league: match.league || '未知联赛',
      time: match.time || '',
      status: match.status || '未开始',
      statusClass: getStatusClass(match.status),
      homeTeam: match.homeTeam || '',
      homeLogo: match.homeLogo || '',
      awayTeam: match.awayTeam || '',
      awayLogo: match.awayLogo || '',
      score: match.score || '-',
      homeScore: match.homeScore || '',
      awayScore: match.awayScore || '',
      channels: formatChannels(match.channels || [])
    }));

    res.json({
      success: true,
      data: formattedMatches,
      total: formattedMatches.length,
      lastUpdate: new Date(lastFetchTime).toISOString(),
      source: 'jrs'
    });

  } catch (error) {
    console.error('❌ 获取JRS比赛数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取比赛数据失败',
      error: error.message
    });
  }
});

// 手动触发数据更新
router.post('/refresh', async (req, res) => {
  try {
    console.log('🔄 手动刷新JRS数据...');
    
    // 清除缓存，强制重新抓取
    cachedMatches = [];
    lastFetchTime = 0;
    
    const matches = await getJRSMatches();
    
    // 保存映射关系到数据库
    let savedCount = 0;
    for (const match of matches) {
      if (match.channels && match.channels.length > 0) {
        const result = await mappingDB.saveMappings(match.id, match.channels, {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          league: match.league,
          time: match.time
        });
        if (result.success) {
          savedCount += result.count;
        }
      }
    }
    
    console.log(`💾 手动刷新：保存了 ${savedCount} 个信号源映射`);
    
    res.json({
      success: true,
      message: '数据刷新成功',
      data: matches,
      total: matches.length,
      mappingsSaved: savedCount
    });

  } catch (error) {
    console.error('❌ 手动刷新JRS数据失败:', error);
    res.status(500).json({
      success: false,
      message: '数据刷新失败',
      error: error.message
    });
  }
});

// 获取爬虫状态
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      lastFetch: new Date(lastFetchTime).toISOString(),
      cacheSize: cachedMatches.length,
      cacheAge: Date.now() - lastFetchTime,
      isStale: (Date.now() - lastFetchTime) > CACHE_DURATION
    }
  });
});

// 获取比赛信号源
router.post('/signals', async (req, res) => {
  try {
    const { streamUrls } = req.body;
    
    if (!streamUrls || !Array.isArray(streamUrls)) {
      return res.status(400).json({
        success: false,
        message: 'streamUrls必须是数组'
      });
    }

    console.log(`🎬 开始抓取 ${streamUrls.length} 个信号源...`);
    
    const signals = await signalCrawler.crawlSignals(streamUrls);
    
    res.json({
      success: true,
      data: signals,
      total: signals.length
    });

  } catch (error) {
    console.error('❌ 获取信号源失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/proxy-m3u8', async (req, res) => {
  try {
    const { url, session = '', referer = '', streamId } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: '缺少url参数'
      });
    }

    const decodedUrl = decodeURIComponent(url);
    const sessionToken = session || '';
    const refererToken = referer || '';
    let cookieHeader = decodeBase64Param(sessionToken);
    let refererHeader = decodeBase64Param(refererToken) || DEFAULT_REFERER;

    let targetUrl = decodedUrl;

    logger.info('proxy-m3u8 请求开始', { url: decodedUrl });

    const shouldSendReferer = process.env.JRKAN_FORCE_REFERER === 'true';
    const requestConfigs = [
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, application/octet-stream, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Connection': 'keep-alive',
          ...(cookieHeader ? { Cookie: cookieHeader } : {})
        },
        timeout: 15000,
        maxRedirects: 5,
        responseType: 'text',
        responseEncoding: 'utf8',
        transformResponse: [(data) => data]
      },
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          ...(cookieHeader ? { Cookie: cookieHeader } : {})
        },
        timeout: 15000,
        maxRedirects: 5,
        responseType: 'text',
        responseEncoding: 'utf8',
        transformResponse: [(data) => data]
      }
    ];

    const fetchManifest = async (targetUrl, headersOverride = {}) => {
      let response;
      let lastError;

      for (let i = 0; i < requestConfigs.length; i++) {
        try {
          const mergedHeaders = {
            ...requestConfigs[i].headers,
            ...headersOverride
          };

          if (shouldSendReferer && refererHeader) {
            mergedHeaders['Referer'] = refererHeader;
          }

          const mergedConfig = {
            ...requestConfigs[i],
            headers: mergedHeaders
          };
          console.log(`🔄 尝试请求配置 ${i + 1}: ${targetUrl}`);
          response = await axios.get(targetUrl, mergedConfig);
          console.log(`✅ 请求成功，状态码: ${response.status}`);
          return response;
        } catch (configError) {
          console.warn(`❌ 配置 ${i + 1} 请求失败: ${configError.response?.status} - ${configError.message}`);
          logger.warn('proxy-m3u8 配置失败', {
            url: targetUrl,
            attempt: i + 1,
            status: configError.response?.status,
            message: configError.message
          });
          lastError = configError;
        }
      }

      if (!response) {
        logger.error('proxy-m3u8 获取内容失败', { url: targetUrl, message: lastError?.message });
        throw lastError || new Error('无法获取m3u8内容');
      }
      return response;
    };

    let response;

    const tryRefreshStream = async () => {
      if (!streamId) return null;
      const inferredPlayPage = decodeBase64Param(refererToken) || `http://play.jgdhds.com/play/steam${streamId}.html`;
      const playPageUrl = inferredPlayPage || targetUrl;
      logger.info('proxy-m3u8 准备刷新流地址', { streamId, playPageUrl });

      const refreshed = await signalCrawler.crawlSignal(playPageUrl);
      if (refreshed && refreshed.playUrl) {
        targetUrl = refreshed.playUrl;
        cookieHeader = refreshed.cookies || cookieHeader;
        refererHeader = refreshed.sourceUrl || refererHeader;
        logger.info('proxy-m3u8 刷新成功', { streamId, playUrl: targetUrl });
        return refreshed;
      }

      logger.warn('proxy-m3u8 刷新失败', { streamId });
      return null;
    };

    try {
      response = await fetchManifest(targetUrl, cookieHeader ? { Cookie: cookieHeader } : {});
    } catch (error) {
      const status = error.response?.status;
      if ((status === 404 || status === 403) && streamId) {
        logger.warn('proxy-m3u8 首次请求失败，尝试刷新流', { streamId, status });
        const refreshed = await tryRefreshStream();
        if (refreshed) {
          response = await fetchManifest(targetUrl, refreshed.cookies ? { Cookie: refreshed.cookies } : {});
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    const effectiveSessionToken = sessionToken || (cookieHeader ? encodeBase64Param(cookieHeader) : '');
    const effectiveRefererToken = refererToken || (refererHeader ? encodeBase64Param(refererHeader) : '');
    const manifestContent = typeof response.data === 'string' ? response.data : '';
    const rewrittenContent = rewriteM3u8Manifest(manifestContent, targetUrl, effectiveSessionToken, effectiveRefererToken, streamId);

    res.set({
      'Content-Type': response.headers['content-type'] || 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });

    logger.info('proxy-m3u8 返回成功', { url: decodedUrl, length: rewrittenContent.length });
    res.send(rewrittenContent);
  } catch (error) {
    console.error('❌ 代理m3u8流失败:', error.message);
    logger.error('proxy-m3u8 异常', {
      url: req.query.url,
      message: error.message,
      status: error.response?.status
    });
    const status = error.response?.status || 500;
    if (error.response?.data) {
      res.status(status).set({
        'Content-Type': error.response.headers?.['content-type'] || 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }).send(error.response.data);
    } else {
      res.status(status).json({
        success: false,
        message: '代理m3u8流失败',
        error: error.message
      });
    }
  }
});

router.get('/proxy-segment', async (req, res) => {
  try {
    const { url, session = '', referer = '', streamId } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: '缺少url参数'
      });
    }

    const decodedUrl = decodeURIComponent(url);
    const sessionToken = session || '';
    const refererToken = referer || '';
    let cookieHeader = decodeBase64Param(sessionToken);
    let refererHeader = decodeBase64Param(refererToken) || DEFAULT_REFERER;

    const segmentHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Connection': 'keep-alive',
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    };

    if (process.env.JRKAN_FORCE_REFERER === 'true' && refererHeader) {
      segmentHeaders['Referer'] = refererHeader;
    }

    const response = await axios.get(decodedUrl, {
      headers: segmentHeaders,
      timeout: 15000,
      maxRedirects: 5,
      responseType: 'arraybuffer'
    });

    const upstreamContentType = response.headers['content-type'] || '';
    const bufferData = Buffer.from(response.data);

    if (upstreamContentType.includes('application/vnd.apple.mpegurl') || bufferData.toString('utf-8', 0, 7).includes('#EXTM3U')) {
      const text = bufferData.toString('utf-8');
      const effectiveSessionToken = sessionToken || (cookieHeader ? encodeBase64Param(cookieHeader) : '');
      const effectiveRefererToken = refererToken || (refererHeader ? encodeBase64Param(refererHeader) : '');
      const rewritten = rewriteM3u8Manifest(text, decodedUrl, effectiveSessionToken, effectiveRefererToken, streamId);

      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      });

      res.send(rewritten);
      logger.info('proxy-segment 返回子清单', { url: decodedUrl, length: rewritten.length });
    } else {
      res.set({
        'Content-Type': upstreamContentType || 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      });

      res.end(bufferData, 'binary');
      logger.debug('proxy-segment 返回片段', { url: decodedUrl, size: bufferData.length });
    }
  } catch (error) {
    console.error('❌ 代理分片失败:', error.message);
    logger.error('proxy-segment 异常', {
      url: req.query.url,
      message: error.message,
      status: error.response?.status
    });
    const status = error.response?.status || 500;
    if (error.response?.data) {
      res.status(status).set({
        'Content-Type': error.response.headers?.['content-type'] || 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }).send(error.response.data);
    } else {
      res.status(status).end();
    }
  }
});

// 获取具体比赛的播放链接 - 使用映射表优先策略
router.post('/get-play-url', async (req, res) => {
  try {
    const { streamId, homeTeam, awayTeam, channelIndex = 0 } = req.body;
    
    if (!streamId) {
      return res.status(400).json({
        success: false,
        message: '缺少streamId参数'
      });
    }

    console.log(`🔍 查找比赛播放链接: ${homeTeam || ''} vs ${awayTeam || ''} (${streamId}) 频道${channelIndex}`);
    
    // 策略1: 优先从映射表查询（最准确）- 智能选择高清直播频道
    let mapping = null;
    try {
      mapping = await mappingDB.getMapping(streamId, channelIndex);
    } catch (dbError) {
      console.warn(`⚠️ 数据库查询失败，将使用爬虫缓存策略: ${dbError.message}`);
      mapping = null;
    }
    
    // 如果没有指定频道或指定频道不可用，智能选择最佳频道
    if (!mapping || channelIndex === 0) {
      let allMappings = null;
      try {
        allMappings = await mappingDB.getMapping(streamId);
      } catch (dbError) {
        console.warn(`⚠️ 查询所有映射失败: ${dbError.message}`);
        allMappings = null;
      }
      
      if (allMappings && allMappings.length > 0) {
        console.log(`🔍 找到 ${allMappings.length} 个可用频道，开始智能选择...`);
        
        // 过滤并验证所有映射
        const validMappings = allMappings.filter(m => 
          m.steam_id && 
          /^\d{4,8}$/.test(m.steam_id) && // 确保steamId格式正确
          m.domain
        );
        
        if (validMappings.length === 0) {
          console.error(`❌ 没有有效的映射数据: ${streamId}`);
          return res.json({
            success: false,
            message: '没有有效的信号源映射'
          });
        }
        
        // 🚫 过滤"主播解说"的关键词
        const excludeKeywords = ['主播', '解说', 'commentator', 'host'];
        const isExcludedChannel = (channelName) => {
          if (!channelName) return false;
          const lowerName = channelName.toLowerCase();
          return excludeKeywords.some(keyword => lowerName.includes(keyword.toLowerCase()));
        };
        
        // 先过滤掉"主播解说"的映射
        const filteredMappings = validMappings.filter(m => {
          if (isExcludedChannel(m.channel_name)) {
            console.log(`🚫 跳过"主播解说"映射: ${m.channel_name} (steamId: ${m.steam_id})`);
            return false;
          }
          return true;
        });
        
        if (filteredMappings.length === 0) {
          console.error(`❌ 没有有效的映射数据(已过滤"主播解说"): ${streamId}`);
          return res.json({
            success: false,
            message: '没有有效的信号源映射(已过滤"主播解说")'
          });
        }
        
        // 智能选择策略：优先选择高清直播频道，按成功率排序
        const hdMapping = filteredMappings.find(m => 
          m.channel_name && (
            m.channel_name.includes('高清') || 
            m.channel_name.includes('直播②') ||
            m.channel_index === 2
          )
        ) || filteredMappings.find(m => 
          m.channel_name && m.channel_name.includes('直播')
        );
        
        // 如果找不到高清频道，选择成功率最高的
        mapping = hdMapping || filteredMappings.reduce((best, current) => {
          const currentRate = (current.success_count || 0) / ((current.success_count || 0) + (current.fail_count || 0) + 1);
          const bestRate = (best.success_count || 0) / ((best.success_count || 0) + (best.fail_count || 0) + 1);
          return currentRate > bestRate ? current : best;
        });
        
        console.log(`🎬 智能选择频道: ${mapping.channel_name || '默认频道'}, steamId: ${mapping.steam_id}, 成功率: ${((mapping.success_count || 0) / ((mapping.success_count || 0) + (mapping.fail_count || 0) + 1) * 100).toFixed(1)}%`);
      }
    }
    
      if (mapping && mapping.steam_id && mapping.domain) {
        // 验证steamId格式
        if (!/^\d{4,8}$/.test(mapping.steam_id)) {
          console.error(`❌ 映射表steamId格式错误: ${mapping.steam_id}`);
          return res.json({
            success: false,
            message: '信号源格式错误，请稍后重试'
          });
        }
        
        // 构建正确的播放URL
        const domain = mapping.domain.startsWith('http') ? mapping.domain : `http://${mapping.domain}`;
        const playUrl = `${domain}/play/steam${mapping.steam_id}.html`;
      
      console.log(`✅ 使用映射表查询成功:`);
      console.log(`   streamId: ${streamId} → steamId: ${mapping.steam_id}`);
      console.log(`   domain: ${mapping.domain}`);
      console.log(`   channel: ${mapping.channel_name || '默认频道'}`);
      console.log(`   playUrl: ${playUrl}`);
      
      // 异步更新成功计数（不阻塞响应）
      mappingDB.incrementSuccess(streamId, mapping.steam_id).catch(err => {
        console.error('更新成功计数失败:', err.message);
      });
      
      return res.json({
        success: true,
        playUrl: playUrl,
        steamId: mapping.steam_id,
        domain: mapping.domain,
        strategy: 'mapping_table_hd',
        channelName: mapping.channel_name,
        message: '从映射表获取高清直播链接（智能选择）'
      });
    }
    
    // 如果数据库映射策略失败，直接使用爬虫缓存策略
    if (!mapping || !mapping.steam_id) {
      console.log(`⚠️ 数据库映射策略失败，尝试爬虫缓存策略...`);
    }
    
    // 策略3: 从实时爬虫缓存获取（新增策略）
    console.log(`🔄 尝试从实时爬虫缓存获取...`);
    try {
      const liveMatches = await getJRSMatches();
      console.log(`🔍 查找streamId: ${streamId}, 总比赛数: ${liveMatches.length}`);
      
      // 先列出所有匹配的比赛ID用于调试
      const matchingIds = liveMatches.filter(match => match.id.includes('4438202')).map(m => m.id);
      console.log(`🔍 包含4438202的比赛IDs:`, matchingIds);
      
      const targetMatch = liveMatches.find(match => {
        console.log(`🔍 检查比赛: ${match.id} (${match.homeTeam} vs ${match.awayTeam})`);
        
        // 精确匹配streamId，如果streamId完全相同，直接返回
        if (match.id === streamId) {
          console.log(`✅ 精确匹配streamId: ${match.id}`);
          return true;
        }
        
        // 如果有队伍名称，进行队名匹配
        if (homeTeam && awayTeam && match.homeTeam && match.awayTeam) {
          const homeMatch = match.homeTeam.includes(homeTeam) || homeTeam.includes(match.homeTeam);
          const awayMatch = match.awayTeam.includes(awayTeam) || awayTeam.includes(match.awayTeam);
          if (homeMatch && awayMatch) {
            console.log(`🔍 通过队名匹配: ${homeTeam} vs ${awayTeam} → ${match.homeTeam} vs ${match.awayTeam}`);
            return true;
          }
        }
        
        return false;
      });
      
      if (targetMatch && targetMatch.channels && targetMatch.channels.length > 0) {
        console.log(`✅ 从爬虫缓存找到比赛: ${targetMatch.homeTeam} vs ${targetMatch.awayTeam}`);
        console.log(`📺 可用频道数量: ${targetMatch.channels.length}`);
        targetMatch.channels.forEach((ch, idx) => {
          console.log(`   频道${idx + 1}: ${ch.name} (steamId: ${ch.steamId}, domain: ${ch.domain}, isValid: ${ch.isValid})`);
        });
        
        // 🚫 过滤"主播解说"的关键词
        const excludeKeywords = ['主播', '解说', 'commentator', 'host'];
        const isExcludedChannel = (channelName) => {
          if (!channelName) return false;
          const lowerName = channelName.toLowerCase();
          return excludeKeywords.some(keyword => lowerName.includes(keyword.toLowerCase()));
        };
        
        // 过滤有效频道（排除"主播解说"）
        const validChannels = targetMatch.channels.filter(channel => {
          // 🚫 第一步：过滤"主播解说"
          if (isExcludedChannel(channel.name)) {
            console.log(`🚫 跳过"主播解说"频道: ${channel.name}`);
            return false;
          }
          // 第二步：验证steamId格式
          if (!channel.steamId || !/^\d{4,8}$/.test(channel.steamId)) {
            return false;
          }
          // 第三步：检查有效性标记
          if (channel.isValid === false) {
            return false;
          }
          return true;
        });
        
        console.log(`✅ 有效频道数量: ${validChannels.length}`);
        
        if (validChannels.length > 0) {
          // 智能选择最佳频道 - 优化选择策略
          let bestChannel = null;
          
          // 第一优先级：高清直播频道
          bestChannel = validChannels.find(c => 
            c.name && (c.name.includes('高清') || c.name.includes('直播②'))
          );
          
          if (bestChannel) {
            console.log(`🎯 选择高清频道: ${bestChannel.name}`);
          } else {
            // 第二优先级：普通直播频道（已过滤主播解说，这里不再需要检查）
            bestChannel = validChannels.find(c => 
              c.name && c.name.includes('直播')
            );
            
            if (bestChannel) {
              console.log(`🎯 选择直播频道: ${bestChannel.name}`);
            } else {
              // 第三优先级：第一个有效频道
              bestChannel = validChannels[0];
              console.log(`🎯 选择默认频道: ${bestChannel.name}`);
            }
          }
          
          const domain = bestChannel.domain.startsWith('http') ? bestChannel.domain : `http://${bestChannel.domain}`;
          const playUrl = `${domain}/play/steam${bestChannel.steamId}.html`;
          
          console.log(`✅ 最终选择频道: ${bestChannel.name} → steam${bestChannel.steamId}`);
      console.log(`   playUrl: ${playUrl}`);
      
      return res.json({
        success: true,
        playUrl: playUrl,
            steamId: bestChannel.steamId,
            domain: bestChannel.domain,
            strategy: 'crawler_cache_optimized',
            channelName: bestChannel.name,
            message: `从爬虫缓存获取播放链接 - 选择了${bestChannel.name}频道`
          });
        } else {
          console.log(`❌ 没有有效的频道数据`);
        }
      } else {
        console.log(`❌ 未找到匹配的比赛或没有频道数据`);
      }
    } catch (cacheError) {
      console.warn(`⚠️ 从爬虫缓存获取失败: ${cacheError.message}`);
    }
    
    // 策略4: 兜底策略 - 使用旧的StreamIdMapper实时获取 + 智能域名切换
    console.log(`⚠️ 所有策略失败，尝试实时获取...`);
    try {
      const realSteamId = await streamIdMapper.getMapping(streamId);
      
      // 验证实时获取的steamId
      if (!realSteamId || !/^\d{4,8}$/.test(realSteamId)) {
        console.error(`❌ 实时获取的steamId格式错误: ${realSteamId}`);
        return res.json({
          success: false,
          message: '无法获取有效的信号源，请稍后重试'
        });
      }
      
      // 智能域名选择：结合健康检查和历史成功率
      const availableDomains = [
        { domain: 'http://play.jgdhds.com', priority: 1 },
        { domain: 'https://play.sportsteam7777.com', priority: 2 }
      ];
      
      let selectedDomain = availableDomains[0].domain; // 默认使用jgdhds.com
      
      try {
        // 优先使用健康检查选择最佳域名
        selectedDomain = await domainHealthChecker.getBestDomain(availableDomains);
      } catch (healthError) {
        console.warn('⚠️ 域名健康检查失败，使用默认域名:', healthError.message);
      }
      
      const playUrl = `${selectedDomain}/play/steam${realSteamId}.html`;
      
      console.log(`✅ 实时映射获取成功: ${streamId} → ${realSteamId}`);
      console.log(`   选择域名: ${selectedDomain}`);
      
      return res.json({
        success: true,
        playUrl: playUrl,
        steamId: realSteamId,
        domain: selectedDomain,
        strategy: 'realtime_mapper_with_smart_domain',
        message: '实时获取映射关系，智能选择最佳域名'
      });
    } catch (mapError) {
      console.error('❌ 实时映射也失败:', mapError.message);
    }
    
    // 策略5: 全部失败
    console.error(`❌ 所有策略都失败，无法获取播放链接`);
    res.json({
      success: false,
      message: '暂无可用信号源，请稍后重试'
    });

  } catch (error) {
    console.error('❌ 获取播放链接失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 辅助函数：获取状态样式类
function getStatusClass(status) {
  if (!status) return 'upcoming';
  
  const statusLower = status.toLowerCase();
  
  if (statusLower.includes('直播') || statusLower.includes('进行') || statusLower.includes('第')) {
    return 'live';
  } else if (statusLower.includes('结束') || statusLower.includes('完场')) {
    return 'finished';
  } else {
    return 'upcoming';
  }
}

// 辅助函数：格式化频道数据 - 保留steamId和domain用于映射
function formatChannels(channels) {
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
      console.log(`🚫 格式化时过滤掉"主播解说"频道: ${channel.name}`);
      return false;
    }
    return true;
  });
  
  return filteredChannels.map((channel, index) => ({
    name: channel.name || `直播${index + 1}`,
    url: channel.url || '#',
    quality: channel.quality || 'HD',
    steamId: channel.steamId || null,
    domain: channel.domain || null,
    channelIndex: channel.channelIndex !== undefined ? channel.channelIndex : index
  }));
}

// 批量更新映射表
router.post('/update-mappings', async (req, res) => {
  try {
    const { streamIds } = req.body;
    
    if (!Array.isArray(streamIds)) {
      return res.status(400).json({
        success: false,
        message: 'streamIds必须是数组'
      });
    }
    
    console.log(`🔄 开始批量更新映射表，共 ${streamIds.length} 个streamId`);
    
    // 批量更新映射表
    await streamIdMapper.updateAllMappings(streamIds);
    
    const stats = streamIdMapper.getStats();
    
    res.json({
      success: true,
      message: '批量更新映射表完成',
      stats: stats
    });
    
  } catch (error) {
    console.error('❌ 批量更新映射表失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取映射表统计信息
router.get('/mapping-stats', async (req, res) => {
  try {
    const stats = streamIdMapper.getStats();
    
    res.json({
      success: true,
      stats: stats
    });
    
  } catch (error) {
    console.error('❌ 获取映射表统计失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 健康度监控接口
router.get('/health', async (req, res) => {
  try {
    const stats = await mappingDB.getStats();
    
    const health = {
      timestamp: new Date().toISOString(),
      database: stats ? 'healthy' : 'degraded',
      mappings: {
        total: stats?.total_mappings || 0,
        uniqueStreams: stats?.unique_streams || 0,
        totalSuccess: stats?.total_success || 0,
        totalFails: stats?.total_fails || 0,
        successRate: stats?.success_rate ? (stats.success_rate * 100).toFixed(2) + '%' : 'N/A'
      },
      cache: {
        size: cachedMatches.length,
        lastUpdate: lastFetchTime > 0 ? new Date(lastFetchTime).toISOString() : 'Never',
        isStale: (Date.now() - lastFetchTime) > CACHE_DURATION
      }
    };

    const overallHealth = stats && stats.success_rate > 0.8 ? 'good' : 'degraded';

    res.json({
      success: true,
      health: overallHealth,
      data: health
    });

  } catch (error) {
    console.error('❌ 健康检查失败:', error);
    res.status(500).json({
      success: false,
      health: 'critical',
      message: error.message
    });
  }
});

// 域名健康检查
router.get('/domain-health', async (req, res) => {
  try {
    const domains = [
      { domain: 'http://play.jgdhds.com', priority: 1 },
      { domain: 'https://play.sportsteam7777.com', priority: 2 }
    ];
    
    const results = await domainHealthChecker.checkMultipleDomains(domains);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      domains: results.map(r => ({
        domain: r.domain,
        healthy: r.health.healthy,
        responseTime: r.health.responseTime,
        score: r.score,
        lastChecked: r.health.lastChecked
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 手动切换域名
router.post('/switch-domain', async (req, res) => {
  try {
    const { streamId, preferredDomain } = req.body;
    
    if (!streamId) {
      return res.status(400).json({
        success: false,
        message: '缺少streamId参数'
      });
    }
    
    // 获取所有可用的映射记录
    const allMappings = await mappingDB.getMapping(streamId);
    
    if (!allMappings || allMappings.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到该比赛的映射记录'
      });
    }
    
    // 如果指定了偏好域名，优先使用
    let selectedMapping = allMappings[0];
    
    if (preferredDomain) {
      const preferredMapping = allMappings.find(m => 
        m.domain === preferredDomain || m.domain.includes(preferredDomain)
      );
      if (preferredMapping) {
        selectedMapping = preferredMapping;
      }
    } else {
      // 否则选择成功率最高的
      selectedMapping = allMappings.reduce((best, current) => {
        const currentSuccessRate = current.success_count / (current.success_count + current.fail_count + 1);
        const bestSuccessRate = best.success_count / (best.success_count + best.fail_count + 1);
        return currentSuccessRate > bestSuccessRate ? current : best;
      });
    }
    
    const playUrl = `${selectedMapping.domain.startsWith('http') ? selectedMapping.domain : 'http://' + selectedMapping.domain}/play/steam${selectedMapping.steam_id}.html`;
    
    res.json({
      success: true,
      playUrl: playUrl,
      steamId: selectedMapping.steam_id,
      domain: selectedMapping.domain,
      channelName: selectedMapping.channel_name,
      successRate: selectedMapping.success_count / (selectedMapping.success_count + selectedMapping.fail_count + 1),
      message: '域名切换成功'
    });
    
  } catch (error) {
    console.error('❌ 域名切换失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取域名管理器状态（需要导入DomainManager）
const { DomainManager } = require('../config/domains');
const domainManager = new DomainManager();

router.get('/domains', (req, res) => {
  try {
    const stats = domainManager.getStats();
    
    res.json({
      success: true,
      domains: stats
    });
  } catch (error) {
    console.error('❌ 获取域名状态失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 设置域名状态
router.post('/domains/:domainUrl/status', (req, res) => {
  try {
    const { domainUrl } = req.params;
    const { status } = req.body;
    
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '状态必须是 active 或 inactive'
      });
    }

    const decodedUrl = decodeURIComponent(domainUrl);
    const result = domainManager.setDomainStatus(decodedUrl, status);
    
    if (result) {
      res.json({
        success: true,
        message: '域名状态已更新'
      });
    } else {
      res.status(404).json({
        success: false,
        message: '域名不存在'
      });
    }
  } catch (error) {
    console.error('❌ 设置域名状态失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 提取m3u8流地址API
router.post('/extract-stream', async (req, res) => {
  try {
    const startedAt = Date.now();
    req.__extractStreamStartedAt = startedAt;
    const { streamId, playUrl, force = false } = req.body
    logger.info('extract-stream 请求开始', { streamId, playUrl })
    
    if (!streamId) {
      return res.json({
        success: false,
        message: '缺少streamId参数'
      })
    }
    
    console.log(`🎬 提取流地址请求: streamId=${streamId}, playUrl=${playUrl}`)
    
    // 构建完整的播放URL
    const fullPlayUrl = playUrl || `http://play.jgdhds.com/play/steam${streamId}.html`
    
    const signals = await signalCrawler.crawlAllSignals(fullPlayUrl)
    
    // 注意：过滤"主播解说"已在 extractChannelButtons 中完成
    // 如果 crawlAllSignals 返回空数组，说明所有信号都是"主播解说"，已被过滤
    if (!signals || signals.length === 0) {
      console.log(`❌ 没有可用信号源（所有信号都是"主播解说"）: ${streamId}`);
      logger.warn('extract-stream 所有信号都被过滤', { streamId, playUrl: fullPlayUrl });
      return res.json({
        success: false,
        message: '没有可用的直播源（所有信号都是"主播解说"，已被过滤）'
      });
    }
    
    // 有可用信号源，继续处理
      const primary = signals[0]
      console.log(`✅ 成功提取流地址: ${primary.playUrl} (共 ${signals.length} 个信号源)`)
      logger.info('extract-stream 成功', {
        streamId,
        playUrl: primary.playUrl,
        type: primary.type,
        sourceUrl: primary.sourceUrl,
        signalCount: signals.length
      })
      logger.info('extract-stream 耗时', {
        streamId,
        durationMs: Date.now() - startedAt,
        fromCache: false
      })

      return res.json({
        success: true,
        streamUrl: primary.playUrl,
        type: primary.type,
        quality: primary.quality,
        sourceUrl: primary.sourceUrl,
        sessionCookies: primary.cookies || '',
        signals: (() => {
          // 🎯 增强去重：去除相同URL的信号源
          const seenUrls = new Set();
          const uniqueSignals = [];
          
          for (const signal of signals) {
            if (!signal || !signal.playUrl) continue;
            
            // 提取用于比较的URL（去除参数）
            let urlForComparison = signal.playUrl;
            try {
              const url = new URL(signal.playUrl);
              urlForComparison = `${url.protocol}//${url.host}${url.pathname}`;
            } catch (e) {
              urlForComparison = signal.playUrl.split('?')[0].split('#')[0];
            }
            
            // 如果URL已存在，跳过
            if (seenUrls.has(urlForComparison)) {
              console.log(`🚫 过滤重复信号源: ${signal.label} - ${urlForComparison.substring(0, 80)}...`);
              continue;
            }
            
            seenUrls.add(urlForComparison);
            uniqueSignals.push({
              label: signal.label || `线路${uniqueSignals.length + 1}`,
          playUrl: signal.playUrl,
          sourceUrl: signal.sourceUrl,
          type: signal.type,
          quality: signal.quality,
          sessionCookies: signal.cookies || ''
            });
          }
          
          return uniqueSignals;
        })()
      })
  } catch (error) {
    console.error('❌ 提取流地址出错:', error.message)
    logger.error('extract-stream 异常', {
      streamId: req.body?.streamId,
      playUrl: req.body?.playUrl,
      message: error.message
    })
    logger.info('extract-stream 耗时', {
      streamId: req.body?.streamId,
      durationMs: Date.now() - Number(req.__extractStreamStartedAt || Date.now()),
      success: false,
      error: error.message
    })
    
    return res.json({
      success: false,
      message: '提取流地址时发生错误',
      error: error.message
    })
  }
})

// 清理错误映射的API接口
router.post('/cleanup-mappings', async (req, res) => {
  try {
    const { streamId } = req.body;
    
    if (!streamId) {
      return res.status(400).json({
        success: false,
        message: '缺少streamId参数'
      });
    }
    
    console.log(`🧹 开始清理错误映射: ${streamId}`);
    
    // 获取所有映射
    const allMappings = await mappingDB.getMapping(streamId);
    
    if (!allMappings || allMappings.length === 0) {
      return res.json({
        success: true,
        message: '没有找到映射数据',
        cleanedCount: 0
      });
    }
    
    // 过滤并删除格式错误的映射
    const { pool } = require('../config/database');
    let cleanedCount = 0;
    
    for (const mapping of allMappings) {
      // 检查steamId格式是否正确
      if (!mapping.steam_id || !/^\d{4,8}$/.test(mapping.steam_id)) {
        console.log(`🗑️ 删除错误映射: ${mapping.steam_id} (格式错误)`);
        
        const deleteSql = `
          DELETE FROM stream_mappings 
          WHERE stream_id = ? AND steam_id = ?
        `;
        await pool.query(deleteSql, [streamId, mapping.steam_id]);
        cleanedCount++;
      }
    }
    
    console.log(`✅ 清理完成，删除了 ${cleanedCount} 个错误映射`);
    
    res.json({
      success: true,
      message: `成功清理 ${cleanedCount} 个错误映射`,
      cleanedCount: cleanedCount
    });
    
  } catch (error) {
    console.error('❌ 清理映射失败:', error);
    res.status(500).json({
      success: false,
      message: '清理映射失败',
      error: error.message
    });
  }
});

module.exports = router;
