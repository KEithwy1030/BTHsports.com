const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { decodeYumixiu } = require('../utils/yumixiuDecoder');

const ENTRY_DOMAINS = [
  'http://play.jgdhds.com',
  'http://play.sportsteam7777.com',
  'http://play.sportsteam368.com'
];

const lineStats = new Map();
const STAT_TTL = 6 * 60 * 60 * 1000; // 6小时

class JRKANSignalCrawler {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.timeout = 8000;
    this.entryDomains = [...ENTRY_DOMAINS];
    this.resetSession();
  }

  resetSession() {
    this.cookieStore = new Map();
  }

  storeCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    cookies.forEach(cookie => {
      if (!cookie) return;
      const [pair] = cookie.split(';');
      if (!pair) return;
      const [key, ...rest] = pair.split('=');
      if (!key) return;
      this.cookieStore.set(key.trim(), rest.join('=').trim());
    });
  }

  getCookieHeader() {
    if (!this.cookieStore || this.cookieStore.size === 0) {
      return '';
    }
    return Array.from(this.cookieStore.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  /**
   * 抓取比赛信号源
   * @param {string} streamUrl - JRKAN信号源页面URL，如 http://play.jgdhds.com/play/steam800705.html
   * @returns {Promise<Object>} 信号源信息
   */
  async resolveSignal(streamUrl, options = {}) {
    const startedAt = Date.now();
    const label = options.label || '';
    const initialReferer = options.referer || 'https://www.jrs80.com/';
    try {
      console.log(`🎬 开始抓取信号源: ${streamUrl}`);
      logger.info('crawlSignal 开始', { streamUrl, label });
      
      // 第1步：访问 steam{id}.html 页面
      const firstPageHtml = await this.fetchPage(streamUrl, initialReferer);

      // 部分页面直接包含 encodedStr，可直接解析
      const directPlayUrl = await this.extractM3u8Url(firstPageHtml, streamUrl);
      if (directPlayUrl) {
        const cleanedDirectPlayUrl = this.filterAdContent(directPlayUrl);
        if (cleanedDirectPlayUrl) {
          console.log(`✅ 首层页面直接提取播放地址: ${cleanedDirectPlayUrl}`);
          logger.info('crawlSignal 一层直接获取', { streamUrl, playUrl: cleanedDirectPlayUrl, label });
          logger.info('crawlSignal 耗时', {
            streamUrl,
            label,
            durationMs: Date.now() - startedAt,
            stage: 'direct'
          });
          return {
            sourceUrl: streamUrl,
            playUrl: cleanedDirectPlayUrl,
            cookies: this.getCookieHeader(),
            type: this.detectStreamType(cleanedDirectPlayUrl),
            quality: this.detectQuality(streamUrl),
            label,
            timestamp: Date.now()
          };
        }
      }
      
      // 第2步：提取 sm.html?id=xxx 链接
      const smUrl = this.extractIframeSrc(firstPageHtml, streamUrl);
      if (!smUrl) {
        console.log('❌ 未找到sm.html链接');
        logger.warn('crawlSignal 未找到 sm.html', { streamUrl, label });
        return null;
      }
      console.log(`📍 找到sm.html: ${smUrl}`);
      
      // 第3步：访问 sm.html 页面
      const secondPageHtml = await this.fetchPage(smUrl, streamUrl);
      let immediatePlayUrl = await this.extractM3u8Url(secondPageHtml, smUrl);
      if (immediatePlayUrl) {
        const cleanPlayUrl = this.filterAdContent(immediatePlayUrl);
        if (cleanPlayUrl) {
          console.log(`✅ 在第二层页面直接提取播放地址: ${cleanPlayUrl}`);
          logger.info('crawlSignal 二层直接获取', { streamUrl, playUrl: cleanPlayUrl, label });
          logger.info('crawlSignal 耗时', {
            streamUrl,
            label,
            durationMs: Date.now() - startedAt,
            stage: 'second-layer'
          });
          return {
            sourceUrl: streamUrl,
            playUrl: cleanPlayUrl,
            cookies: this.getCookieHeader(),
            type: this.detectStreamType(cleanPlayUrl),
            quality: this.detectQuality(streamUrl),
            label,
            timestamp: Date.now()
          };
        }
      }
      
      // 第4步：提取 {id}.html 链接
      const idUrl = this.extractIframeSrc(secondPageHtml, smUrl);
      if (!idUrl) {
        console.log('❌ 未找到id.html链接');
        logger.warn('crawlSignal 未找到 id.html', { streamUrl, smUrl, label });
        return null;
      }
      
      // 验证提取的URL是否完整
      if (!idUrl.includes('.html') && !idUrl.includes('msss.html')) {
        console.warn(`⚠️ 提取的URL可能不完整: ${idUrl}，尝试从sm.html的id参数构造`);
        // 尝试从sm.html的URL中提取id参数
        try {
          const smUrlObj = new URL(smUrl);
          const idParam = smUrlObj.searchParams.get('id');
          if (idParam) {
            const baseUrlObj = new URL(smUrl);
            const constructedIdUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}/play/${idParam}.html`;
            console.log(`🔧 构造id.html URL: ${constructedIdUrl}`);
            const idUrlToUse = constructedIdUrl;
            console.log(`📍 使用构造的id.html: ${idUrlToUse}`);
            
            // 第5步：访问构造的 {id}.html 页面
            const thirdPageHtml = await this.fetchPage(idUrlToUse, smUrl);
            
            // 第5.5步：提取第三层页面的iframe src（包含m3u8信息）
            const thirdIframeSrc = this.extractIframeSrc(thirdPageHtml, idUrlToUse);
            if (!thirdIframeSrc) {
              console.log('❌ 未找到第三层iframe src');
              logger.warn('crawlSignal 未找到第三层 iframe', { streamUrl, idUrl: idUrlToUse });
              return null;
            }
            console.log(`📍 找到第三层iframe src: ${thirdIframeSrc}`);

            let finalPageHtml = thirdPageHtml;

            if (thirdIframeSrc && thirdIframeSrc.includes('.html')) {
              try {
                finalPageHtml = await this.fetchPage(thirdIframeSrc, idUrlToUse);
              } catch (iframeError) {
                console.warn('⚠️ 第三层iframe请求失败:', iframeError.message);
                logger.warn('crawlSignal 第三层 iframe 请求失败', {
                  streamUrl,
                  iframe: thirdIframeSrc,
                  message: iframeError.message,
                  label
                });
              }
            }
            
            // 第6步：提取最终的m3u8播放地址
            let extractionBaseUrl = thirdIframeSrc;
            if (!extractionBaseUrl || (!extractionBaseUrl.includes('.m3u8') && !extractionBaseUrl.includes('msss.html'))) {
              extractionBaseUrl = idUrlToUse || extractionBaseUrl || streamUrl;
            }

            const playUrl = await this.extractM3u8Url(finalPageHtml, extractionBaseUrl);
            if (!playUrl) {
              console.log('❌ 未找到m3u8播放地址');
              logger.warn('crawlSignal 未找到 m3u8', { streamUrl, thirdIframeSrc, label });
              return null;
            }
            
            // 第7步：过滤广告内容，确保是纯净的视频流
            const cleanPlayUrl = this.filterAdContent(playUrl);
            if (!cleanPlayUrl) {
              console.log('❌ 过滤后未找到有效播放地址');
              logger.warn('crawlSignal 过滤后无有效播放地址', { streamUrl, playUrl, label });
              return null;
            }
              
            console.log(`✅ 成功提取播放地址: ${cleanPlayUrl}`);
            logger.info('crawlSignal 成功', { streamUrl, playUrl: cleanPlayUrl, label });
            logger.info('crawlSignal 耗时', {
              streamUrl,
              label,
              durationMs: Date.now() - startedAt,
              stage: 'final'
            });
            
            return {
              sourceUrl: streamUrl,
              playUrl: cleanPlayUrl,
              cookies: this.getCookieHeader(),
              type: this.detectStreamType(cleanPlayUrl),
              quality: this.detectQuality(streamUrl),
              label,
              timestamp: Date.now()
            };
          }
        } catch (constructError) {
          console.warn(`⚠️ 构造id.html URL失败: ${constructError.message}`);
        }
      }
      
      console.log(`📍 找到id.html: ${idUrl}`);
      
      // 第5步：访问 {id}.html 页面
      const thirdPageHtml = await this.fetchPage(idUrl, smUrl);
      
      // 第5.5步：提取第三层页面的iframe src（包含m3u8信息）
      const thirdIframeSrc = this.extractIframeSrc(thirdPageHtml, idUrl);
      if (!thirdIframeSrc) {
        console.log('❌ 未找到第三层iframe src');
        logger.warn('crawlSignal 未找到第三层 iframe', { streamUrl, idUrl });
        return null;
      }
      console.log(`📍 找到第三层iframe src: ${thirdIframeSrc}`);

      let finalPageHtml = thirdPageHtml;

      if (thirdIframeSrc && thirdIframeSrc.includes('.html')) {
        try {
          finalPageHtml = await this.fetchPage(thirdIframeSrc, idUrl);
        } catch (iframeError) {
          console.warn('⚠️ 第三层iframe请求失败:', iframeError.message);
        logger.warn('crawlSignal 第三层 iframe 请求失败', {
          streamUrl,
          iframe: thirdIframeSrc,
          message: iframeError.message,
          label
        });
        }
      }
      
    // 第6步：提取最终的m3u8播放地址
    let extractionBaseUrl = thirdIframeSrc;
    if (!extractionBaseUrl || (!extractionBaseUrl.includes('.m3u8') && !extractionBaseUrl.includes('msss.html'))) {
      extractionBaseUrl = idUrl || extractionBaseUrl || streamUrl;
    }

    const playUrl = await this.extractM3u8Url(finalPageHtml, extractionBaseUrl);
    if (!playUrl) {
      console.log('❌ 未找到m3u8播放地址');
      logger.warn('crawlSignal 未找到 m3u8', { streamUrl, thirdIframeSrc, label });
      return null;
    }
    
    // 第7步：过滤广告内容，确保是纯净的视频流
    const cleanPlayUrl = this.filterAdContent(playUrl);
    if (!cleanPlayUrl) {
      console.log('❌ 过滤后未找到有效播放地址');
      logger.warn('crawlSignal 过滤后无有效播放地址', { streamUrl, playUrl, label });
      return null;
    }
      
      console.log(`✅ 成功提取播放地址: ${cleanPlayUrl}`);
      logger.info('crawlSignal 成功', { streamUrl, playUrl: cleanPlayUrl, label });
      logger.info('crawlSignal 耗时', {
        streamUrl,
        label,
        durationMs: Date.now() - startedAt,
        stage: 'final'
      });
      
      return {
        sourceUrl: streamUrl,
        playUrl: cleanPlayUrl,
        cookies: this.getCookieHeader(),
        type: this.detectStreamType(cleanPlayUrl),
        quality: this.detectQuality(streamUrl),
        label,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error(`❌ 抓取信号源失败: ${streamUrl}`, error.message);
      logger.error('crawlSignal 异常', { streamUrl, message: error.message, label });
      logger.info('crawlSignal 耗时', {
        streamUrl,
        label,
        durationMs: Date.now() - startedAt,
        success: false,
        error: error.message
      });
      return null;
    }
  }

  async crawlSignal(streamUrl) {
    try {
      this.resetSession();
      return await this.resolveSignal(streamUrl);
    } catch (error) {
      console.error(`❌ 抓取信号源失败: ${streamUrl}`, error.message);
      logger.error('crawlSignal 异常', { streamUrl, message: error.message });
      return null;
    }
  }

  async crawlAllSignals(streamUrl) {
    try {
      console.log(`🎬 开始抓取所有信号源: ${streamUrl}`);
      const results = [];
      const visited = new Set();
      const uniqueStreams = new Map();
      const labelUsage = new Map();

      this.resetSession();

      const entryUrls = this.generateEntryUrls(streamUrl);
      const aggregatedButtons = [];
      const buttonUrlSet = new Set();

      const ensureButton = (button) => {
        if (!button || !button.url) return;
        if (buttonUrlSet.has(button.url)) return;
        buttonUrlSet.add(button.url);
        aggregatedButtons.push(button);
      };

      for (const entryUrl of entryUrls) {
        try {
          console.log(`🌐 [JRKAN] 入口检测: ${entryUrl}`);
          const html = await this.fetchPage(entryUrl);
          const buttons = this.extractChannelButtons(html, entryUrl);
          if (!buttons.length) {
            console.warn(`⚠️ 入口 ${entryUrl} 未检测到频道按钮`);
          }
          buttons.forEach(button => ensureButton(button));
          if (!buttons.some(btn => btn.url === entryUrl)) {
            ensureButton({
              label: this.getEntryFallbackLabel(entryUrl, aggregatedButtons.length),
              url: entryUrl
            });
          }
        } catch (error) {
          console.warn(`⚠️ 入口 ${entryUrl} 加载失败: ${error.message}`);
          ensureButton({
            label: this.getEntryFallbackLabel(entryUrl, aggregatedButtons.length),
            url: entryUrl
          });
        }
      }

      const normalizedButtons = aggregatedButtons.length > 0
        ? aggregatedButtons
        : [{ label: '线路1', url: streamUrl }];

      const rawCandidates = normalizedButtons
        .map((item, index) => ({
          ...item,
          index,
          score: this.getLineScore(item.url)
        }));

      const candidateQueue = rawCandidates.sort((a, b) => b.score - a.score);

      const MAX_CONCURRENCY = Math.max(1, Number(process.env.SIGNAL_CONCURRENCY || 2));
      const workerCount = Math.min(MAX_CONCURRENCY, candidateQueue.length);

      const runWorker = async () => {
        while (true) {
          let candidate = null;

          while (candidateQueue.length > 0 && !candidate) {
            const nextCandidate = candidateQueue.shift();
            if (!nextCandidate?.url || visited.has(nextCandidate.url)) {
              continue;
            }
            visited.add(nextCandidate.url);
            candidate = nextCandidate;
          }

          if (!candidate) {
            break;
          }

          // 注意：过滤"主播解说"已在 extractChannelButtons 中完成，这里不需要再次过滤

          const scopedCrawler = new JRKANSignalCrawler();
          scopedCrawler.timeout = this.timeout;
          scopedCrawler.userAgent = this.userAgent;

          const result = await scopedCrawler.resolveSignal(candidate.url, {
            label: candidate.label,
            referer: streamUrl
          });

          if (result && result.playUrl) {
            
            this.recordLineResult(candidate.url, true);
            const normalizedKey = this.normalizeStreamKey(result.playUrl);
            
            // 🎯 增强去重：检查是否已经存在相同的URL（去除参数后比较）
            const urlForComparison = this.getStreamUrlForComparison(result.playUrl);
            const isDuplicateUrl = results.some(existing => {
              const existingUrl = this.getStreamUrlForComparison(existing.playUrl);
              return existingUrl === urlForComparison;
            });
            
            if (isDuplicateUrl) {
              console.log(`🔁 忽略重复信号源 (URL相同): ${result.playUrl.substring(0, 80)}...`);
              continue;
            }
            
            if (!uniqueStreams.has(normalizedKey)) {
              uniqueStreams.set(normalizedKey, true);
              
              // 🚫 额外检查：如果多个"云直播"或"线路"名称指向相同URL，可能是重复的"主播解说"线路
              const isPossibleCommentator = this.isPossibleCommentatorStream(candidate.label, result.playUrl, results);
              if (isPossibleCommentator) {
                console.log(`🚫 疑似"主播解说"线路(通过URL相似性检测): ${candidate.label} - ${result.playUrl.substring(0, 80)}...`);
                continue;
              }
              
              const baseLabel = (candidate.label || result.label || `线路${candidate.index + 1}`).trim();
              const labelCount = labelUsage.get(baseLabel) || 0;
              labelUsage.set(baseLabel, labelCount + 1);
              const finalLabel = labelCount === 0 ? baseLabel : `${baseLabel}-${labelCount + 1}`;

              results.push({
                ...result,
                label: finalLabel,
                __candidateIndex: candidate.index
              });
            } else {
              console.log(`🔁 忽略重复信号源: ${result.playUrl}`);
            }
          } else {
            this.recordLineResult(candidate.url, false);
            logger.warn('crawlSignal 信号抓取失败', { streamUrl: candidate.url, label: candidate.label });
          }
        }
      };

      const workers = [];
      for (let i = 0; i < workerCount; i++) {
        workers.push(runWorker());
      }
      await Promise.all(workers);

      // 按原始线路顺序输出结果
      results.sort((a, b) => (a.__candidateIndex ?? 0) - (b.__candidateIndex ?? 0));
      results.forEach(item => delete item.__candidateIndex);

      if (results.length === 0) {
        console.warn('⚠️ 未抓取到任何信号源');
      }

      return results;
    } catch (error) {
      console.error(`❌ 抓取所有信号源失败: ${streamUrl}`, error.message);
      logger.error('crawlSignal allSignals 异常', { streamUrl, message: error.message });
      return [];
    }
  }

  getLineScore(url) {
    if (!url) return 0;
    const key = this.getLineKey(url);
    if (!key) return 0;
    const stat = lineStats.get(key);
    if (!stat) return 0;
    if (Date.now() - stat.updatedAt > STAT_TTL) {
      lineStats.delete(key);
      return 0;
    }
    const success = stat.success || 0;
    const fail = stat.fail || 0;
    const total = success + fail;
    if (total === 0) return 0;
    return success / total;
  }

  recordLineResult(url, isSuccess) {
    if (!url) return;
    const key = this.getLineKey(url);
    if (!key) return;
    const stat = lineStats.get(key) || { success: 0, fail: 0, updatedAt: Date.now() };
    if (isSuccess) {
      stat.success += 1;
    } else {
      stat.fail += 1;
    }
    stat.updatedAt = Date.now();
    lineStats.set(key, stat);
    logger.info('lineStats 更新', { key, success: stat.success, fail: stat.fail });
  }

  getLineKey(url) {
    try {
      const parsed = new URL(url);
      return parsed.host;
    } catch (error) {
      return null;
    }
  }

  /**
   * 获取页面HTML
   */
  async fetchPage(url, referer = 'https://www.jrs80.com/') {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': referer,
          'Connection': 'keep-alive',
          'Accept-Encoding': 'gzip, deflate',
          'Upgrade-Insecure-Requests': '1',
          ...(this.getCookieHeader() ? { 'Cookie': this.getCookieHeader() } : {})
        },
        timeout: this.timeout,
        maxRedirects: 10,
        validateStatus: function (status) {
          return status < 500; // 允许4xx状态码，但会抛出错误
        }
      });
      
      if (response.status === 403) {
        console.warn(`⚠️ 403错误，可能被反爬虫拦截: ${url}`);
        throw new Error(`Request failed with status code 403 - 可能被反爬虫拦截`);
      }
      
      this.storeCookies(response.headers['set-cookie']);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.error(`❌ 403错误: ${url} - 可能被反爬虫拦截`);
        throw new Error(`Request failed with status code 403 - 可能被反爬虫拦截`);
      }
      throw error;
    }
  }

  /**
   * 提取iframe的src属性
   */
  extractIframeSrc(html, baseUrl) {
    const $ = cheerio.load(html);
    const iframe = $('iframe').first();
    
    if (iframe.length > 0) {
      let src = iframe.attr('src');
      if (src) {
        return this.normalizeUrl(src, baseUrl);
      }
    }

    // 匹配字符串中的 iframe 标签
    const rawIframeMatch = html.match(/<iframe[^>]+src=['"]([^'"]+)['"]/i);
    if (rawIframeMatch) {
      return this.normalizeUrl(rawIframeMatch[1], baseUrl);
    }

    // 优先匹配脚本字符串中包含 /play/ 的 iframe 设置
    const inlinePlayMatch = html.match(/src\s*=\s*['"]([^"'\\n]*\/play\/[^"'\\s]*)['"]/i);
    if (inlinePlayMatch) {
      return this.normalizeUrl(inlinePlayMatch[1], baseUrl);
    }
    
    // 如果是sm.html页面，从JavaScript中提取id参数
    if (baseUrl.includes('sm.html')) {
      const urlObj = new URL(baseUrl);
      const id = urlObj.searchParams.get('id');
      if (id) {
        const baseUrlObj = new URL(baseUrl);
        return `${baseUrlObj.protocol}//${baseUrlObj.host}/play/${id}.html`;
      }
    }
    
    // 从JavaScript代码中提取动态生成的iframe
    const jsIframeMatch = html.match(/src\s*=\s*['"]([^'"]*)['"]/i);
    if (jsIframeMatch) {
      const candidateSrc = jsIframeMatch[1];
      if (candidateSrc && (candidateSrc.includes('/play/') || candidateSrc.includes('.html'))) {
        return this.normalizeUrl(candidateSrc, baseUrl);
      }
    }
    
    return null;
  }

  extractChannelButtons(html, baseUrl) {
    const $ = cheerio.load(html);
    const buttons = [];
    const seen = new Set();

    // 扩展选择器，匹配更多可能的按钮位置
    const candidateSelectors = [
      '.sub_channel a',
      'a.item',
      '.channel-list a',
      '.line-list a',
      '.channel-item a',
      '.stream-item a',
      '.play-btn',
      '.btn-play',
      'a[href*="steam"]',
      'a[href*="/play/"]',
      'button[data-play]',
      'a[data-play]',
      'div.channel a',
      'ul li a',
      '.channel-btn',
      '.line-btn'
    ];

    const isExcluded = (text) => {
      if (!text) return false;
      const normalized = text.toLowerCase();
      if (normalized.includes('主播') || normalized.includes('解说') || normalized.includes('commentator') || normalized.includes('host')) {
        return true;
      }
      if ((normalized.includes('主播') || normalized.includes('解说')) && /[①②③④⑤⑥⑦⑧⑨⑩1-9]/.test(text)) {
        return true;
      }
      return false;
    };

    candidateSelectors.forEach(selector => {
      try {
        $(selector).each((index, element) => {
          const $el = $(element);
          let playPath = $el.attr('data-play') || $el.attr('href') || $el.attr('data-url');
          if (!playPath || playPath.startsWith('javascript') || playPath === '#') {
            return;
          }

          const url = this.normalizeUrl(playPath, baseUrl);
          if (!url || seen.has(url)) {
            return;
          }

          const rawText = ($el.text() || '').replace(/\s+/g, ' ').trim();
          const labelCandidates = [
            $el.attr('data-group'),
            $el.attr('data-label'),
            $el.attr('title'),
            rawText,
            $el.find('span').text(),
            $el.find('strong').text()
          ].filter(Boolean).map(text => text.replace(/\s+/g, ' ').trim());

          let label = labelCandidates.find(Boolean) || '';

          if (isExcluded(label) || isExcluded(rawText)) {
            console.log(`🚫 过滤掉"主播解说"信号 (label/text): ${label || rawText}`);
            return;
          }

          if (isExcluded(url)) {
            console.log(`🚫 过滤掉"主播解说"信号 (URL): ${url}`);
            return;
          }

          if (!label && rawText) {
            label = rawText;
          }
          if (!label) {
            label = `线路${buttons.length + 1}`;
          }

          seen.add(url);
          buttons.push({
            label,
            url
          });
        });
      } catch (e) {
        // 忽略selector错误，继续处理其他selector
        console.warn(`⚠️ 处理selector ${selector} 时出错:`, e.message);
      }
    });

    console.log(`📋 提取到 ${buttons.length} 个频道按钮 (已过滤"主播解说")`);
    return buttons;
  }

  getEntryFallbackLabel(entryUrl, index) {
    try {
      const urlObj = new URL(entryUrl);
      if (urlObj.hostname.includes('sportsteam7777')) {
        return '云直播④';
      }
      if (urlObj.hostname.includes('sportsteam368')) {
        return '云直播①';
      }
      if (urlObj.hostname.includes('jgdhds')) {
        return '云直播②';
      }
    } catch (error) {
      // ignore
    }
    return `线路${index + 1}`;
  }

  generateEntryUrls(streamUrl) {
    const urls = [];
    const seen = new Set();
    const pushUrl = (url) => {
      if (!url) return;
      if (seen.has(url)) return;
      seen.add(url);
      urls.push(url);
    };

    if (streamUrl) {
      pushUrl(streamUrl);
    }

    const steamId = this.extractSteamId(streamUrl);
    this.entryDomains.forEach(domain => {
      const replaced = this.replaceDomain(streamUrl, domain, steamId);
      pushUrl(replaced);
    });

    return urls;
  }

  extractSteamId(streamUrl) {
    if (!streamUrl) return null;
    const match = streamUrl.match(/steam(\d+)/);
    return match ? match[1] : null;
  }

  replaceDomain(streamUrl, domain, steamId = null) {
    if (!domain) {
      return streamUrl;
    }
    const trimmedDomain = domain.replace(/\/$/, '');
    if (!streamUrl) {
      return steamId ? `${trimmedDomain}/play/steam${steamId}.html` : `${trimmedDomain}/`;
    }
    try {
      const sourceUrl = new URL(streamUrl);
      const domainUrl = new URL(trimmedDomain);
      sourceUrl.protocol = domainUrl.protocol;
      sourceUrl.host = domainUrl.host;
      return sourceUrl.toString();
    } catch (error) {
      if (steamId) {
        return `${trimmedDomain}/play/steam${steamId}.html`;
      }
      return `${trimmedDomain}/`;
    }
  }

  /**
   * 过滤广告内容，确保获取纯净的视频流
   */
  filterAdContent(playUrl) {
    console.log('🛡️ 过滤广告内容...');

    // 先判断是否是明确的流地址
    const isStreamUrl = ['.m3u8', '.mp4', '.flv'].some(ext => playUrl.toLowerCase().includes(ext));
    if (isStreamUrl) {
      console.log('✅ 检测到可直接播放的流地址');
      return playUrl;
    }

    // html 页面需要继续解析
    if (playUrl.toLowerCase().includes('.html')) {
      console.log('🔍 检测到HTML页面，需要进一步解析');
      return null;
    }

    // 检查是否是广告相关的URL（仅当不是直接流时再过滤）
    const adKeywords = ['ad', 'banner', 'popup', 'jrs945', 'jrs04', 'jrs0'];
    const lowerUrl = playUrl.toLowerCase();

    for (let keyword of adKeywords) {
      if (lowerUrl.includes(keyword)) {
        console.log(`❌ 检测到广告URL关键词: ${keyword}`);
        return null;
      }
    }

    // 检查是否是iframe嵌套URL（需要进一步解析）
    if (playUrl.includes('html') && !playUrl.includes('.m3u8')) {
      console.log('🔍 检测到HTML页面，需要进一步解析');
      return playUrl; // 返回供进一步处理
    }

    console.log('❌ 无法确认URL类型');
    return null;
  }

  /**
   * 验证m3u8流地址是否有效
   */
  async validateM3u8Url(url) {
    try {
      const axios = require('axios');
      const response = await axios.head(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'http://play.jgdhds.com/'
        }
      });
      
      if (response.status === 200) {
        console.log(`✅ m3u8流地址有效: ${url}`);
        return true;
      } else {
        console.log(`❌ m3u8流地址无效，状态码: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.log(`❌ m3u8流地址验证失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 尝试多个可能的m3u8流地址格式
   */
  async tryMultipleM3u8Formats(id) {
    const baseUrl = 'http://cloud.yumixiu768.com';
    const possibleFormats = [
      `/live/${id}.m3u8`,
      `/live/stream${id}.m3u8`,
      `/live/${id}_stream.m3u8`,
      `/live/live${id}.m3u8`,
      `/live/hd${id}.m3u8`,
      `/stream/${id}.m3u8`,
      `/streams/${id}.m3u8`
    ];
    
    for (let path of possibleFormats) {
      const url = baseUrl + path;
      console.log(`🔍 尝试验证m3u8格式: ${url}`);
      
      const isValid = await this.validateM3u8Url(url);
      if (isValid) {
        console.log(`✅ 找到有效的m3u8流地址: ${url}`);
        return url;
      }
    }
    
    console.log(`❌ 所有m3u8格式都无效`);
    return null;
  }

  /**
   * 标准化URL
   */
  normalizeUrl(url, baseUrl) {
    if (url.startsWith('//')) {
      return 'http:' + url;
    } else if (url.startsWith('/')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.protocol}//${baseUrlObj.host}${url}`;
    } else if (!url.startsWith('http')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.protocol}//${baseUrlObj.host}/${url}`;
    }
    return url;
  }

  /**
   * 提取用于比较的URL（去除参数，只保留基础路径）
   */
  getStreamUrlForComparison(playUrl = '') {
    if (!playUrl) return '';
    try {
      const url = new URL(playUrl);
      // 只保留协议、主机和路径，去除查询参数和哈希
      return `${url.protocol}//${url.host}${url.pathname}`;
    } catch (error) {
      // 如果不是完整URL，尝试提取基础路径
      const match = playUrl.match(/^(https?:\/\/[^\/]+(?:\/[^?#]*)?)/);
      return match ? match[1] : playUrl.split('?')[0].split('#')[0];
    }
  }
  
  /**
   * 判断是否可能是"主播解说"线路
   * 通过检查：1) URL相似性 2) 多个"云直播"名称指向相似URL
   */
  isPossibleCommentatorStream(label = '', playUrl = '', existingResults = []) {
    if (!label || !playUrl) return false;
    
    const labelLower = label.toLowerCase();
    
    // 如果名称中包含"云直播"，且已经存在其他"云直播"线路，可能是重复的"主播解说"
    if (labelLower.includes('云直播')) {
      const similarLabels = existingResults.filter(r => {
        const rLabel = (r.label || '').toLowerCase();
        return rLabel.includes('云直播') || rLabel.includes('线路');
      });
      
      if (similarLabels.length > 0) {
        // 检查URL是否相似（相同的主机和路径）
        const currentUrlBase = this.getStreamUrlForComparison(playUrl);
        const hasSimilarUrl = similarLabels.some(r => {
          const rUrlBase = this.getStreamUrlForComparison(r.playUrl);
          // 如果URL的基础部分相同，可能是重复线路
          return rUrlBase === currentUrlBase;
        });
        
        if (hasSimilarUrl) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  normalizeStreamKey(playUrl = '') {
    if (!playUrl) return '';
    try {
      const urlObj = new URL(playUrl);
      urlObj.searchParams.delete('auth_key');
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch (error) {
      const questionIndex = playUrl.indexOf('?');
      return questionIndex >= 0 ? playUrl.slice(0, questionIndex) : playUrl;
    }
  }

  /**
   * 从HTML中提取m3u8播放地址
   */
  extractEncodedStreamUrl(html) {
    if (!html || !html.includes('encodedStr')) {
      return null;
    }

    const markerIndex = html.indexOf('encodedStr');
    if (markerIndex === -1) {
      return null;
    }

    const afterMarker = html.slice(markerIndex);
    const equalsIndex = afterMarker.indexOf('=');
    if (equalsIndex === -1) {
      return null;
    }

    const valuePart = afterMarker.slice(equalsIndex + 1).trim();
    const quoteChar = valuePart[0];

    if (quoteChar !== "'" && quoteChar !== '"') {
      return null;
    }

    const closingIndex = valuePart.indexOf(quoteChar, 1);
    if (closingIndex === -1) {
      return null;
    }

    const encodedValue = valuePart.slice(1, closingIndex).trim();
    if (!encodedValue) {
      return null;
    }

    const decoded = decodeYumixiu(encodedValue);
    if (decoded && decoded.url) {
      return decoded.url;
    }

    return null;
  }

  async extractM3u8Url(html, baseUrl = '') {
    console.log('🔍 开始提取m3u8播放地址...');

    // 预处理：检测是否存在加密的 encodedStr 需要解密
    const decodedFromEncodedStr = this.extractEncodedStreamUrl(html);
    if (decodedFromEncodedStr) {
      console.log('✅ 通过encodedStr解密到m3u8流地址:', decodedFromEncodedStr);
      return decodedFromEncodedStr;
    }
    
    // 方法0：如果baseUrl已经是msss.html格式，直接解析
    if (baseUrl && baseUrl.includes('msss.html') && baseUrl.includes('id=')) {
      const baseObj = new URL(baseUrl);
      const idParam = baseObj.searchParams.get('id');
      if (idParam) {
        const decodedId = decodeURIComponent(idParam);
        if (decodedId.includes('.m3u8')) {
          const domainMatch = html.match(/\/\/([a-z0-9\.-]+)"\s*\+\s*id/i);
          const domain = domainMatch ? domainMatch[1] : 'cloud.yumixiu768.com';
          const scheme = baseObj.protocol === 'https:' ? 'https:' : 'http:';
          const normalizedDomain = domain.startsWith('//') ? domain.slice(2) : domain;
          const path = decodedId.startsWith('/') ? decodedId : `/${decodedId}`;
          const directM3u8Url = `${scheme}//${normalizedDomain}${path}`;
          console.log('✅ 从baseUrl中提取直接m3u8流地址:', directM3u8Url);
          return directM3u8Url;
        }
      }
    }
    
    // 方法1：优先提取纯m3u8流地址（从iframe URL中直接提取）- 修复msss.html格式
    const iframeSrcMatch2 = html.match(/src\s*=\s*["']([^"']*msss\.html\?id=[^"']*)["']/i);
    if (iframeSrcMatch2) {
      let iframeUrl = iframeSrcMatch2[1];
      // 处理以//开头的URL
      if (iframeUrl.startsWith('//')) {
        iframeUrl = 'http:' + iframeUrl;
      }
      const idMatch = iframeUrl.match(/id=([^&]*)/);
      if (idMatch) {
        const id = idMatch[1];
        
        // 如果id已经是完整的m3u8路径（包含/live/和.m3u8）
        if (id.includes('/live/') && id.includes('.m3u8')) {
          const decodedId = decodeURIComponent(id);
          const baseUrl = 'http://cloud.yumixiu768.com';
          const directM3u8Url = baseUrl + decodedId;
          console.log('✅ 从iframe URL中提取直接m3u8流地址:', directM3u8Url);
          return directM3u8Url;
        }
        
        // 如果id是数字，直接构造m3u8 URL而不验证（因为auth_key可能过期）
        const baseUrl = 'http://cloud.yumixiu768.com';
        const m3u8Url = baseUrl + `/live/${id}.m3u8`;
        console.log('✅ 从iframe URL中构造m3u8流地址:', m3u8Url);
        return m3u8Url;
      }
    }
    
    // 方法2：从iframe src中提取m3u8流地址
    const iframeSrcMatch = html.match(/src\s*=\s*["']([^"']*\.m3u8[^"']*)["']/i);
    if (iframeSrcMatch) {
      let url = iframeSrcMatch[1];
      if (url.startsWith('//')) {
        url = 'http:' + url;
      }
      console.log('✅ 找到m3u8流地址:', url);
      return url;
    }
    
    // 方法2：从JavaScript变量中提取m3u8地址 - 优先提取直接m3u8地址
    const jsM3u8Match = html.match(/["']([^"']*\.m3u8[^"']*)["']/gi);
    if (jsM3u8Match) {
      for (let match of jsM3u8Match) {
        let url = match.replace(/["']/g, '');
        if (url.includes('m3u8') && !url.includes('ad') && !url.includes('banner')) {
          // 如果是直接的m3u8地址（包含auth_key），优先使用
          if (url.includes('auth_key') && url.includes('cloud.yumixiu')) {
            if (url.startsWith('//')) {
              url = 'http:' + url;
            }
            console.log('✅ 从JS变量找到直接m3u8流地址:', url);
            return url;
          }
        }
      }
      
      // 如果没有找到直接的m3u8地址，继续处理其他格式
      for (let match of jsM3u8Match) {
        let url = match.replace(/["']/g, '');
        if (url.includes('m3u8') && !url.includes('ad') && !url.includes('banner')) {
          if (url.startsWith('//')) {
            url = 'http:' + url;
          }
          console.log('✅ 从JS变量找到m3u8流地址:', url);
          return url;
        }
      }
    }
    
    // 方法3：从HTML页面中进一步提取m3u8流地址 - 优先提取直接m3u8地址
    const directM3u8Match = html.match(/https?:\/\/cloud\.yumixiu768\.com\/live\/[^"'\s]*\.m3u8[^"'\s]*/gi);
    if (directM3u8Match) {
      for (let match of directM3u8Match) {
        let url = match.trim();
        if (url.includes('auth_key')) {
          console.log('✅ 从HTML中提取到直接m3u8流地址:', url);
          return url;
        }
      }
    }
    
    // 方法3.1：从HTML页面中提取m3u8路径
    const m3u8InHtmlMatch = html.match(/\/live\/[^"']*\.m3u8[^"']*/gi);
    if (m3u8InHtmlMatch) {
      for (let match of m3u8InHtmlMatch) {
        let url = match.trim();
        if (url.includes('auth_key')) {
          // 构建完整的m3u8流地址
          const baseUrl = 'http://cloud.yumixiu768.com';
          const fullUrl = baseUrl + url;
          console.log('✅ 从HTML中提取到完整m3u8流地址:', fullUrl);
          return fullUrl;
        }
      }
    }
    
    // 方法4：从HTML中提取m3u8流地址（新增优化）
    const m3u8PathMatch = html.match(/id=([^&]*\.m3u8[^&]*)/);
    if (m3u8PathMatch) {
      const m3u8Path = m3u8PathMatch[1];
      const baseUrl = 'http://cloud.yumixiu768.com';
      const directM3u8Url = baseUrl + decodeURIComponent(m3u8Path);
      console.log('✅ 从HTML中提取直接m3u8流地址:', directM3u8Url);
      return directM3u8Url;
    }
    
    // 方法5：从iframe URL中提取m3u8路径（修复版本）
    const iframeUrlMatch = html.match(/src\s*=\s*["']([^"']*msss\.html\?id=[^"']*)["']/i);
    if (iframeUrlMatch) {
      let iframeUrl = iframeUrlMatch[1];
      // 处理以//开头的URL
      if (iframeUrl.startsWith('//')) {
        iframeUrl = 'http:' + iframeUrl;
      }
      const idMatch = iframeUrl.match(/id=([^&]*)/);
      if (idMatch) {
        const m3u8Path = decodeURIComponent(idMatch[1]);
        const baseUrl = 'http://cloud.yumixiu768.com';
        const directM3u8Url = baseUrl + m3u8Path;
        console.log('✅ 从iframe URL中提取m3u8流地址:', directM3u8Url);
        return directM3u8Url;
      }
    }
    
    // 方法6：从baseUrl参数中直接提取m3u8路径
    if (baseUrl && baseUrl.includes('msss.html')) {
      const idMatch = baseUrl.match(/id=([^&]*)/);
      if (idMatch) {
        const m3u8Path = decodeURIComponent(idMatch[1]);
        // 如果路径已经是完整的m3u8路径，直接构建URL
        if (m3u8Path.startsWith('/live/') && m3u8Path.includes('.m3u8')) {
          const streamBaseUrl = 'http://cloud.yumixiu768.com';
          const directM3u8Url = streamBaseUrl + m3u8Path;
          console.log('✅ 从baseUrl中提取直接m3u8流地址:', directM3u8Url);
          return directM3u8Url;
        }
      }
    }
    
    
    // 方法3：从iframe src中提取带id参数的
    const iframeIdMatch = html.match(/src\s*=\s*["']([^"']*\?id=[^"']*)["']/i);
    if (iframeIdMatch) {
      let url = iframeIdMatch[1];
      if (url.startsWith('//')) {
        url = 'http:' + url;
      }
      // 提取完整的播放器URL（包含m3u8路径）
      return url;
    }
    
    // 方法3：直接匹配m3u8链接
    const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
    if (m3u8Match) {
      return m3u8Match[1];
    }
    
    return null;
  }

  /**
   * 检测流媒体类型
   */
  detectStreamType(url) {
    if (url.includes('.m3u8')) {
      return 'hls';
    } else if (url.includes('.flv')) {
      return 'flv';
    } else if (url.includes('.mp4')) {
      return 'mp4';
    }
    return 'unknown';
  }

  /**
   * 检测视频质量
   */
  detectQuality(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('hd') || urlLower.includes('高清') || urlLower.includes('1080')) {
      return '高清';
    } else if (urlLower.includes('sd') || urlLower.includes('标清') || urlLower.includes('480')) {
      return '标清';
    } else if (urlLower.includes('主播') || urlLower.includes('解说')) {
      return '解说';
    }
    
    return '标准';
  }

  /**
   * 批量抓取多个信号源
   * @param {Array<string>} streamUrls - 信号源URL数组
   * @returns {Promise<Array<Object>>} 信号源信息数组
   */
  async crawlSignals(streamUrls) {
    console.log(`🎬 开始批量抓取 ${streamUrls.length} 个信号源...`);
    
    const results = [];
    
    for (const url of streamUrls) {
      const signal = await this.crawlSignal(url);
      if (signal) {
        results.push(signal);
      }
      
      // 避免请求过快，间隔200ms
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`✅ 成功抓取 ${results.length}/${streamUrls.length} 个信号源`);
    
    return results;
  }
}

module.exports = JRKANSignalCrawler;


