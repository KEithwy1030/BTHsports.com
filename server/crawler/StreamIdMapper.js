const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

class StreamIdMapper {
  constructor() {
    this.mappingFile = path.join(__dirname, '../data/streamIdMapping.json');
    this.mapping = this.loadMapping();
  }

  // 加载现有映射表
  loadMapping() {
    try {
      if (fs.existsSync(this.mappingFile)) {
        const data = fs.readFileSync(this.mappingFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ 加载映射表失败:', error.message);
    }
    return {};
  }

  // 保存映射表
  saveMapping() {
    try {
      const dir = path.dirname(this.mappingFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.mappingFile, JSON.stringify(this.mapping, null, 2));
      console.log(`✅ 映射表已保存，当前映射数量: ${Object.keys(this.mapping).length}`);
    } catch (error) {
      console.error('❌ 保存映射表失败:', error.message);
    }
  }

  // 从JRKAN页面获取真实映射关系
  async getRealMapping(streamId) {
    try {
      const jrkanUrl = `https://www.jrs80.com/#${streamId}`;
      console.log(`🔍 获取真实映射: ${streamId}`);
      
      const response = await axios.get(jrkanUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0'
        }
      });
      
      const $ = cheerio.load(response.data);
      const realMappings = [];
      
      // 提取所有播放链接
      $('a[href*="play/steam"]').each((i, link) => {
        const href = $(link).attr('href');
        if (href) {
          const steamMatch = href.match(/steam(\d+)\.html/);
          if (steamMatch) {
            const steamId = steamMatch[1];
            const linkText = $(link).text().trim();
            const domain = new URL(href).hostname;
            
            realMappings.push({
              steamId,
              linkText,
              domain,
              href
            });
          }
        }
      });
      
      if (realMappings.length > 0) {
        // 选择直播②的steam ID
        const live2 = realMappings.find(m => m.linkText === '直播②');
        const selectedSteamId = live2 ? live2.steamId : realMappings[0].steamId;
        
        console.log(`✅ 找到真实映射: ${streamId} → ${selectedSteamId}`);
        return selectedSteamId;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ 获取真实映射失败 ${streamId}:`, error.message);
      return null;
    }
  }

  // 获取映射关系（优先使用缓存，缺失时实时获取）
  async getMapping(streamId) {
    // 检查缓存
    if (this.mapping[streamId]) {
      console.log(`📋 使用缓存映射: ${streamId} → ${this.mapping[streamId]}`);
      return this.mapping[streamId];
    }
    
    // 实时获取
    const realSteamId = await this.getRealMapping(streamId);
    if (realSteamId) {
      this.mapping[streamId] = realSteamId;
      this.saveMapping();
      return realSteamId;
    }
    
    // 兜底策略 - 改进：生成更合理的steamId
    console.error(`❌ 无法获取真实映射: ${streamId}`);
    return null; // 返回null而不是错误的fallback ID
  }

  // 批量更新映射表
  async updateAllMappings(streamIds) {
    console.log(`🔄 开始批量更新映射表，共 ${streamIds.length} 个streamId`);
    
    for (const streamId of streamIds) {
      try {
        const realSteamId = await this.getRealMapping(streamId);
        if (realSteamId) {
          this.mapping[streamId] = realSteamId;
          console.log(`✅ 映射成功: ${streamId} → ${realSteamId}`);
        }
        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ 更新映射失败 ${streamId}:`, error.message);
      }
    }
    
    this.saveMapping();
    console.log(`✅ 批量更新完成，当前映射数量: ${Object.keys(this.mapping).length}`);
  }

  // 获取统计信息
  getStats() {
    return {
      totalMappings: Object.keys(this.mapping).length,
      mappings: this.mapping
    };
  }
}

module.exports = StreamIdMapper;
