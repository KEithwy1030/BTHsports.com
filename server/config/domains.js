/**
 * JRKAN播放域名配置
 * 支持动态管理和优先级控制
 */

const JRKAN_DOMAINS = [
  { 
    url: 'http://play.jgdhds.com', 
    priority: 1, 
    status: 'active',
    name: '云直播②（jgdhds）',
    successCount: 0,
    failCount: 0
  },
  { 
    url: 'http://play.sportsteam7777.com', 
    priority: 2, 
    status: 'active',
    name: '云直播③（sportsteam7777）',
    successCount: 0,
    failCount: 0
  },
  { 
    url: 'http://play.sportsteam368.com', 
    priority: 3, 
    status: 'active',
    name: '云直播①（sportsteam368）',
    successCount: 0,
    failCount: 0
  }
];

/**
 * 域名管理器
 * 支持多域名轮换、健康检查、自动降级
 */
class DomainManager {
  constructor() {
    this.domains = [...JRKAN_DOMAINS];
  }

  /**
   * 获取所有可用域名
   * @returns {Array} 按优先级排序的域名列表
   */
  getActiveDomains() {
    return this.domains
      .filter(d => d.status === 'active')
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * 尝试多个域名获取信号源
   * @param {string} steamId - JRKAN信号源ID
   * @param {Object} signalCrawler - 信号源爬虫实例
   * @param {Object} validator - 验证器实例（可选）
   * @returns {Promise<Object>} 信号源数据或失败信息
   */
  async tryMultipleDomains(steamId, signalCrawler, validator = null) {
    const domains = this.getActiveDomains();
    
    if (domains.length === 0) {
      return { 
        success: false, 
        message: '没有可用的域名' 
      };
    }

    console.log(`🌐 尝试 ${domains.length} 个域名获取信号源 steam${steamId}...`);

    for (const domain of domains) {
      try {
        const url = `${domain.url}/play/steam${steamId}.html`;
        console.log(`   尝试域名: ${domain.name} (${domain.url})`);
        
        // 抓取信号源
        const signal = await signalCrawler.crawlSignal(url);
        
        if (!signal) {
          console.log(`   ❌ ${domain.name} 抓取失败`);
          this.recordFailure(domain.url);
          continue;
        }

        // 如果提供了验证器，验证m3u8地址
        if (validator) {
          const isValid = await validator.validateM3u8(signal.playUrl);
          if (!isValid) {
            console.log(`   ❌ ${domain.name} 验证失败`);
            this.recordFailure(domain.url);
            continue;
          }
        }

        // 成功
        console.log(`   ✅ ${domain.name} 成功`);
        this.recordSuccess(domain.url);
        
        return { 
          success: true, 
          signal, 
          usedDomain: domain.url,
          domainName: domain.name
        };

      } catch (error) {
        console.log(`   ❌ ${domain.name} 错误: ${error.message}`);
        this.recordFailure(domain.url);
      }
    }

    console.log(`❌ 所有域名都不可用`);
    return { 
      success: false, 
      message: '所有域名都不可用' 
    };
  }

  /**
   * 记录成功
   */
  recordSuccess(domainUrl) {
    const domain = this.domains.find(d => d.url === domainUrl);
    if (domain) {
      domain.successCount++;
      // 成功率高的域名优先级提升
      if (domain.successCount > 10 && domain.priority > 1) {
        domain.priority--;
      }
    }
  }

  /**
   * 记录失败
   */
  recordFailure(domainUrl) {
    const domain = this.domains.find(d => d.url === domainUrl);
    if (domain) {
      domain.failCount++;
      // 失败率高的域名自动降级
      if (domain.failCount > 5) {
        const failRate = domain.failCount / (domain.successCount + domain.failCount);
        if (failRate > 0.7) {
          console.warn(`⚠️ 域名 ${domain.name} 失败率过高 (${(failRate * 100).toFixed(1)}%)，自动禁用`);
          domain.status = 'inactive';
        }
      }
    }
  }

  /**
   * 手动启用/禁用域名
   */
  setDomainStatus(domainUrl, status) {
    const domain = this.domains.find(d => d.url === domainUrl);
    if (domain) {
      domain.status = status;
      console.log(`✅ 域名 ${domain.name} 状态已更新为: ${status}`);
      return true;
    }
    return false;
  }

  /**
   * 添加新域名
   */
  addDomain(url, name, priority = 99) {
    const exists = this.domains.find(d => d.url === url);
    if (exists) {
      console.warn(`⚠️ 域名 ${url} 已存在`);
      return false;
    }

    this.domains.push({
      url,
      name,
      priority,
      status: 'active',
      successCount: 0,
      failCount: 0
    });

    console.log(`✅ 添加新域名: ${name} (${url})`);
    return true;
  }

  /**
   * 获取域名统计信息
   */
  getStats() {
    return this.domains.map(d => ({
      name: d.name,
      url: d.url,
      status: d.status,
      priority: d.priority,
      successCount: d.successCount,
      failCount: d.failCount,
      successRate: d.successCount + d.failCount > 0
        ? ((d.successCount / (d.successCount + d.failCount)) * 100).toFixed(2) + '%'
        : 'N/A'
    }));
  }

  /**
   * 重置统计数据
   */
  resetStats() {
    this.domains.forEach(d => {
      d.successCount = 0;
      d.failCount = 0;
    });
    console.log('✅ 域名统计数据已重置');
  }
}

module.exports = {
  JRKAN_DOMAINS,
  DomainManager
};

