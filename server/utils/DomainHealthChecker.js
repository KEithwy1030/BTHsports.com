const axios = require('axios');

/**
 * 域名健康检查器
 * 用于检测域名的可用性和响应速度
 */
class DomainHealthChecker {
  constructor() {
    this.checkResults = new Map(); // 缓存检查结果
    this.checkInterval = 5 * 60 * 1000; // 5分钟检查一次
    this.timeout = 10000; // 10秒超时
  }

  /**
   * 检查单个域名的健康状态
   * @param {string} domain - 域名
   * @param {string} testUrl - 测试URL
   * @returns {Promise<Object>} 检查结果
   */
  async checkDomainHealth(domain, testUrl) {
    const cacheKey = `${domain}_${testUrl}`;
    const cached = this.checkResults.get(cacheKey);
    
    // 如果缓存存在且未过期，直接返回
    if (cached && Date.now() - cached.timestamp < this.checkInterval) {
      return cached.result;
    }

    try {
      const startTime = Date.now();
      
      // 发送HEAD请求检查域名可用性
      const response = await axios.head(testUrl, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const responseTime = Date.now() - startTime;
      const isHealthy = response.status === 200;
      
      const result = {
        healthy: isHealthy,
        statusCode: response.status,
        responseTime: responseTime,
        lastChecked: new Date().toISOString(),
        error: null
      };
      
      // 缓存结果
      this.checkResults.set(cacheKey, {
        result: result,
        timestamp: Date.now()
      });
      
      console.log(`✅ 域名健康检查: ${domain} - ${isHealthy ? '健康' : '异常'} (${responseTime}ms)`);
      return result;
      
    } catch (error) {
      const result = {
        healthy: false,
        statusCode: null,
        responseTime: null,
        lastChecked: new Date().toISOString(),
        error: error.message
      };
      
      // 缓存失败结果（缓存时间更短）
      this.checkResults.set(cacheKey, {
        result: result,
        timestamp: Date.now() - this.checkInterval + 60000 // 缓存1分钟
      });
      
      console.log(`❌ 域名健康检查: ${domain} - 异常 (${error.message})`);
      return result;
    }
  }

  /**
   * 批量检查多个域名的健康状态
   * @param {Array} domains - 域名列表
   * @returns {Promise<Array>} 检查结果列表
   */
  async checkMultipleDomains(domains) {
    const promises = domains.map(async (domainInfo) => {
      const testUrl = `${domainInfo.domain}/play/steam800805.html`; // 使用实际存在的测试URL
      const health = await this.checkDomainHealth(domainInfo.domain, testUrl);
      
      return {
        domain: domainInfo.domain,
        priority: domainInfo.priority,
        health: health,
        score: this.calculateDomainScore(health, domainInfo.priority)
      };
    });
    
    const results = await Promise.all(promises);
    
    // 按分数排序，分数高的优先
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 计算域名分数
   * @param {Object} health - 健康检查结果
   * @param {number} priority - 优先级
   * @returns {number} 分数
   */
  calculateDomainScore(health, priority) {
    if (!health.healthy) return 0;
    
    let score = 100; // 基础分数
    
    // 响应时间加分（越快越好）
    if (health.responseTime) {
      if (health.responseTime < 1000) score += 20;      // < 1秒
      else if (health.responseTime < 3000) score += 10; // < 3秒
      else if (health.responseTime < 5000) score += 5;  // < 5秒
      else score -= 10; // > 5秒扣分
    }
    
    // 优先级加分
    score += (10 - priority) * 5; // 优先级1得50分，优先级2得45分
    
    return Math.max(0, score);
  }

  /**
   * 获取最佳域名
   * @param {Array} domains - 域名列表
   * @returns {Promise<string>} 最佳域名
   */
  async getBestDomain(domains) {
    const results = await this.checkMultipleDomains(domains);
    const bestDomain = results[0];
    
    if (bestDomain && bestDomain.health.healthy) {
      console.log(`🎯 选择最佳域名: ${bestDomain.domain} (分数: ${bestDomain.score})`);
      return bestDomain.domain;
    } else {
      console.log(`⚠️ 所有域名都不健康，使用默认域名`);
      return domains[0].domain; // 返回第一个作为默认
    }
  }
}

module.exports = DomainHealthChecker;
