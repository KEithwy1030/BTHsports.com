const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { decode } = require('html-entities');

class JRSKanCrawler {
  constructor() {
    this.config = {
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      timeout: 15000,
      delay: 2000
    };
  }

  // 方法1：抓取JRKAN的index.js并解析document.write内容
  async crawlJRSScheduleAPI() {
    try {
      console.log('🔍 开始抓取JRKAN的index.js数据文件...');
      
      const response = await axios.get('https://im-imgs-bucket.oss-accelerate.aliyuncs.com/index.js', {
        params: { t_5: Date.now() }, // 添加时间戳避免缓存
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Referer': 'https://www.jrs80.com/'
        },
        timeout: 15000
      });
      
      const jsContent = response.data;
      console.log(`📄 成功获取index.js，长度: ${jsContent.length} 字符`);
      
      // 解析document.write的HTML内容
      return this.parseIndexJS(jsContent);
      
    } catch (error) {
      console.error('❌ 抓取index.js失败:', error.message);
      return [];
    }
  }
  
  // 解析index.js中的document.write内容
  parseIndexJS(jsContent) {
    try {
      // 提取所有document.write的内容
      const writeMatches = jsContent.match(/document\.write\('([^']*)'\);/g) || [];
      console.log(`📋 找到 ${writeMatches.length} 行document.write语句`);
      
      // 拼接完整HTML
      let fullHTML = '';
      writeMatches.forEach(line => {
        const content = line.match(/document\.write\('(.*)'\);/)[1];
        fullHTML += content;
      });
      
      // 使用cheerio解析HTML
      const $ = cheerio.load(fullHTML);
      const matches = [];
      
      // 查找所有比赛项（ul.item）
      $('ul.item').each((index, ul) => {
        const $ul = $(ul);
        const dataLid = $ul.attr('data-lid');
        const dataStype = $ul.attr('data-stype');
        
        // 提取联赛名称
        const league = decode($ul.find('.lab_events .name').text().trim()) || '未知联赛';
        
        // 提取时间
        const time = decode($ul.find('.lab_time').text().trim()) || '待定';
        
        // 提取队伍信息（使用正确的选择器）
        const homeTeam = decode($ul.find('.lab_team_home .name').text().trim());
        const awayTeam = decode($ul.find('.lab_team_away .name').text().trim());
        
        // 提取队伍Logo
        const homeLogo = $ul.find('.lab_team_home img').attr('src') || '';
        const awayLogo = $ul.find('.lab_team_away img').attr('src') || '';
        
        // 提取比分 - 只获取真实比分，不生成模拟数据
        let score = '-';
        let homeScore = '';
        let awayScore = '';
        
        // 尝试从.bf元素获取真实比分
        const bfElements = $ul.find('.bf');
        if (bfElements.length === 2) {
          const homeBfText = $(bfElements[0]).text().trim();
          const awayBfText = $(bfElements[1]).text().trim();
          
          // 只有当textContent包含有效数字时才使用
          if (homeBfText && awayBfText && !isNaN(homeBfText) && !isNaN(awayBfText) && 
              homeBfText !== '2' && awayBfText !== '2') {
            homeScore = homeBfText;
            awayScore = awayBfText;
          score = `${homeScore}-${awayScore}`;
          }
        }
        
        // 提取直播信号源链接 - 增强提取steamId和domain
        const channels = [];
        const seenChannels = new Set(); // 用于去重：steamId+domain组合
        
        // SEO优化：过滤"主播解说"的关键词
        const excludeKeywords = ['主播', '解说', 'commentator', 'host'];
        const isExcludedChannel = (channelName) => {
          if (!channelName) return false;
          const lowerName = channelName.toLowerCase();
          return excludeKeywords.some(keyword => lowerName.includes(keyword.toLowerCase()));
        };
        
        $ul.find('li a').each((i, a) => {
          const $a = $(a);
          const url = $a.attr('href');
          // 修复频道名称提取：从strong标签内获取，而不是直接从a标签
          const name = ($a.find('strong').text().trim() || $a.text().trim()).replace(/\s+/g, ' ');
          
          // 🚫 第一步过滤：在提取时就过滤掉"主播解说"
          if (isExcludedChannel(name)) {
            console.log(`🚫 过滤掉"主播解说"频道: ${name}`);
            return; // 跳过这个频道
          }
          
          if (url && url.includes('play/steam')) {
            const fullUrl = url.startsWith('http') ? url : `http:${url}`;
            
            // 提取steamId - 修复：只提取纯数字，过滤包含下划线的格式
            const steamMatch = url.match(/steam(\d+)(?:[^0-9]|\.html)/);
            let steamId = steamMatch ? steamMatch[1] : null;
            
            // 验证steamId格式：必须是纯数字，长度合理（4-8位）
            if (steamId && !/^\d{4,8}$/.test(steamId)) {
              console.warn(`⚠️ 跳过无效steamId格式: ${steamId}, URL: ${url}`);
              steamId = null;
            }
            
            // 提取domain
            let domain = '';
            try {
              const urlObj = new URL(fullUrl);
              domain = urlObj.hostname;
            } catch (e) {
              console.warn(`无法解析URL: ${fullUrl}`);
            }
            
            // 只有steamId有效时才添加频道
            if (steamId && domain) {
              // 🎯 第二步去重：使用 steamId+domain 组合去重，避免重复线路
              const channelKey = `${steamId}|${domain}`;
              if (seenChannels.has(channelKey)) {
                console.log(`🚫 跳过重复频道: ${name} (steamId: ${steamId}, domain: ${domain})`);
                return; // 跳过重复的频道
              }
              seenChannels.add(channelKey);
              
              // 🚫 第三步检查：再次确认不是"主播解说"（防止名称提取错误）
              if (isExcludedChannel(name)) {
                console.log(`🚫 二次过滤"主播解说"频道: ${name}`);
                return;
              }
              
              channels.push({
                name: name || `直播${i + 1}`,
                url: fullUrl,
                steamId: steamId,
                domain: domain,
                quality: name.includes('高清') ? 'HD' : (name.includes('直播') ? 'HD' : 'SD'),
                channelIndex: i,
                isValid: true // 标记为有效频道
              });
              console.log(`✅ 有效频道: ${name} → steam${steamId}, domain: ${domain}`);
            } else {
              console.warn(`⚠️ 跳过无效频道: ${name}, steamId: ${steamId}, domain: ${domain}, URL: ${url}`);
            }
          }
        });
        
        // 判断状态 - 纯粹基于时间判断
        let status = '未开始';
        const now = new Date();
        const matchTime = this.parseTime(time);
        
        // 计算比赛结束时间（开始时间 + 3小时）
        const matchEndTime = new Date(matchTime.getTime() + 3 * 60 * 60 * 1000);
        
        if (now < matchTime) {
          // 当前时间早于比赛开始时间 - 未开始
          status = '未开始';
        } else if (now >= matchTime && now < matchEndTime) {
          // 比赛时间范围内 - 直播中
          status = '直播中';
        } else {
          // 超过比赛结束时间 - 已结束
          status = '已结束';
        }
        
        if (homeTeam && awayTeam) {
          matches.push({
            id: `jrs_${dataLid}_${index}`,
            league,
            time,
            status,
            homeTeam,
            homeLogo,
            awayTeam,
            awayLogo,
            score,
            homeScore: homeScore || '',
            awayScore: awayScore || '',
            channels: channels,
            dataLid,
            dataStype
          });
        }
      });
      
      console.log(`✅ 成功解析 ${matches.length} 场比赛 - 热重载测试`);
      
      // 过滤掉已结束的比赛，只保留进行中和未开始的
      const activeMatches = matches.filter(match => {
        return match.status === '直播中' || match.status === '未开始';
      });
      
      console.log(`📋 过滤后保留 ${activeMatches.length} 场进行中/未开始的比赛`);
      return activeMatches;
      
    } catch (error) {
      console.error('❌ 解析index.js失败:', error.message);
      return [];
    }
  }
  
  // 格式化时间
  formatTime(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  }



  // 解析原始比赛数据
  parseRawMatches(rawData) {
    const matches = [];
    
    rawData.forEach((raw, index) => {
      try {
        // 从原始数据中解析比赛信息
        const text = raw.text || '';
        
        // 尝试解析联赛名称（通常在文本开头）
        let league = '未知联赛';
        const leagueMatch = text.match(/^([^\d]+)/);
        if (leagueMatch) {
          league = leagueMatch[1].trim();
        }
        
        // 尝试解析时间
        let time = '';
        if (raw.dataT) {
          // dataT格式: 时间戳或时间字符串
          time = raw.dataT;
        } else if (raw.dataYmd) {
          // dataYmd格式: 日期
          time = raw.dataYmd;
        }
        
        // 从HTML中尝试提取队伍名称
        const htmlText = raw.html || '';
        let homeTeam = '';
        let awayTeam = '';
        let score = '-';
        
        // 简单的文本分析提取队伍（VS或-分隔）
        const vsMatch = text.match(/(.+?)\s*(?:VS|vs|对|:)\s*(.+)/i);
        if (vsMatch) {
          homeTeam = vsMatch[1].trim();
          awayTeam = vsMatch[2].trim();
        }
        
        // 提取比分（如果有）
        const scoreMatch = text.match(/(\d+)\s*[-:]\s*(\d+)/);
        if (scoreMatch) {
          score = `${scoreMatch[1]}-${scoreMatch[2]}`;
        }
        
        // 如果成功提取到基本信息，添加到结果
        if (homeTeam && awayTeam) {
          matches.push({
            id: `jrs_${Date.now()}_${index}`,
            league: league || '未知联赛',
            time: time || '待定',
            status: scoreMatch ? '已结束' : '未开始',
            homeTeam,
            homeLogo: '',
            awayTeam,
            awayLogo: '',
            score,
            links: raw.links || [],
            dataLea: raw.dataLea,
            dataSportid: raw.dataSportid
          });
        } else {
          // 如果无法解析，保留原始数据用于调试
          console.log(`⚠️ 无法解析比赛 ${index}: ${text.substring(0, 50)}`);
          matches.push({
            id: `jrs_raw_${index}`,
            league: '待解析',
            time: time || '待定',
            status: '未知',
            homeTeam: text.substring(0, 30),
            homeLogo: '',
            awayTeam: text.substring(30, 60),
            awayLogo: '',
            score: '-',
            rawText: text.substring(0, 100)
          });
        }
      } catch (e) {
        console.error('解析单条数据失败:', e.message);
      }
    });
    
    console.log(`✅ 成功解析 ${matches.length} 场比赛`);
    return matches;
  }

  // 解析JSONP响应
  parseJSONPResponse(data) {
    try {
      // 提取JSONP回调函数中的数据
      const match = data.match(/cb_base_zqlq_0\((.*)\)/);
      if (match) {
        return JSON.parse(match[1]);
      }
      return {};
    } catch (error) {
      console.error('❌ JSONP解析失败:', error.message);
      return {};
    }
  }

  // 转换JRS数据格式
  convertJRSMatches(data) {
    const matches = [];
    
    if (data && data.matches) {
      data.matches.forEach(match => {
        matches.push({
          id: match.id || this.generateMatchId(match.home_team, match.away_team),
          league: match.league || '未知联赛',
          time: match.time || '',
          status: match.status || '未开始',
          homeTeam: match.home_team || '',
          awayTeam: match.away_team || '',
          score: match.score || '-',
          channels: match.channels || []
        });
      });
    }
    
    return matches;
  }

  // 生成比赛ID
  generateMatchId(homeTeam, awayTeam) {
    const hash = crypto
      .createHash('md5')
      .update(`${homeTeam}-${awayTeam}-${Date.now()}`)
      .digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  // 获取随机User-Agent
  getRandomUserAgent() {
    return this.config.userAgents[
      Math.floor(Math.random() * this.config.userAgents.length)
    ];
  }

  // 解析时间字符串
  parseTime(timeStr) {
    try {
      // 处理各种时间格式
      if (!timeStr) return new Date();
      const trimmed = timeStr.trim();

      // 格式: "2025/11/10 19:30" or "2025-11-10 19:30"
      const fullDateMatch = trimmed.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})$/);
      if (fullDateMatch) {
        const [, year, month, day, hour, minute] = fullDateMatch;
        return this.createBeijingDate(
          Number(year),
          Number(month),
          Number(day),
          Number(hour),
          Number(minute)
        );
      }

      // 格式: "10-08 00:00"
      if (trimmed.match(/^\d{2}-\d{2}\s+\d{2}:\d{2}$/)) {
        const currentYear = new Date().getFullYear();
        const [monthDay, time] = trimmed.split(' ');
        const [month, day] = monthDay.split('-');
        const [hour, minute] = time.split(':');
        return this.createBeijingDate(
          currentYear,
          Number(month),
          Number(day),
          Number(hour),
          Number(minute)
        );
      }

      // 格式: "今天 20:00"
      if (trimmed.includes('今天')) {
        const time = trimmed.replace('今天', '').trim();
        const today = new Date();
        const [hour, minute] = time.split(':');
        return this.createBeijingDate(
          today.getFullYear(),
          today.getMonth() + 1,
          today.getDate(),
          Number(hour),
          Number(minute)
        );
      }

      // 默认返回当前时间
      return new Date();
    } catch (error) {
      console.error('❌ 时间解析失败:', timeStr, error.message);
      return new Date();
    }
  }

  createBeijingDate(year, month, day, hour = 0, minute = 0) {
    const tzOffset = 8; // 东八区
    const utcTimestamp = Date.UTC(
      year,
      (month ?? 1) - 1,
      day ?? 1,
      (hour ?? 0) - tzOffset,
      minute ?? 0
    );
    return new Date(utcTimestamp);
  }

  // 主抓取方法 - 使用稳定的JRKAN API策略
  async crawlSchedule() {
    console.log('🚀 开始抓取JRS赛程数据...');
    
    // 直接使用JRKAN API获取赛程数据
    console.log('📊 使用稳定的JRKAN API策略');
    
    const jrkanMatches = await this.crawlJRSScheduleAPI();
    console.log(`📊 JRKAN赛程数据: ${jrkanMatches.length} 场`);
    
    if (jrkanMatches.length === 0) {
      console.log('❌ 未能获取数据');
      return [];
    }
    
    console.log(`✅ 成功获取 ${jrkanMatches.length} 场比赛数据`);
    return jrkanMatches;
  }


}

module.exports = JRSKanCrawler;
