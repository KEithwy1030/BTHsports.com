const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { decodeYumixiu } = require('../utils/yumixiuDecoder');

const lineStats = new Map();
const STAT_TTL = 6 * 60 * 60 * 1000; // 6小时

class JRKANSignalCrawler {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.timeout = 8000;
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
      const firstPageHtml = await this.fetchPage(streamUrl);
      const channelButtons = this.extractChannelButtons(firstPageHtml, streamUrl);
      const normalizedButtons = [...channelButtons];
      if (!normalizedButtons.some(button => button.url === streamUrl)) {
        normalizedButtons.unshift({ label: '线路1', url: streamUrl });
      }

      const rawCandidates = (normalizedButtons.length > 0 ? normalizedButtons : [{ label: '线路1', url: streamUrl }])
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
            if (!uniqueStreams.has(normalizedKey)) {
              uniqueStreams.set(normalizedKey, true);
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
    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': referer,
        'Connection': 'keep-alive',
        ...(this.getCookieHeader() ? { 'Cookie': this.getCookieHeader() } : {})
      },
      timeout: this.timeout,
      maxRedirects: 10
    });
    
    this.storeCookies(response.headers['set-cookie']);
    return response.data;
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

    const candidateSelectors = [
      '.sub_channel a',
      'a.item',
      '.channel-list a',
      '.line-list a'
    ];

    candidateSelectors.forEach(selector => {
      $(selector).each((index, element) => {
        const $el = $(element);
        let playPath = $el.attr('data-play') || $el.attr('href');
        if (!playPath || playPath.startsWith('javascript')) {
          return;
        }

        const url = this.normalizeUrl(playPath, baseUrl);
        if (!url || seen.has(url)) {
          return;
        }

        seen.add(url);
        let label = ($el.attr('data-group') || $el.text() || '').replace(/\s+/g, ' ').trim();
        if (!label) {
          label = `线路${buttons.length + 1}`;
        }

        buttons.push({
          label,
          url
        });
      });
    });

    return buttons;
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


