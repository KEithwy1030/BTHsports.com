const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const crypto = require('crypto');
// const { chromium } = require('playwright'); // 暂时注释，避免磁盘空间问题
// const { pool, redisClient } = require('../config/database'); // 暂时注释，演示模式不需要数据库
const cron = require('node-cron');
const JRKANSignalCrawler = require('./JRKANSignalCrawler');
const StreamIdMapper = require('./StreamIdMapper');
const mappingDB = require('../utils/MappingDB');
const { DomainManager } = require('../config/domains');

class StreamCrawler {
  constructor() {
    this.browser = null;
    this.isRunning = false;
    this.config = {
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
      ],
      delay: parseInt(process.env.CRAWLER_DELAY) || 2000,
      retry: parseInt(process.env.CRAWLER_RETRY) || 3,
      timeout: 10000,
      minDelay: 2000,
      maxDelay: 5000
    };
    
    // 简化配置，移除复杂缓存
    this.cache = {
      matches: null,
      lastUpdate: null
    };
    
    // 监控统计
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      lastCrawlTime: null,
      lastCrawlCount: 0
    };
    
    // 增量爬取状态
    this.incrementalState = {
      lastCrawledIndex: 0,        // 上次抓取到的位置
      totalMatches: 0,            // 总比赛数量
      batchSize: 20,              // 每批抓取数量
      isFirstRun: true,           // 是否首次运行
      lastBatchCount: 0           // 上次抓取的比赛数量
    };
    
    // Logo处理状态
    this.logoStats = {
      totalLogos: 0,
      validLogos: 0,
      failedLogos: 0,
      cachedLogos: new Map(),     // 缓存的Logo URL
      lastValidationTime: null
    };

    // 信号源抓取依赖
    this.signalCrawler = new JRKANSignalCrawler();
    this.streamIdMapper = new StreamIdMapper();
    this.domainManager = new DomainManager();
    this.channelCache = new Map(); // matchId -> candidates
  }

  // 反爬虫辅助方法
  getRandomUserAgent() {
    const randomIndex = Math.floor(Math.random() * this.config.userAgents.length);
    return this.config.userAgents[randomIndex];
  }

  // 随机延迟
  async randomDelay() {
    const delay = Math.floor(Math.random() * (this.config.maxDelay - this.config.minDelay + 1)) + this.config.minDelay;
    console.log(`⏱️ 随机延迟 ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // 记录统计信息
  recordRequest(success = true) {
    this.stats.totalRequests++;
    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }
  }

  // 获取统计信息
  getStats() {
    const successRate = this.stats.totalRequests > 0 ? 
      (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      successRate: `${successRate}%`
    };
  }

  // 初始化浏览器（已禁用 - Zeabur 环境不支持）
  async initBrowser() {
    // 浏览器功能在云环境（Zeabur）中不可用
    // 原因：1. 容器中没有 Chrome/Chromium
    //       2. 资源消耗大（内存、CPU）
    //       3. 成本高且不稳定
    console.warn('⚠️ 浏览器自动化功能已禁用（云环境不支持）');
    return null;
  }

  // 关闭浏览器
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // 爬取popozhibo平台比赛列表
  async crawlPopozhiboMatches() {
    try {
      // 检查缓存
      const now = Date.now();
      if (this.cache.matches && this.cache.lastUpdate && 
          (now - this.cache.lastUpdate) < this.cache.cacheTimeout) {
        console.log('📋 使用缓存的比赛数据');
        return this.cache.matches;
      }
      
      console.log('🔄 开始增量爬取popozhibo比赛数据...');
      
      // 应用反爬虫策略
      await this.randomDelay();
      const userAgent = this.getRandomUserAgent();
      console.log(`🎭 使用User-Agent: ${userAgent.substring(0, 50)}...`);
      
      // 修改目标页面为/live
      const response = await axios.get('http://www.popozhibo.xyz/live', {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: this.config.timeout
      });

      const $ = cheerio.load(response.data);
      const matches = [];

      // 解析比赛列表 - 基于popozhibo实际结构
      // 从调试中发现，比赛信息在 li 元素中，包含队伍名称和联赛信息
      const matchItems = $('li').filter((i, el) => {
        const $li = $(el);
        return $li.find('.left-team-name').length > 0 && $li.find('.game-name').length > 0;
      });
      
      console.log(`找到 ${matchItems.length} 个比赛项目`);
      
      // 计算增量爬取范围 - 优先抓取近期比赛
      const currentDate = new Date();
      const priorityItems = Array.from(matchItems).filter((_, index) => {
        const $li = $(matchItems[index]);
        const timeStr = $li.find('.game-time').text().trim();
        if (!timeStr) return false;
        
        // 解析时间，优先抓取未来3天内的比赛
        const matchTime = this.parseMatchTime(timeStr);
        const timeDiff = matchTime.getTime() - currentDate.getTime();
        return timeDiff > 0 && timeDiff <= 3 * 24 * 60 * 60 * 1000; // 3天内
      });
      
      const startIndex = this.incrementalState.lastCrawledIndex;
      const endIndex = Math.min(startIndex + this.incrementalState.batchSize, matchItems.length);
      
      console.log(`📊 增量爬取范围: ${startIndex} - ${endIndex} (总计${matchItems.length}场比赛)`);
      console.log(`📈 抓取进度: ${((startIndex / matchItems.length) * 100).toFixed(1)}% - ${((endIndex / matchItems.length) * 100).toFixed(1)}%`);
      
      // 解析指定范围的比赛项目
      for (let i = startIndex; i < endIndex; i++) {
        const $li = $(matchItems[i]);
        
        // 提取队伍名称 - 增强数据验证
        const homeTeamEl = $li.find('.left-team-name').first();
        const awayTeamEl = $li.find('.right-team-name').first();
        const homeTeam = homeTeamEl.text().trim();
        const awayTeam = awayTeamEl.text().trim();
        
        // 数据完整性检查
        if (!homeTeam || !awayTeam || homeTeam === '主队' || awayTeam === '客队') {
          console.log(`⚠️ 跳过无效比赛: ${homeTeam} vs ${awayTeam}`);
          continue;
        }
        
        // 提取队伍Logo - 修复选择器并处理跨域问题
        const homeLogoEl = $li.find('.left-team img').first();
        const awayLogoEl = $li.find('.right-team img').first();
        
        // 获取原始logo URL
        let homeLogo = homeLogoEl.attr('src') || '/teams/default.png';
        let awayLogo = awayLogoEl.attr('src') || '/teams/default.png';
        
        // 保留原始Logo URL，让前端处理跨域问题
        
        // 验证Logo URL有效性（异步但不等待，避免阻塞）
        this.validateLogoUrl(homeLogo).then(isValid => {
          if (!isValid && homeLogo !== '/teams/default.png') {
            console.warn(`⚠️ 主队Logo无效: ${homeLogo}`);
          }
        }).catch(err => console.warn(`主队Logo验证失败: ${err.message}`));
        
        this.validateLogoUrl(awayLogo).then(isValid => {
          if (!isValid && awayLogo !== '/teams/default.png') {
            console.warn(`⚠️ 客队Logo无效: ${awayLogo}`);
          }
        }).catch(err => console.warn(`客队Logo验证失败: ${err.message}`));
        
        // Logo抓取成功日志
        if (i < 3) { // 只打印前3个比赛的成功信息
          console.log(`✅ 比赛 ${i + 1} Logo抓取成功:`);
          console.log(`  主队Logo: ${homeLogo}`);
          console.log(`  客队Logo: ${awayLogo}`);
        }
        
        // 提取联赛信息
        const leagueEl = $li.find('.game-name').first();
        const league = leagueEl.text().trim() || '未知联赛';
        
        // 提取比赛时间 - 使用正确的选择器
        let matchTime = new Date(); // 默认使用当前时间
        const timeEl = $li.find('.game-time').first();
        if (timeEl.length > 0) {
          const timeText = timeEl.text().trim();
          matchTime = this.parseMatchTime(timeText) || matchTime;
          console.log(`🔍 比赛时间解析: "${timeText}" -> ${matchTime.toLocaleString()}`);
        } else {
          console.log(`⚠️ 未找到时间元素，使用当前时间`);
        }
        
        // 计算比赛状态 - 按照您的推测逻辑
        const status = this.calculateMatchStatus(matchTime);
        
        // 生成比赛ID
        const matchId = 200000 + i;
        
        matches.push({
          matchId: matchId,
          homeTeam,
          awayTeam,
          homeLogo,
          awayLogo,
          league,
          matchTime: matchTime,
          status,
          sourcePlatform: 'popozhibo',
          matchUrl: `/live/${matchId}/play`
        });
      }

      // 更新增量爬取状态
      const newMatchesCount = matches.length;
      this.incrementalState.lastCrawledIndex = endIndex;
      this.incrementalState.totalMatches = matchItems.length;
      this.incrementalState.lastBatchCount = newMatchesCount;
      this.incrementalState.isFirstRun = false;
      
      console.log(`✅ 增量爬取完成: 本次抓取${newMatchesCount}场比赛`);
      console.log(`📊 累计进度: ${this.incrementalState.lastCrawledIndex}/${this.incrementalState.totalMatches} (${((this.incrementalState.lastCrawledIndex / this.incrementalState.totalMatches) * 100).toFixed(1)}%)`);
      
      // 检查是否完成全部抓取
      if (this.incrementalState.lastCrawledIndex >= this.incrementalState.totalMatches) {
        console.log('🎉 所有比赛抓取完成，重置索引准备下一轮');
        this.incrementalState.lastCrawledIndex = 0;
        this.incrementalState.isFirstRun = true;
      }
      
      // 记录成功统计
      this.recordRequest(true);
      this.stats.lastCrawlTime = new Date().toISOString();
      this.stats.lastCrawlCount = newMatchesCount;
      
      // 累积更新缓存（不覆盖，而是合并）
      if (!this.cache.matches) {
        this.cache.matches = [];
      }
      
      // 合并新比赛数据，避免重复
      const existingIds = new Set(this.cache.matches.map(m => m.matchId));
      const newMatches = matches.filter(m => !existingIds.has(m.matchId));
      this.cache.matches = [...this.cache.matches, ...newMatches];
      
      this.cache.lastUpdate = Date.now();
      
      return matches;

    } catch (error) {
      console.error('❌ 爬取popozhibo比赛列表失败:', error.message);
      
      // 记录失败统计
      this.recordRequest(false);
      
      // 增强错误处理
      if (error.code === 'ECONNABORTED') {
        console.error('⏰ 请求超时，可能是网络问题');
      } else if (error.response) {
        console.error(`🚫 HTTP错误: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        console.error('🌐 网络请求失败，无法连接到目标服务器');
      } else {
        console.error('❓ 未知错误:', error.message);
      }
      
      await this.logCrawlerActivity('popozhibo', 'crawl_matches', 'error', error.message);
      return [];
    }
  }

  // 爬取真实的信号源
  async crawlRealStreamSources(matchId) {
    try {
      console.log(`🔍 开始爬取比赛 ${matchId} 的真实信号源`);
      
      // 根据比赛ID生成真实的播放器URL
      // 使用您提供的URL格式作为模板
      const realPlayerUrl = `http://play.jgdhds.com/play/gm.php?id=${matchId}&id2=${matchId}`;
      
      console.log(`🎯 尝试访问真实播放器: ${realPlayerUrl}`);
      
      // 使用HTTP请求获取页面内容
      const response = await axios.get(realPlayerUrl, {
        headers: {
          'User-Agent': this.config.userAgent,
          'Referer': 'http://www.popozhibo.xyz/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: this.config.timeout
      });
      
      const html = response.data;
      const $ = cheerio.load(html);
      
      const sources = [];
      
      // 查找视频播放器元素
      $('video source, iframe[src*="play."], iframe[src*="live."], iframe[src*="stream."]').each((index, element) => {
        const $el = $(element);
        const src = $el.attr('src');
        
        if (src && src.startsWith('http')) {
          sources.push({
            name: `真实信号源${index + 1}`,
            url: src,
            sourceType: 'hd_live',
            qualityScore: 90,
            isActive: true
          });
        }
      });
      
      // 如果没有找到视频元素，返回播放器页面URL作为信号源
      if (sources.length === 0) {
        sources.push({
          name: '真实播放器',
          url: realPlayerUrl,
          sourceType: 'hd_live',
          qualityScore: 95,
          isActive: true
        });
      }
      
      console.log(`📡 从真实播放器解析到 ${sources.length} 个信号源`);
      return sources;
      
    } catch (error) {
      console.error(`❌ 爬取真实信号源失败: ${error.message}`);
      throw error;
    }
  }

  // 检查是否启用浏览器功能
  isBrowserEnabled() {
    // 云环境（Zeabur）默认禁用浏览器功能
    if (process.env.ENABLE_BROWSER === 'true') {
      return true;
    }
    // 检查是否有可用的 Chrome/Chromium
    const fs = require('fs');
    const chromePaths = [
      process.env.CHROME_PATH,
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome'
    ].filter(Boolean);
    
    return chromePaths.some(path => {
      try {
        return fs.existsSync(path);
      } catch {
        return false;
      }
    });
  }

  // 新增方法：使用浏览器自动化获取真实视频流（云环境已禁用）
  async crawlRealVideoStreams(matchId) {
    console.log(`🔍 开始获取比赛 ${matchId} 的真实视频流...`);
    
    // 检查是否启用浏览器功能
    if (!this.isBrowserEnabled()) {
      console.warn('⚠️ 浏览器自动化功能已禁用（云环境不支持），跳过浏览器爬取');
      return [];
    }
    
    let browser;
    try {
      // 尝试使用系统Chrome，配置多种路径选项
      const chromePaths = [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      ];
      
      let executablePath;
      for (const path of chromePaths) {
        if (path) {
          try {
            const fs = require('fs');
            if (fs.existsSync(path)) {
              executablePath = path;
              console.log(`✅ 找到Chrome路径: ${path}`);
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      if (!executablePath) {
        console.warn('⚠️ 未找到可用的 Chrome/Chromium，跳过浏览器爬取');
        return [];
      }
      
      browser = await puppeteer.launch({ 
        headless: true,
        executablePath: executablePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security'
        ]
      });
      
      const page = await browser.newPage();
      
      // 监听所有网络请求，捕获真实视频流
      const realStreams = [];
      page.on('response', async response => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        // 识别真实的视频流URL
        if (url.includes('.m3u8') || 
            url.includes('.mp4') || 
            url.includes('live') ||
            contentType.includes('video/') ||
            contentType.includes('application/vnd.apple.mpegurl') ||
            contentType.includes('application/x-mpegURL')) {
          
          console.log(`🎥 发现真实视频流: ${url}`);
          realStreams.push({
            url: url,
            type: url.includes('.m3u8') ? 'hls' : 'mp4',
            quality: this.detectStreamQuality(url, contentType)
          });
        }
      });
      
      // 访问播放器页面
      const playerUrl = `http://play.jgdhds.com/play/steam800${matchId.toString().slice(-3)}.html`;
      console.log(`🌐 访问播放器页面: ${playerUrl}`);
      
      await page.goto(playerUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // 等待JavaScript执行和视频加载
      await page.waitForTimeout(5000);
      
      // 尝试触发视频播放以获取更多流
      try {
        await page.click('video, .play-btn, [data-play], iframe, .player');
        await page.waitForTimeout(3000);
      } catch (e) {
        console.log('自动播放触发失败，继续监听网络请求');
      }
      
      console.log(`✅ 捕获到 ${realStreams.length} 个真实视频流`);
      return realStreams;
      
    } catch (error) {
      console.error(`❌ 浏览器自动化失败: ${error.message}`);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // 新增方法：检测视频流质量
  detectStreamQuality(url, contentType) {
    let quality = 80; // 基础质量分
    
    if (url.includes('hd') || url.includes('high')) quality += 15;
    if (url.includes('4k') || url.includes('ultra')) quality += 20;
    if (contentType.includes('video/mp4')) quality += 10;
    if (url.includes('.m3u8')) quality += 5;
    
    return Math.min(quality, 100);
  }

  // 新增方法：直接调用JRS80 API
  async crawlJRS80APIDirect(matchId) {
    try {
      console.log(`🔍 尝试直接调用JRS80 API获取真实流...`);
      
      // 1. 获取比赛数据API
      const matchesResponse = await axios.get(
        'https://css-js-j.oss-accelerate.aliyuncs.com/tmp/event',
        {
          params: {
            type: 'zqlq',
            callback: 'cb_base_zqlq_0',
            _: Date.now()
          },
          headers: {
            'User-Agent': this.config.userAgent,
            'Referer': 'https://www.jrs80.com/'
          },
          timeout: 10000
        }
      );
      
      // 2. 解析JSONP响应
      const jsonpData = this.parseJSONPResponse(matchesResponse.data);
      
      // 3. 查找对应比赛的真实流URL
      const matchData = jsonpData.matches?.find(m => m.lid === matchId.toString());
      if (matchData && matchData.stream_url) {
        console.log(`✅ 从API获取到真实流: ${matchData.stream_url}`);
        return [{
          url: matchData.stream_url,
          type: 'hls',
          quality: 95
        }];
      }
      
      return [];
    } catch (error) {
      console.error(`❌ API直接调用失败: ${error.message}`);
      return [];
    }
  }

  // 新增方法：解析JSONP响应
  parseJSONPResponse(jsonpString) {
    try {
      // 移除JSONP回调函数包装
      const jsonMatch = jsonpString.match(/cb_base_zqlq_0\((.*)\);?$/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      return {};
    } catch (error) {
      console.error('JSONP解析失败:', error.message);
      return {};
    }
  }

  // 智能验证URL是否可用
  async validateStreamUrl(url, retryCount = 0) {
    try {
      // 应用反爬虫策略
      if (retryCount > 0) {
        await this.randomDelay();
      }
      
      const userAgent = this.getRandomUserAgent();
      const response = await axios.head(url, { 
        timeout: 5000,
        headers: {
          'User-Agent': userAgent,
          'Referer': 'https://www.jrs80.com/'
        }
      });
      
      const contentType = response.headers['content-type'] || '';
      const contentLength = response.headers['content-length'];
      
      // 检查是否为真实视频流
      const isVideoStream = contentType.includes('video/') ||
                           contentType.includes('application/vnd.apple.mpegurl') ||
                           contentType.includes('application/x-mpegURL') ||
                           url.includes('.m3u8') || 
                           url.includes('.mp4') ||
                           (contentLength && parseInt(contentLength) > 1024);
      
      if (!isVideoStream) {
        console.log(`❌ 非视频流URL: ${url} - Content-Type: ${contentType}`);
        return false;
      }
      
      console.log(`✅ 真实视频流验证通过: ${url} - Content-Type: ${contentType}`);
      this.recordRequest(true);
      return true;
    } catch (error) {
      console.log(`❌ URL验证失败: ${url} - ${error.message}`);
      this.recordRequest(false);
      
      // 重试机制
      if (retryCount < this.config.retry) {
        console.log(`🔄 重试验证URL (${retryCount + 1}/${this.config.retry}): ${url}`);
        return await this.validateStreamUrl(url, retryCount + 1);
      }
      
      return false;
    }
  }

  // 新增方法：从iframe提取流
  async extractStreamFromIframe(iframeSrc) {
    try {
      const response = await axios.get(iframeSrc, {
        headers: { 'User-Agent': this.config.userAgent },
        timeout: 5000
      });
      
      const html = response.data;
      const m3u8Match = html.match(/["']([^"']*\.m3u8[^"']*)["']/);
      
      if (m3u8Match) {
        const streamUrl = m3u8Match[1];
        if (await this.verifyRealStream(streamUrl)) {
          return {
            url: streamUrl,
            type: 'hls',
            quality: 88
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error(`iframe解析失败: ${error.message}`);
      return null;
    }
  }

  // 新增方法：验证真实流
  async verifyRealStream(streamUrl) {
    try {
      const response = await axios.head(streamUrl, {
        headers: { 'User-Agent': this.config.userAgent },
        timeout: 3000
      });
      
      const contentType = response.headers['content-type'] || '';
      return contentType.includes('application/vnd.apple.mpegurl') || 
             contentType.includes('application/x-mpegURL') ||
             streamUrl.includes('.m3u8');
    } catch (error) {
      return false;
    }
  }

  // 基于popozhibo规律生成可能的信号源URL（智能验证版本）
  async generatePopozhiboSources(popozhiboId) {
    try {
      console.log(`🔍 深度解析播放器页面获取真实流...`);
      
      // 访问播放器页面
      const playerUrl = `http://play.jgdhds.com/play/gm.php?id=${popozhiboId}&id2=${popozhiboId}`;
      const response = await axios.get(playerUrl, {
        headers: {
          'User-Agent': this.config.userAgent,
          'Referer': 'http://www.popozhibo.xyz/'
        },
        timeout: 10000
      });
      
      const html = response.data;
      const realStreams = [];
      
      // 1. 查找iframe中的真实视频源
      const iframeMatches = html.match(/<iframe[^>]+src="([^"]+)"/g);
      if (iframeMatches) {
        for (const match of iframeMatches) {
          const iframeSrc = match.match(/src="([^"]+)"/)[1];
          const realStream = await this.extractStreamFromIframe(iframeSrc);
          if (realStream) realStreams.push(realStream);
        }
      }
      
      // 2. 查找JavaScript中的视频URL
      const jsMatches = html.match(/["']([^"']*\.m3u8[^"']*)["']/g);
      if (jsMatches) {
        for (const match of jsMatches) {
          const streamUrl = match.replace(/["']/g, '');
          if (await this.verifyRealStream(streamUrl)) {
            realStreams.push({
              url: streamUrl,
              type: 'hls',
              quality: 90
            });
          }
        }
      }
      
      // 3. 查找data属性中的流URL
      const dataMatches = html.match(/data-[a-zA-Z]*=["']([^"']*\.m3u8[^"']*)["']/g);
      if (dataMatches) {
        for (const match of dataMatches) {
          const streamUrl = match.match(/["']([^"']+)["']/)[1];
          if (await this.verifyRealStream(streamUrl)) {
            realStreams.push({
              url: streamUrl,
              type: 'hls',
              quality: 85
            });
          }
        }
      }
      
      // 4. 如果没有找到真实流，回退到原有方法
      if (realStreams.length === 0) {
        console.log(`⚠️ 未从HTML页面提取到真实流，使用规律生成方法...`);
        return await this.generatePopozhiboSourcesFallback(popozhiboId);
      }
      
      console.log(`✅ 从HTML页面提取到 ${realStreams.length} 个真实流`);
      return realStreams.map((stream, index) => ({
        id: popozhiboId * 10 + index + 1,
        name: `真实视频流${index + 1}`,
        url: stream.url,
        sourceType: 'real_stream',
        qualityScore: stream.quality,
        isActive: true
      }));
      
    } catch (error) {
      console.error(`❌ HTML页面解析失败: ${error.message}`);
      // 回退到原有方法
      return await this.generatePopozhiboSourcesFallback(popozhiboId);
    }
  }

  // 原有方法重命名：规律生成备用信号源
  async generatePopozhiboSourcesFallback(popozhiboId) {
    try {
      console.log(`🔍 基于规律为popozhibo ID ${popozhiboId} 生成并验证信号源...`);
      const sources = [];
      
      // 根据发现的规律，生成可能的信号源URL
      const possibleUrls = [
        `http://play.jgdhds.com/play/gm.php?id=${popozhiboId}&id2=${popozhiboId}`,
        `http://play.jgdhds.com/play/kbs.html?id=${popozhiboId}&id2=`,
        `http://play.jgdhds.com/play/pao.php?id=${popozhiboId}&id2=`,
        `http://play.jgdhds.com/play/wen.php?id=${popozhiboId}&id2=`,
        `http://play.jgdhds.com/play/wlive.php?id=${popozhiboId}&id2=`,
        `http://play.jgdhds.com/play/steam8001.html?id=${popozhiboId}`,
        `http://play.jgdhds.com/play/steam8002.html?id=${popozhiboId}`,
        `http://play.jgdhds.com/play/steam8003.html?id=${popozhiboId}`
      ];
      
      const sourceNames = [
        '国内线路1',
        '国内线路2', 
        '国内线路3',
        '国内线路4',
        '国内线路5',
        '国内线路6',
        '国内线路7',
        '国内线路8'
      ];
      
      // 并发验证URL可用性
      console.log(`🔍 开始验证 ${possibleUrls.length} 个可能的信号源URL...`);
      const validationPromises = possibleUrls.map(async (url, index) => {
        const isValid = await this.validateStreamUrl(url);
        return { url, index, isValid };
      });
      
      const validationResults = await Promise.all(validationPromises);
      
      // 只保留验证通过的URL
      validationResults.forEach(({ url, index, isValid }) => {
        if (isValid) {
          sources.push({
            id: popozhiboId * 10 + index + 1,
            name: sourceNames[index] || `国内线路${index + 1}`,
            url: url,
            sourceType: 'chinese_hd',
            qualityScore: 95 - index * 2,
            isActive: true
          });
          console.log(`✅ 验证通过: ${sourceNames[index]} -> ${url}`);
        } else {
          console.log(`❌ 验证失败: ${sourceNames[index]} -> ${url}`);
        }
      });
      
      console.log(`📡 为popozhibo ID ${popozhiboId} 生成了 ${sources.length} 个可用信号源`);
      return sources;
      
    } catch (error) {
      console.error(`❌ 生成popozhibo信号源失败: ${error.message}`);
      throw error;
    }
  }

  // 动态建立比赛ID与JRKAN页面ID的映射关系
  async buildDynamicMapping() {
    try {
      console.log(`🔍 开始构建动态映射关系...`);
      
      // 获取当前爬取的比赛列表
      const matches = await this.crawlPopozhiboMatches();
      
      // 建立映射关系 - 现在使用JRKAN的URL格式
      const mapping = {};
      matches.forEach(match => {
        // 从matchUrl中提取popozhibo页面ID，然后转换为JRKAN格式
        // 例如: /live/108819/play -> 108819 -> steam800511 (需要找到规律)
        const urlMatch = match.matchUrl.match(/\/live\/(\d+)\/play/);
        if (urlMatch) {
          const popozhiboId = urlMatch[1];
          // 根据观察，JRKAN的URL格式可能是 steam800511.html 这样的
          // 需要分析popozhibo ID与JRKAN ID的关系
          const jrkanId = this.convertToJrkanId(popozhiboId, match.matchId);
          mapping[match.matchId] = { popozhiboId, jrkanId };
          console.log(`🎯 建立映射: 比赛${match.matchId} -> popozhibo页面${popozhiboId} -> JRKAN页面${jrkanId} (${match.homeTeam} vs ${match.awayTeam})`);
        }
      });
      
      console.log(`✅ 动态映射构建完成，共 ${Object.keys(mapping).length} 个映射关系`);
      return mapping;
      
    } catch (error) {
      console.error(`❌ 构建动态映射失败: ${error.message}`);
      return {};
    }
  }

  // 将popozhibo ID转换为JRKAN ID
  convertToJrkanId(popozhiboId, matchId) {
    // 基于观察到的规律进行转换
    // steam800511.html 对应布伦特福德vs曼城 (比赛ID 200006)
    // 需要找到popozhibo ID与JRKAN ID的对应关系
    
    // 已知的映射关系
    const knownMappings = {
      200006: 'steam800511', // 布伦特福德vs曼城
      // 可以添加更多已知的映射关系
    };
    
    if (knownMappings[matchId]) {
      return knownMappings[matchId];
    }
    
    // 对于未知的比赛，使用matchId作为基础
    return `steam800${matchId.toString().slice(-3)}`;
  }

  // 从JRKAN播放页面抓取信号源
  async crawlJrkanStreamSources(jrkanId) {
    try {
      console.log(`🔍 开始从JRKAN播放页面抓取信号源: ${jrkanId}`);
      const url = `http://play.jgdhds.com/play/${jrkanId}.html`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.config.userAgent
        },
        timeout: this.config.timeout
      });

      const $ = cheerio.load(response.data);
      const sources = [];

      // 导入JRKANSignalCrawler
      const JRKANSignalCrawler = require('./JRKANSignalCrawler.js');
      const signalCrawler = new JRKANSignalCrawler();

      // 查找所有信号源链接 - 基于JRKAN的实际HTML结构
      const signalPromises = [];
      $('a[data-play]').each((i, element) => {
        const $link = $(element);
        const dataPlay = $link.attr('data-play');
        const text = $link.find('strong').text().trim();
        
        if (dataPlay && (text.includes('中文高清') || text.includes('高清直播') || text.includes('主播解说'))) {
          // 构建完整的URL
          let fullUrl = dataPlay;
          if (dataPlay.startsWith('/')) {
            fullUrl = `http://play.jgdhds.com${dataPlay}`;
          }
          
          // 提取信号源编号（支持阿拉伯数字和中文数字）
          const match = text.match(/(\d+)|[①②③④⑤⑥⑦⑧⑨⑩]/);
          let sourceNum = match ? match[0] : (i + 1).toString();
          
          // 将中文数字转换为阿拉伯数字
          const chineseToArabic = {
            '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
            '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10'
          };
          
          if (chineseToArabic[sourceNum]) {
            sourceNum = chineseToArabic[sourceNum];
          }
          
          // 🎯 关键修复：使用JRKANSignalCrawler提取m3u8流地址
          const signalPromise = (async () => {
            let m3u8Url = null;
            try {
              console.log(`🔍 提取${text}的m3u8流地址: ${fullUrl}`);
              const signalResult = await signalCrawler.crawlSignal(fullUrl);
              if (signalResult && signalResult.playUrl) {
                m3u8Url = signalResult.playUrl;
                console.log(`✅ 成功提取m3u8流地址: ${m3u8Url}`);
              } else {
                console.log(`⚠️ 未能提取到m3u8流地址，使用原始URL: ${fullUrl}`);
              }
            } catch (error) {
              console.error(`❌ 提取m3u8流地址失败: ${error.message}`);
            }
            
            // 计算质量分数
            let qualityScore = 95;
            if (text.includes('主播解说')) {
              qualityScore = 80;
            } else if (text.includes('中文高清')) {
              qualityScore = 90;
            } else if (text.includes('高清直播')) {
              qualityScore = 88;
            }
            qualityScore -= parseInt(sourceNum) * 2;
            
            // 🎯 关键修复：优先使用m3u8流地址，如果没有则使用原始URL
            const finalUrl = m3u8Url || fullUrl;
            const isM3u8Stream = !!m3u8Url;
            
            return {
              name: text,
              url: finalUrl,
              originalUrl: fullUrl, // 保留原始URL用于调试
              m3u8Url: m3u8Url, // 保存提取的m3u8流地址
              sourceType: text.includes('中文高清') ? 'chinese_hd' : 'hd_live',
              qualityScore: Math.max(qualityScore, 70),
              isActive: true,
              sourceNumber: sourceNum,
              jrkanPage: true, // 标记这是JRKAN页面
              isM3u8Stream: isM3u8Stream, // 标记是否为纯m3u8流
              streamType: isM3u8Stream ? 'm3u8' : 'html' // 标记流类型
            };
          })();
          
          signalPromises.push(signalPromise);
        }
      });
      
      // 等待所有信号源提取完成
      const signalResults = await Promise.all(signalPromises);
      sources.push(...signalResults);
      
      // 输出结果统计
      const m3u8Count = signalResults.filter(s => s.isM3u8Stream).length;
      const htmlCount = signalResults.filter(s => !s.isM3u8Stream).length;
      console.log(`📊 信号源提取统计: ${m3u8Count}个m3u8流, ${htmlCount}个HTML页面`);

      console.log(`📡 从JRKAN页面解析到 ${sources.length} 个信号源`);
      return sources;
      
    } catch (error) {
      console.error(`❌ 从JRKAN抓取信号源失败: ${error.message}`);
      throw error;
    }
  }

  // 从popozhibo播放页面抓取真实信号源
  async crawlPopozhiboRealSources(popozhiboId) {
    try {
      console.log(`🔍 开始从popozhibo播放页面抓取信号源: ${popozhiboId}`);
      const url = `http://www.popozhibo.xyz/live/${popozhiboId}/play`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.config.userAgent
        },
        timeout: this.config.timeout
      });

      const $ = cheerio.load(response.data);
      const sources = [];

      // 查找所有可能的信号源链接
      $('a').each((i, element) => {
        const $link = $(element);
        const href = $link.attr('href');
        const text = $link.text().trim();
        
        // 查找包含播放相关关键词的链接
        if (href && (href.includes('play.') || text.includes('线路') || text.includes('直播') || text.includes('播放'))) {
          // 如果是相对链接，转换为绝对链接
          let fullUrl = href;
          if (href.startsWith('/')) {
            fullUrl = `http://www.popozhibo.xyz${href}`;
          } else if (href.startsWith('http://play.')) {
            fullUrl = href;
          }
          
          sources.push({
            name: text || `信号源${i + 1}`,
            url: fullUrl,
            sourceType: 'chinese_hd',
            qualityScore: 90 + Math.floor(Math.random() * 10), // 90-99随机质量分数
            isActive: true
          });
          
          console.log(`✅ 找到信号源: ${text || '未命名'} -> ${fullUrl}`);
        }
      });

      console.log(`📡 从popozhibo页面解析到 ${sources.length} 个信号源`);
      
      // 检查找到的信号源是否都是第三方平台链接
      const thirdPartySources = sources.filter(source => 
        source.url.includes('88kanqiu.tw') || 
        source.url.includes('popozhibo.xyz/live') ||
        source.url.includes('cctv.com') ||
        source.url.includes('yangshipin.cn')
      );
      
      // 如果所有信号源都是第三方平台，使用规律生成更直接的信号源
      if (thirdPartySources.length === sources.length && sources.length > 0) {
        console.log(`⚠️ 所有信号源都是第三方平台链接，使用规律生成更直接的信号源...`);
        const patternSources = await this.generatePopozhiboSources(popozhiboId);
        // 将规律生成的信号源放在前面，第三方链接作为备用
        return [...patternSources, ...sources.slice(0, 2)]; // 保留前2个第三方链接作为备用
      }
      
      // 如果没有找到信号源，使用规律生成
      if (sources.length === 0) {
        console.log(`⚠️ 页面未找到信号源，使用规律生成...`);
        return await this.generatePopozhiboSources(popozhiboId);
      }
      
      return sources;
      
    } catch (error) {
      console.error(`❌ 从popozhibo抓取信号源失败: ${error.message}`);
      // 如果抓取失败，使用规律生成备用信号源
      console.log(`🔄 使用规律生成备用信号源...`);
      return await this.generatePopozhiboSources(popozhiboId);
    }
  }

  // 获取真实的比赛直播流
  async crawlRealMatchStreams(matchId) {
    try {
      console.log(`🎯 开始获取比赛 ${matchId} 的真实直播流...`);
      
      // 方案1：从JRS80获取真实直播流
      const jrs80Streams = await this.crawlJRS80RealStreams(matchId);
      if (jrs80Streams.length > 0) {
        return jrs80Streams;
      }
      
      // 方案2：从popozhibo获取真实直播流
      const popoStreams = await this.crawlPopozhiboRealStreams(matchId);
      if (popoStreams.length > 0) {
        return popoStreams;
      }
      
      // 方案3：从其他直播源获取真实流
      const otherStreams = await this.crawlOtherRealStreams(matchId);
      if (otherStreams.length > 0) {
        return otherStreams;
      }
      
      console.log(`❌ 无法获取比赛 ${matchId} 的真实直播流`);
      return [];
      
    } catch (error) {
      console.error(`❌ 获取真实直播流失败: ${error.message}`);
      return [];
    }
  }

  // 从JRS80获取真实直播流（云环境已禁用）
  async crawlJRS80RealStreams(matchId) {
    if (!this.isBrowserEnabled()) {
      console.warn('⚠️ 浏览器自动化功能已禁用（云环境不支持），跳过JRS80浏览器爬取');
      return [];
    }
    
    try {
      console.log(`🎯 从JRS80获取比赛 ${matchId} 的真实直播流...`);
      
      // 使用浏览器自动化访问真实的播放页面
      const browser = await puppeteer.launch({ 
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      
      // 监听网络请求，捕获真实的直播流URL
      const realStreams = [];
      page.on('response', response => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        // 捕获真实的直播流
        if (url.includes('.m3u8') && 
            (contentType.includes('application/vnd.apple.mpegurl') || 
             contentType.includes('application/x-mpegURL'))) {
          
          realStreams.push({
            url: url,
            type: 'hls',
            quality: 95,
            source: 'jrkan'
          });
          
          console.log(`✅ 捕获到真实直播流: ${url}`);
        }
      });
      
      // 访问真实的比赛播放页面
      const playerUrl = `http://play.jgdhds.com/play/steam${matchId}.html`;
      console.log(`🌐 访问播放页面: ${playerUrl}`);
      
      await page.goto(playerUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // 等待JavaScript执行和视频加载
      await page.waitForTimeout(10000);
      
      // 尝试触发视频播放
      try {
        await page.click('video, .play-btn, [data-play]');
        await page.waitForTimeout(5000);
      } catch (e) {
        console.log('自动播放触发失败，继续监听网络请求');
      }
      
      await browser.close();
      
      if (realStreams.length > 0) {
        console.log(`✅ 从JRS80获取到 ${realStreams.length} 个真实直播流`);
        return realStreams;
      }
      
      return [];
      
    } catch (error) {
      console.error(`❌ 从JRS80获取真实直播流失败: ${error.message}`);
      return [];
    }
  }

  // 从popozhibo获取真实直播流（云环境已禁用）
  async crawlPopozhiboRealStreams(matchId) {
    if (!this.isBrowserEnabled()) {
      console.warn('⚠️ 浏览器自动化功能已禁用（云环境不支持），跳过popozhibo浏览器爬取');
      return [];
    }
    
    try {
      console.log(`🎯 从popozhibo获取比赛 ${matchId} 的真实直播流...`);
      
      // 构建popozhibo播放页面URL
      const playerUrl = `http://www.popozhibo.xyz/live/${matchId}/play`;
      console.log(`🌐 访问popozhibo播放页面: ${playerUrl}`);
      
      const browser = await puppeteer.launch({ 
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      
      // 监听网络请求，捕获真实的直播流URL
      const realStreams = [];
      page.on('response', response => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        // 捕获真实的直播流
        if (url.includes('.m3u8') && 
            (contentType.includes('application/vnd.apple.mpegurl') || 
             contentType.includes('application/x-mpegURL'))) {
          
          realStreams.push({
            url: url,
            type: 'hls',
            quality: 90,
            source: 'popozhibo'
          });
          
          console.log(`✅ 捕获到真实直播流: ${url}`);
        }
      });
      
      await page.goto(playerUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // 等待JavaScript执行和视频加载
      await page.waitForTimeout(10000);
      
      // 尝试触发视频播放
      try {
        await page.click('video, .play-btn, [data-play]');
        await page.waitForTimeout(5000);
      } catch (e) {
        console.log('自动播放触发失败，继续监听网络请求');
      }
      
      await browser.close();
      
      if (realStreams.length > 0) {
        console.log(`✅ 从popozhibo获取到 ${realStreams.length} 个真实直播流`);
        return realStreams;
      }
      
      return [];
      
    } catch (error) {
      console.error(`❌ 从popozhibo获取真实直播流失败: ${error.message}`);
      return [];
    }
  }

  // 从其他直播源获取真实流（云环境已禁用）
  async crawlOtherRealStreams(matchId) {
    if (!this.isBrowserEnabled()) {
      console.warn('⚠️ 浏览器自动化功能已禁用（云环境不支持），跳过其他直播源浏览器爬取');
      return [];
    }
    
    try {
      console.log(`🎯 从其他直播源获取比赛 ${matchId} 的真实直播流...`);
      
      // 尝试多个常见的直播源
      const sources = [
        `http://play.jgdhds.com/play/gm.php?id=${matchId}&id2=${matchId}`,
        `http://play.jgdhds.com/play/kbs.html?id=${matchId}&id2=`,
        `http://play.jgdhds.com/play/pao.php?id=${matchId}&id2=`,
        `http://play.jgdhds.com/play/wen.php?id=${matchId}&id2=`,
        `http://play.jgdhds.com/play/wlive.php?id=${matchId}&id2=`
      ];
      
      const realStreams = [];
      
      for (const sourceUrl of sources) {
        try {
          console.log(`🔍 检查直播源: ${sourceUrl}`);
          
          const browser = await puppeteer.launch({ 
            headless: true,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          });
          const page = await browser.newPage();
          
          // 监听网络请求
          page.on('response', response => {
            const url = response.url();
            const contentType = response.headers()['content-type'] || '';
            
            // 捕获真实的直播流
            if (url.includes('.m3u8') && 
                (contentType.includes('application/vnd.apple.mpegurl') || 
                 contentType.includes('application/x-mpegURL'))) {
              
              realStreams.push({
                url: url,
                type: 'hls',
                quality: 85,
                source: 'other'
              });
              
              console.log(`✅ 捕获到真实直播流: ${url}`);
            }
          });
          
          await page.goto(sourceUrl, { 
            waitUntil: 'networkidle2',
            timeout: 15000 
          });
          
          // 等待JavaScript执行
          await page.waitForTimeout(5000);
          
          await browser.close();
          
          // 如果找到了直播流，就不需要继续检查其他源
          if (realStreams.length > 0) {
            break;
          }
          
        } catch (error) {
          console.log(`⚠️ 检查直播源失败: ${sourceUrl} - ${error.message}`);
          continue;
        }
      }
      
      if (realStreams.length > 0) {
        console.log(`✅ 从其他直播源获取到 ${realStreams.length} 个真实直播流`);
        return realStreams;
      }
      
      return [];
      
    } catch (error) {
      console.error(`❌ 从其他直播源获取真实直播流失败: ${error.message}`);
      return [];
    }
  }

  // 获取比赛信息
  async getMatchInfo(matchId) {
    try {
      // 简化版本：直接从爬虫获取，不使用缓存
      
      // 从popozhibo获取比赛信息
      const matches = await this.crawlPopozhiboMatches();
      const match = matches.find(m => m.matchId === matchId);
      
      if (match) {
        return match;
      }
      
      // 如果没找到，返回基本信息
      return {
        matchId: matchId,
        homeTeam: '未知主队',
        awayTeam: '未知客队',
        league: '未知联赛',
        matchTime: new Date(),
        status: 'upcoming',
        sourcePlatform: 'unknown',
        matchUrl: `http://www.popozhibo.xyz/live/${matchId}`
      };
      
    } catch (error) {
      console.error(`❌ 获取比赛信息失败: ${error.message}`);
      return null;
    }
  }

  // 爬取单个比赛的直播信号源
  async crawlMatchStreamSources(matchId, platform = 'jrkan') {
    console.log(`\n🎯 ========== 开始获取比赛 ${matchId} 的直播信号源 ==========`);

    try {
      const candidates = await this.buildChannelCandidates(matchId);

      if (!candidates.length) {
        console.warn(`⚠️ 比赛 ${matchId} 没有可用的频道候选，无法抓取信号源`);
        return [];
      }

      const results = [];
      const fallbackPages = [];

      for (const candidate of candidates) {
        const playPageUrl = this.composePlayPageUrl(candidate);
        if (!playPageUrl) {
          continue;
        }

        fallbackPages.push({ candidate, playPageUrl });

        try {
          await this.randomDelay();
          const signal = await this.signalCrawler.crawlSignal(playPageUrl);

          if (signal && signal.playUrl) {
            const normalizedStreamUrl = this.ensureAbsoluteUrl(signal.playUrl, playPageUrl);

            if (!results.some(item => item.url === normalizedStreamUrl)) {
              results.push({
                id: this.generateStreamId(matchId, results.length),
                name: candidate.channelName || signal.quality || `直播${results.length + 1}`,
                url: normalizedStreamUrl,
                sourceType: signal.type || 'hls',
                qualityScore: this.estimateQualityScore(candidate, signal),
                isActive: true,
                steamId: candidate.steamId,
                domain: candidate.domain || null,
                playPageUrl,
                source: candidate.source,
                lastVerifiedAt: new Date().toISOString()
              });
            }

            if (candidate.source === 'mapping-db' && candidate.steamId) {
              mappingDB.incrementSuccess(matchId, candidate.steamId).catch(() => {});
            }
          } else if (candidate.source === 'mapping-db' && candidate.steamId) {
            mappingDB.incrementFailure(matchId, candidate.steamId).catch(() => {});
          }
        } catch (error) {
          console.error(`❌ 抓取信号源失败 ${playPageUrl}:`, error.message);
          if (candidate.source === 'mapping-db' && candidate.steamId) {
            mappingDB.incrementFailure(matchId, candidate.steamId).catch(() => {});
          }
        }
      }

      if (results.length) {
        console.log(`✅ 比赛 ${matchId} 获取到 ${results.length} 条可用信号`);
        return results;
      }

      if (fallbackPages.length) {
        console.warn(`⚠️ 比赛 ${matchId} 未能提取到m3u8流，返回兜底播放页`);
        return fallbackPages.map((item, index) => ({
          id: this.generateStreamId(matchId, index, 'fallback'),
          name: item.candidate.channelName || `备用线路${index + 1}`,
          url: item.playPageUrl,
          sourceType: 'play_page',
          qualityScore: 60,
          isActive: false,
          steamId: item.candidate.steamId,
          domain: item.candidate.domain || null,
          source: item.candidate.source || 'fallback',
          playPageUrl: item.playPageUrl
        }));
      }

      console.warn(`⚠️ 比赛 ${matchId} 没有任何可返回的信号源`);
      return [];
    } catch (error) {
      console.error(`❌ 获取比赛 ${matchId} 信号源时出错:`, error.message);
      await this.logCrawlerActivity('signal', 'crawl_sources', 'error', error.message, { matchId, platform });
      return [];
    }
  }

  async buildChannelCandidates(matchId) {
    const cacheKey = String(matchId);
    if (this.channelCache.has(cacheKey)) {
      return this.channelCache.get(cacheKey);
    }

    const candidates = [];
    const seen = new Set();

    const pushCandidate = (candidate) => {
      if (!candidate || !candidate.steamId) return;
      const domainKey = candidate.domain || '';
      const key = `${candidate.steamId}|${domainKey}|${candidate.source || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(candidate);
    };

    // 1. 数据库映射
    try {
      const mappingRows = await mappingDB.getMapping(matchId);
      const rows = Array.isArray(mappingRows) ? mappingRows : (mappingRows ? [mappingRows] : []);

      rows.forEach(row => {
        pushCandidate({
          steamId: row.steam_id,
          domain: row.domain,
          channelName: row.channel_name,
          source: 'mapping-db',
          successCount: row.success_count || 0,
          failCount: row.fail_count || 0
        });
      });
    } catch (error) {
      console.warn(`⚠️ 查询数据库映射失败 ${matchId}: ${error.message}`);
    }

    // 2. 本地映射文件
    try {
      const mappedSteamId = await this.streamIdMapper.getMapping(String(matchId));
      if (mappedSteamId) {
        pushCandidate({
          steamId: mappedSteamId,
          domain: null,
          channelName: '高清直播',
          source: 'stream-id-mapper'
        });
      }
    } catch (error) {
      console.warn(`⚠️ StreamIdMapper 查询失败 ${matchId}: ${error.message}`);
    }

    // 3. 根据传入matchId做兜底猜测
    const matchIdStr = String(matchId);
    if (/^\d+$/.test(matchIdStr)) {
      pushCandidate({
        steamId: matchIdStr,
        domain: null,
        channelName: '默认线路',
        source: 'guess'
      });
    }

    // 根据成功率和来源排序
    const sorted = candidates.sort((a, b) => {
      if (a.source === 'mapping-db' && b.source !== 'mapping-db') return -1;
      if (a.source !== 'mapping-db' && b.source === 'mapping-db') return 1;
      return this.calculateSuccessRate(b) - this.calculateSuccessRate(a);
    });

    this.channelCache.set(cacheKey, sorted);
    return sorted;
  }

  composePlayPageUrl(candidate) {
    if (!candidate || !candidate.steamId) return null;

    const domain = this.ensureDomainHasProtocol(candidate.domain) || this.getFallbackDomain();
    if (!domain) return null;

    return `${domain.replace(/\/$/, '')}/play/steam${candidate.steamId}.html`;
  }

  getFallbackDomain() {
    const activeDomains = this.domainManager.getActiveDomains();
    if (activeDomains && activeDomains.length) {
      return this.ensureDomainHasProtocol(activeDomains[0].url);
    }
    return 'http://play.jgdhds.com';
  }

  ensureDomainHasProtocol(domain) {
    if (!domain) return null;
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      return domain;
    }
    return `http://${domain.replace(/^\/+/, '')}`;
  }

  ensureAbsoluteUrl(url, baseUrl) {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('//')) {
      return `http:${url}`;
    }
    if (!baseUrl) return url;
    try {
      const base = new URL(baseUrl);
      if (url.startsWith('/')) {
        return `${base.protocol}//${base.host}${url}`;
      }
      return `${base.protocol}//${base.host}/${url}`;
    } catch (error) {
      return url;
    }
  }

  generateStreamId(matchId, index, prefix = 'source') {
    const numericMatchId = Number(matchId);
    if (!Number.isNaN(numericMatchId) && Number.isFinite(numericMatchId)) {
      return numericMatchId * 10 + index + 1;
    }
    return `${matchId}-${prefix}-${index + 1}`;
  }

  estimateQualityScore(candidate, signal) {
    let score = 80;
    const name = (candidate.channelName || '').toLowerCase();
    const quality = (signal?.quality || '').toLowerCase();
    const playUrl = signal?.playUrl || '';

    if (name.includes('高清') || name.includes('hd') || quality.includes('高清')) {
      score += 10;
    }
    if (name.includes('②') || name.includes('2')) {
      score += 5;
    }
    if (quality.includes('标清') || quality.includes('sd')) {
      score -= 10;
    }
    if (playUrl.includes('auth_key')) {
      score += 3;
    }

    return Math.max(60, Math.min(100, score));
  }

  calculateSuccessRate(candidate) {
    const success = candidate.successCount || 0;
    const fail = candidate.failCount || 0;
    const total = success + fail;
    if (!total) {
      return candidate.source === 'mapping-db' ? 0.6 : 0.3;
    }
    return success / total;
  }

  // 爬取比赛详情信息（队伍名称、联赛等）
  async crawlMatchDetail(matchId) {
    try {
      const response = await axios.get(`http://www.popozhibo.xyz/live/${matchId}/play`, {
        headers: {
          'User-Agent': this.config.userAgent
        },
        timeout: this.config.timeout
      });

      const $ = cheerio.load(response.data);
      
      // 从页面标题解析比赛信息
      const pageTitle = $('title').text();
      let homeTeam = '', awayTeam = '', league = '';
      
      // 解析页面标题，例如："鹿岛鹿角 vs 大阪钢巴_足球综合直播"
      const titleMatch = pageTitle.match(/(.+?)\s+vs\s+(.+?)_(.+?)$/);
      if (titleMatch) {
        homeTeam = titleMatch[1].trim();
        awayTeam = titleMatch[2].trim();
        league = titleMatch[3].trim();
      }
      
      // 如果标题解析失败，尝试从页面内容解析
      if (!homeTeam || !awayTeam) {
        const teamElements = $('.team-name, .team, [class*="team"]');
        const teams = [];
        teamElements.each((i, el) => {
          const text = $(el).text().trim();
          if (text && text.length > 1 && text.length < 20 && !text.includes('vs') && !text.includes('VS')) {
            teams.push(text);
          }
        });
        
        if (teams.length >= 2) {
          homeTeam = teams[0];
          awayTeam = teams[1];
        }
      }
      
      // 解析联赛信息
      if (!league) {
        const leagueElements = $('[class*="league"], [class*="match"], .category');
        leagueElements.each((i, el) => {
          const text = $(el).text().trim();
          if (text && (text.includes('联') || text.includes('甲') || text.includes('超') || text.includes('NBA') || text.includes('CBA'))) {
            league = text;
            return false; // 找到就停止
          }
        });
      }
      
      return {
        homeTeam: homeTeam || '主队',
        awayTeam: awayTeam || '客队', 
        league: league || '未知联赛',
        matchTitle: pageTitle
      };

    } catch (error) {
      console.error(`❌ 爬取比赛 ${matchId} 详情失败:`, error.message);
      return {
        homeTeam: '主队',
        awayTeam: '客队',
        league: '未知联赛',
        matchTitle: ''
      };
    }
  }

  // 保存比赛到数据库
  async saveMatches(matches) {
    try {
      for (const match of matches) {
        const [existing] = await pool.execute(
          'SELECT id FROM matches WHERE match_id = ? AND source_platform = ?',
          [match.matchId, match.sourcePlatform]
        );

        if (existing.length > 0) {
          // 更新现有比赛
          await pool.execute(
            `UPDATE matches SET 
             home_team = ?, away_team = ?, league = ?, 
             match_time = ?, status = ?, match_url = ?, updated_at = NOW()
             WHERE match_id = ? AND source_platform = ?`,
            [match.homeTeam, match.awayTeam, match.league, 
             match.matchTime, match.status, match.matchUrl,
             match.matchId, match.sourcePlatform]
          );
        } else {
          // 插入新比赛
          await pool.execute(
            `INSERT INTO matches 
             (match_id, home_team, away_team, league, match_time, status, source_platform, match_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [match.matchId, match.homeTeam, match.awayTeam, match.league, 
             match.matchTime, match.status, match.sourcePlatform, match.matchUrl]
          );
        }
      }
      
      await this.logCrawlerActivity('database', 'save_matches', 'success', `保存了 ${matches.length} 场比赛`);
    } catch (error) {
      console.error('❌ 保存比赛数据失败:', error.message);
      await this.logCrawlerActivity('database', 'save_matches', 'error', error.message);
    }
  }

  // 保存信号源到数据库
  async saveStreamSources(matchId, sources) {
    try {
      // 获取数据库中的match_id
      const [matchRows] = await pool.execute(
        'SELECT id FROM matches WHERE match_id = ?',
        [matchId]
      );

      if (matchRows.length === 0) {
        console.log(`⚠️ 比赛 ${matchId} 不存在于数据库中`);
        return;
      }

      const dbMatchId = matchRows[0].id;

      // 删除旧的信号源
      await pool.execute('DELETE FROM live_sources WHERE match_id = ?', [dbMatchId]);

      // 插入新的信号源
      for (const source of sources) {
        await pool.execute(
          `INSERT INTO live_sources 
           (match_id, name, url, source_type, quality_score, is_active) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [dbMatchId, source.name, source.url, source.sourceType, source.qualityScore, true]
        );
      }

      console.log(`✅ 为比赛 ${matchId} 保存了 ${sources.length} 个信号源`);
    } catch (error) {
      console.error('❌ 保存信号源失败:', error.message);
      await this.logCrawlerActivity('database', 'save_sources', 'error', error.message, { matchId });
    }
  }

  // 解析比赛时间
  parseMatchTime(timeText) {
    try {
      if (!timeText || typeof timeText !== 'string') {
        return new Date();
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      
      // 尝试多种时间格式
      let match;
      
      // 格式1: MM-DD HH:MM (如: 10-05 15:30)
      match = timeText.match(/(\d{2})-(\d{2})\s+(\d{2}:\d{2})/);
      if (match) {
        const [, month, day, time] = match;
        const matchDate = new Date(currentYear, parseInt(month) - 1, parseInt(day));
        const [hours, minutes] = time.split(':').map(Number);
        matchDate.setHours(hours, minutes, 0, 0);
        
        // 如果解析出的时间已经过去超过2小时，说明是昨天的比赛，应该设为已结束
        const now = new Date();
        const timeDiff = now - matchDate;
        if (timeDiff > 2 * 60 * 60 * 1000) { // 超过2小时
          console.log(`⚠️ 检测到过期比赛时间: ${timeText} -> ${matchDate.toLocaleString()}`);
          return matchDate; // 返回原时间，让过滤逻辑处理
        }
        
        return matchDate;
      }
      
      // 格式2: HH:MM (如: 15:30) - 假设是今天
      match = timeText.match(/(\d{2}):(\d{2})/);
      if (match) {
        const [, hours, minutes] = match;
        const matchDate = new Date();
        matchDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        return matchDate;
      }
      
      // 格式3: YYYY-MM-DD HH:MM (如: 2025-10-05 15:30)
      match = timeText.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/);
      if (match) {
        const [, year, month, day, time] = match;
        const matchDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const [hours, minutes] = time.split(':').map(Number);
        matchDate.setHours(hours, minutes, 0, 0);
        return matchDate;
      }
      
      // 格式4: 今天 HH:MM (如: 今天 15:30)
      if (timeText.includes('今天')) {
        match = timeText.match(/今天\s+(\d{2}):(\d{2})/);
        if (match) {
          const [, hours, minutes] = match;
          const matchDate = new Date();
          matchDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          return matchDate;
        }
      }
      
      // 格式5: 明天 HH:MM (如: 明天 15:30)
      if (timeText.includes('明天')) {
        match = timeText.match(/明天\s+(\d{2}):(\d{2})/);
        if (match) {
          const [, hours, minutes] = match;
          const matchDate = new Date();
          matchDate.setDate(matchDate.getDate() + 1);
          matchDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
          return matchDate;
        }
      }
      
      console.log(`⚠️ 无法解析时间格式: "${timeText}"`);
      return new Date();
    } catch (error) {
      console.log(`❌ 时间解析错误: ${error.message}`);
      return new Date();
    }
  }

  // 计算比赛状态 - 按照您的推测逻辑
  calculateMatchStatus(matchTime) {
    const now = new Date();
    const matchStartTime = new Date(matchTime);
    
    // 计算时间差（分钟）
    const timeDiffMinutes = (now - matchStartTime) / (1000 * 60);
    
    // 2小时30分钟 = 150分钟
    const matchDurationMinutes = 150;
    
    if (timeDiffMinutes > matchDurationMinutes) {
      // 当前时间大于开赛时间2小时30分钟之后 - 比赛结束，应该隐藏或显示已结束
      return 'finished';
    } else if (timeDiffMinutes >= 0) {
      // 当前时间在开赛时间2小时30分钟以内 - 直播中
      return 'live';
    } else {
      // 当前时间在开赛时间以前 - 未开始
      return 'upcoming';
    }
  }

  // 解析比赛状态（保留原有方法作为备用）
  parseMatchStatus(statusText) {
    if (statusText.includes('直播中') || statusText.includes('live')) {
      return 'live';
    } else if (statusText.includes('已结束') || statusText.includes('finished')) {
      return 'finished';
    } else {
      return 'upcoming';
    }
  }

  // 计算信号源质量评分
  calculateQualityScore(name, url) {
    let score = 50; // 基础分
    
    // 根据名称判断质量
    if (name.includes('高清') || name.includes('HD')) score += 30;
    if (name.includes('超清') || name.includes('4K')) score += 40;
    if (name.includes('原画')) score += 50;
    
    // 根据URL判断稳定性
    if (url.includes('jgdhds.com')) score += 20;
    if (url.includes('88player.top')) score += 10;
    
    return Math.min(score, 100);
  }

  // 记录爬虫活动
  async logCrawlerActivity(platform, action, status, message, data = null) {
    try {
      await pool.execute(
        `INSERT INTO crawler_logs (platform, action, status, message, data) 
         VALUES (?, ?, ?, ?, ?)`,
        [platform, action, status, message, JSON.stringify(data)]
      );
    } catch (error) {
      console.error('记录爬虫日志失败:', error.message);
    }
  }

  // 启动定时爬取任务
  startScheduledCrawling() {
    console.log('🚀 启动定时爬取任务...');
    
    // 每5分钟爬取比赛列表
    cron.schedule('*/5 * * * *', async () => {
      if (this.isRunning) return;
      this.isRunning = true;
      
      try {
        const startTime = Date.now();
        console.log('📅 开始定时爬取任务...');
        
        const matches = await this.crawlPopozhiboMatches();
        console.log(`📊 增量爬取完成: 获取到 ${matches.length} 场比赛`);
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        // 记录监控统计
        const stats = this.getStats();
        const incrementalStats = this.incrementalState;
        console.log('📈 本次增量爬取统计:');
        console.log(`   ⏱️  耗时: ${duration.toFixed(2)}秒`);
        console.log(`   📊 本次比赛数量: ${matches.length}`);
        console.log(`   📈 抓取进度: ${incrementalStats.lastCrawledIndex}/${incrementalStats.totalMatches} (${incrementalStats.totalMatches > 0 ? ((incrementalStats.lastCrawledIndex / incrementalStats.totalMatches) * 100).toFixed(1) : '0'}%)`);
        console.log(`   🔄 批次大小: ${incrementalStats.batchSize}`);
        console.log(`   📈 成功率: ${stats.successRate}`);
        console.log(`   🔄 总请求数: ${stats.totalRequests}`);
        console.log(`   🎯 是否首次运行: ${incrementalStats.isFirstRun ? '是' : '否'}`);
        
      } catch (error) {
        console.error('❌ 定时爬取任务出错:', error.message);
        this.recordRequest(false);
      } finally {
        this.isRunning = false;
        console.log('✅ 定时爬取任务完成');
      }
    });

    console.log('✅ 定时爬取任务已启动');
  }

  // 验证Logo URL有效性
  async validateLogoUrl(logoUrl) {
    try {
      this.logoStats.totalLogos++;
      
      // 检查缓存
      if (this.logoStats.cachedLogos.has(logoUrl)) {
        const cached = this.logoStats.cachedLogos.get(logoUrl);
        if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) { // 24小时缓存
          return cached.isValid;
        }
      }
      
      // 如果是默认图片或空URL，直接返回false
      if (!logoUrl || logoUrl === '/static/img/default-img.png' || logoUrl.startsWith('/static/')) {
        this.logoStats.failedLogos++;
        this.logoStats.cachedLogos.set(logoUrl, { isValid: false, timestamp: Date.now() });
        return false;
      }
      
      // 验证URL格式
      try {
        new URL(logoUrl);
      } catch {
        this.logoStats.failedLogos++;
        this.logoStats.cachedLogos.set(logoUrl, { isValid: false, timestamp: Date.now() });
        return false;
      }
      
      // 检查图片可访问性
      const response = await axios.head(logoUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': this.getRandomUserAgent()
        }
      });
      
      const isValid = response.status === 200 && 
                     response.headers['content-type'] && 
                     response.headers['content-type'].startsWith('image/');
      
      // 更新统计
      if (isValid) {
        this.logoStats.validLogos++;
      } else {
        this.logoStats.failedLogos++;
      }
      
      // 缓存结果
      this.logoStats.cachedLogos.set(logoUrl, { isValid, timestamp: Date.now() });
      
      return isValid;
      
    } catch (error) {
      console.warn(`Logo验证失败: ${logoUrl} - ${error.message}`);
      this.logoStats.failedLogos++;
      this.logoStats.cachedLogos.set(logoUrl, { isValid: false, timestamp: Date.now() });
      return false;
    }
  }

  // 获取爬虫统计信息
  getCrawlerStats() {
    return {
      ...this.getStats(),
      cache: {
        hasMatches: !!this.cache.matches,
        matchesCount: this.cache.matches ? this.cache.matches.length : 0,
        lastUpdate: this.cache.lastUpdate ? new Date(this.cache.lastUpdate).toISOString() : null
      },
      config: {
        userAgentCount: this.config.userAgents.length,
        delayRange: `${this.config.minDelay}-${this.config.maxDelay}ms`,
        retryCount: this.config.retry,
        timeout: this.config.timeout
      },
      incremental: {
        lastCrawledIndex: this.incrementalState.lastCrawledIndex,
        totalMatches: this.incrementalState.totalMatches,
        batchSize: this.incrementalState.batchSize,
        isFirstRun: this.incrementalState.isFirstRun,
        lastBatchCount: this.incrementalState.lastBatchCount,
        progressPercent: this.incrementalState.totalMatches > 0 ? 
          ((this.incrementalState.lastCrawledIndex / this.incrementalState.totalMatches) * 100).toFixed(1) + '%' : '0%'
      },
      logo: {
        totalLogos: this.logoStats.totalLogos,
        validLogos: this.logoStats.validLogos,
        failedLogos: this.logoStats.failedLogos,
        successRate: this.logoStats.totalLogos > 0 ? 
          ((this.logoStats.validLogos / this.logoStats.totalLogos) * 100).toFixed(1) + '%' : '0%',
        cachedCount: this.logoStats.cachedLogos.size,
        lastValidationTime: this.logoStats.lastValidationTime ? 
          new Date(this.logoStats.lastValidationTime).toISOString() : null
      }
    };
  }

  // 停止爬虫
  async stop() {
    await this.closeBrowser();
    console.log('🛑 爬虫已停止');
  }
}

// JRS80数据解密器
class JRS80DataDecryptor {
  async fetchAndDecryptMatches() {
    try {
      console.log('🔍 开始从JRS80获取比赛数据...');
      
      // 1. 获取加密数据
      const response = await axios.get(
        'https://css-js-j.oss-accelerate.aliyuncs.com/tmp/event',
        {
          params: {
            type: 'zqlq',
            callback: 'cb_base_zqlq_0',
            _: Date.now()
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.jrs80.com/'
          },
          timeout: 10000
        }
      );
      
      // 2. 解析JSONP响应
      const jsonpData = this.parseJSONP(response.data);
      if (!jsonpData) {
        console.log('❌ JRS80 JSONP解析失败');
        return [];
      }
      
      // 3. 解密数据（需要分析加密算法）
      const decryptedData = await this.decryptData(jsonpData);
      
      // 4. 转换为标准比赛格式
      const matches = this.convertToMatches(decryptedData);
      console.log(`✅ 从JRS80获取到 ${matches.length} 场比赛`);
      return matches;
      
    } catch (error) {
      console.error('❌ JRS80数据获取失败:', error.message);
      return [];
    }
  }
  
  parseJSONP(jsonpString) {
    try {
      const match = jsonpString.match(/cb_base_zqlq_0\((.*)\);?$/);
      return match ? JSON.parse(match[1]) : null;
    } catch (error) {
      console.error('JSONP解析错误:', error.message);
      return null;
    }
  }
  
  async decryptData(encryptedData) {
    try {
      // 分析JRS80的解密算法
      // 这里需要根据实际情况实现解密逻辑
      if (typeof encryptedData === 'string') {
        // 如果是字符串，尝试base64解码
        try {
          return JSON.parse(Buffer.from(encryptedData, 'base64').toString());
        } catch (e) {
          return encryptedData;
        }
      }
      return encryptedData;
    } catch (error) {
      console.error('解密失败:', error.message);
      return encryptedData;
    }
  }
  
  convertToMatches(data) {
    const matches = [];
    
    if (data && Array.isArray(data)) {
      data.forEach((item, index) => {
        if (item && item.home && item.away) {
          matches.push({
            matchId: 300000 + index, // JRS80专用ID范围
            homeTeam: item.home,
            awayTeam: item.away,
            league: item.league || '未知联赛',
            matchTime: new Date(item.time || Date.now()),
            status: this.parseStatus(item.status),
            sourcePlatform: 'jrs80',
            matchUrl: `https://www.jrs80.com/?live=${item.id || index}`
          });
        }
      });
    }
    
    return matches;
  }
  
  parseStatus(status) {
    if (!status) return 'upcoming';
    const statusLower = status.toLowerCase();
    if (statusLower.includes('live') || statusLower.includes('直播')) return 'live';
    if (statusLower.includes('finished') || statusLower.includes('结束')) return 'finished';
    return 'upcoming';
  }
}

// popozhibo数据解析器
class PopozhiboDataParser {
  async parseMatches() {
    try {
      console.log('🔍 开始从popozhibo解析比赛数据...');
      
      const response = await axios.get('http://www.popozhibo.xyz/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      const matches = [];
      
      // 精确解析比赛列表
      $('li').each((index, element) => {
        const $li = $(element);
        const text = $li.text().trim();
        
        // 匹配比赛格式：时间\n联赛\n主队\nVS\n客队\n状态
        const matchPattern = /(\d{2}-\d{2}\s+\d{2}:\d{2})\s+([^\n]+)\s+([^\n]+)\s+VS\s+([^\n]+)\s+([^\n]+)/;
        const match = text.match(matchPattern);
        
        if (match) {
          const [, time, league, homeTeam, awayTeam, status] = match;
          
          matches.push({
            matchId: this.generateMatchId(homeTeam, awayTeam, time),
            homeTeam: homeTeam.trim(),
            awayTeam: awayTeam.trim(),
            league: league.trim(),
            matchTime: this.parseMatchTime(time),
            status: this.parseStatus(status),
            sourcePlatform: 'popozhibo',
            matchUrl: this.generateMatchUrl(homeTeam, awayTeam)
          });
        }
      });
      
      console.log(`✅ 从popozhibo解析到 ${matches.length} 场比赛`);
      return matches;
      
    } catch (error) {
      console.error('❌ popozhibo数据解析失败:', error.message);
      return [];
    }
  }
  
  generateMatchId(homeTeam, awayTeam, time) {
    const hash = crypto.createHash('md5').update(`${homeTeam}-${awayTeam}-${time}`).digest('hex');
    return parseInt(hash.substring(0, 8), 16) % 100000 + 200000;
  }
  
  parseTime(timeStr) {
    const now = new Date();
    const [monthDay, time] = timeStr.split(' ');
    const [month, day] = monthDay.split('-');
    const [hour, minute] = time.split(':');
    
    const matchTime = new Date(now.getFullYear(), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
    
    // 如果时间已经过去，假设是下个月
    if (matchTime < now) {
      matchTime.setMonth(matchTime.getMonth() + 1);
    }
    
    return matchTime;
  }
  
  parseStatus(status) {
    if (!status) return 'upcoming';
    const statusLower = status.toLowerCase();
    if (statusLower.includes('live') || statusLower.includes('直播')) return 'live';
    if (statusLower.includes('finished') || statusLower.includes('结束')) return 'finished';
    return 'upcoming';
  }
  
  generateMatchUrl(homeTeam, awayTeam) {
    const encodedMatch = encodeURIComponent(`${homeTeam} vs ${awayTeam}`);
    return `http://www.popozhibo.xyz/live/${encodedMatch}`;
  }
}

// 智能信号源获取器
class SmartStreamSourceFetcher {
  async getStreamSourcesForMatch(matchId, matchInfo) {
    try {
      console.log(`🎯 为比赛 ${matchId} 获取真实信号源...`);
      
      // 方案1：从JRS80获取
      const jrs80Sources = await this.getJRS80Sources(matchId, matchInfo);
      if (jrs80Sources.length > 0) {
        console.log(`✅ 从JRS80获取到 ${jrs80Sources.length} 个信号源`);
        return jrs80Sources;
      }
      
      // 方案2：从popozhibo获取
      const popoSources = await this.getPopozhiboSources(matchId, matchInfo);
      if (popoSources.length > 0) {
        console.log(`✅ 从popozhibo获取到 ${popoSources.length} 个信号源`);
        return popoSources;
      }
      
      // 方案3：使用浏览器自动化深度抓取
      const browserSources = await this.deepCrawlWithBrowser(matchId, matchInfo);
      if (browserSources.length > 0) {
        console.log(`✅ 通过浏览器自动化获取到 ${browserSources.length} 个信号源`);
        return browserSources;
      }
      
      console.log(`❌ 无法为比赛 ${matchId} 获取到任何信号源`);
      return [];
      
    } catch (error) {
      console.error(`❌ 获取信号源失败: ${error.message}`);
      return [];
    }
  }
  
  async getJRS80Sources(matchId, matchInfo) {
    const possibleUrls = [
      `http://play.jgdhds.com/play/steam${matchId}.html`,
      `http://play.jgdhds.com/play/gm.php?id=${matchId}&id2=${matchId}`,
      `http://play.jgdhds.com/play/kbs.html?id=${matchId}&id2=`
    ];
    
    const validSources = [];
    for (const url of possibleUrls) {
      if (await this.validateStreamUrl(url)) {
        validSources.push({
          name: `JRS80线路${validSources.length + 1}`,
          url: url,
          sourceType: 'jrkan_hd',
          qualityScore: 95 - validSources.length * 2,
          isActive: true
        });
      }
    }
    
    return validSources;
  }
  
  async getPopozhiboSources(matchId, matchInfo) {
    const possibleUrls = [
      `http://play.jgdhds.com/play/gm.php?id=${matchId}&id2=${matchId}`,
      `http://play.jgdhds.com/play/kbs.html?id=${matchId}&id2=`,
      `http://play.jgdhds.com/play/pao.php?id=${matchId}&id2=`,
      `http://play.jgdhds.com/play/wen.php?id=${matchId}&id2=`
    ];
    
    const validSources = [];
    for (const url of possibleUrls) {
      if (await this.validateStreamUrl(url)) {
        validSources.push({
          name: `popozhibo线路${validSources.length + 1}`,
          url: url,
          sourceType: 'popo_hd',
          qualityScore: 90 - validSources.length * 2,
          isActive: true
        });
      }
    }
    
    return validSources;
  }
  
  async deepCrawlWithBrowser(matchId, matchInfo) {
    if (!this.isBrowserEnabled()) {
      console.warn('⚠️ 浏览器自动化功能已禁用（云环境不支持），跳过深度浏览器爬取');
      return [];
    }
    
    try {
      console.log(`🔍 使用浏览器自动化深度抓取比赛 ${matchId} 的信号源...`);
      
      const browser = await puppeteer.launch({
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const streams = [];
      
      // 监听网络请求
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('live')) {
          const status = response.status();
          if (status >= 200 && status < 300) {
            console.log(`🎯 捕获到真实流URL: ${url}`);
            streams.push({
              name: `浏览器捕获流${streams.length + 1}`,
              url: url,
              sourceType: 'browser_captured',
              qualityScore: 98 - streams.length * 2,
              isActive: true
            });
          }
        }
      });
      
      // 访问比赛页面
      const matchUrl = matchInfo.matchUrl || `http://www.popozhibo.xyz/live/${matchId}`;
      console.log(`🌐 访问比赛页面: ${matchUrl}`);
      
      if (!matchUrl || matchUrl.includes('undefined') || matchUrl.includes('null')) {
        throw new Error(`无效的比赛URL: ${matchUrl}`);
      }
      
      await page.goto(matchUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      
      // 等待页面加载
      await page.waitForTimeout(3000);
      
      await browser.close();
      
      console.log(`✅ 浏览器自动化捕获到 ${streams.length} 个真实流`);
      return streams;
      
    } catch (error) {
      console.error('❌ 浏览器自动化失败:', error.message);
      return [];
    }
  }
  
  async validateStreamUrl(url) {
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      return response.status >= 200 && response.status < 400;
    } catch (error) {
      return false;
    }
  }
}

module.exports = StreamCrawler;
