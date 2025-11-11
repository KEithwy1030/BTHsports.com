const axios = require('axios');

/**
 * 信号源质量验证器
 * 用于验证m3u8地址的可用性
 */
class StreamValidator {
  constructor() {
    this.timeout = 5000;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  /**
   * 验证m3u8 URL是否可访问
   * @param {string} url - m3u8 URL
   * @returns {Promise<boolean>} 是否可用
   */
  async validateM3u8(url) {
    if (!url) return false;

    try {
      const response = await axios.head(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': '*/*'
        },
        validateStatus: (status) => status < 500,
        maxRedirects: 3
      });
      
      const isValid = response.status === 200 || response.status === 206;
      
      if (isValid) {
        console.log(`✅ 验证通过: ${url.substring(0, 60)}...`);
      } else {
        console.log(`❌ 验证失败: ${url.substring(0, 60)}... (状态码: ${response.status})`);
      }
      
      return isValid;
    } catch (error) {
      console.log(`❌ 验证失败: ${url.substring(0, 60)}... (${error.message})`);
      return false;
    }
  }

  /**
   * 从信号源对象中提取实际的m3u8地址
   * @param {Object} signal - 信号源对象
   * @returns {string|null} m3u8地址
   */
  extractM3u8Url(signal) {
    if (!signal || !signal.playUrl) return null;

    let url = signal.playUrl;

    // 如果playUrl包含?id=参数，提取实际的m3u8地址
    if (url.includes('?id=')) {
      const match = url.match(/\?id=([^&]+)/);
      if (match) {
        const decodedUrl = decodeURIComponent(match[1]);
        // 如果解码后是完整URL，使用它
        if (decodedUrl.startsWith('http') || decodedUrl.includes('.m3u8')) {
          return decodedUrl;
        }
      }
    }

    // 如果是播放器页面URL，尝试从中提取m3u8
    if (url.includes('player/') && url.includes('.html')) {
      // 这种情况需要进一步抓取才能获取真实m3u8，暂时返回原URL
      return url;
    }

    // 如果已经是m3u8地址，直接返回
    if (url.includes('.m3u8')) {
      return url;
    }

    return url;
  }

  /**
   * 验证信号源并评分
   * @param {Object} signal - 信号源对象
   * @returns {Promise<number>} 验证分数 (0-100)
   */
  async validateAndScore(signal) {
    if (!signal || !signal.playUrl) {
      return 0;
    }

    try {
      // 提取m3u8地址
      const m3u8Url = this.extractM3u8Url(signal);
      
      if (!m3u8Url) {
        return 0;
      }

      // 对于播放器页面URL，给予中等分数（需要进一步验证）
      if (m3u8Url.includes('.html') && !m3u8Url.includes('.m3u8')) {
        return 50;
      }

      // 验证可达性
      const isValid = await this.validateM3u8(m3u8Url);
      
      return isValid ? 100 : 0;
    } catch (error) {
      console.error(`验证信号源失败:`, error.message);
      return 0;
    }
  }

  /**
   * 批量验证信号源
   * @param {Array} signals - 信号源数组
   * @param {boolean} filterInvalid - 是否过滤无效信号源
   * @returns {Promise<Array>} 验证后的信号源数组
   */
  async batchValidate(signals, filterInvalid = true) {
    if (!signals || signals.length === 0) {
      return [];
    }

    console.log(`🔍 开始批量验证 ${signals.length} 个信号源...`);

    try {
      // 并发验证所有信号源
      const results = await Promise.all(
        signals.map(async (signal) => {
          const score = await this.validateAndScore(signal);
          return {
            ...signal,
            validationScore: score,
            isValid: score > 0,
            validatedAt: new Date().toISOString()
          };
        })
      );

      // 过滤无效信号源
      const validSignals = filterInvalid 
        ? results.filter(s => s.isValid) 
        : results;

      const validCount = results.filter(s => s.isValid).length;
      console.log(`✅ 验证完成: ${validCount}/${signals.length} 个信号源有效`);

      return validSignals;
    } catch (error) {
      console.error('❌ 批量验证失败:', error.message);
      return signals; // 验证失败时返回原始数据
    }
  }

  /**
   * 快速检查（只验证URL格式，不实际请求）
   * @param {Object} signal - 信号源对象
   * @returns {boolean} 格式是否有效
   */
  quickCheck(signal) {
    if (!signal || !signal.playUrl) {
      return false;
    }

    const url = signal.playUrl;

    // 检查URL格式
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return false;
    }

    // 检查是否包含明显的播放相关关键词
    const hasPlayKeywords = 
      url.includes('.m3u8') || 
      url.includes('play') || 
      url.includes('live') ||
      url.includes('stream');

    return hasPlayKeywords;
  }

  /**
   * 获取验证统计信息
   * @param {Array} validatedSignals - 已验证的信号源数组
   * @returns {Object} 统计信息
   */
  getValidationStats(validatedSignals) {
    const total = validatedSignals.length;
    const valid = validatedSignals.filter(s => s.isValid).length;
    const invalid = total - valid;
    const avgScore = validatedSignals.reduce((sum, s) => sum + (s.validationScore || 0), 0) / total;

    return {
      total,
      valid,
      invalid,
      validRate: (valid / total * 100).toFixed(2) + '%',
      avgScore: avgScore.toFixed(2)
    };
  }
}

module.exports = StreamValidator;

