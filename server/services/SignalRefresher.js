const mappingDB = require('../utils/MappingDB');
const JRKANSignalCrawler = require('../crawler/JRKANSignalCrawler');
const { DomainManager } = require('../config/domains');

/**
 * 信号源自动刷新服务
 * 用于定时刷新直播中比赛的auth_key，解决30分钟时效问题
 */
class SignalRefresher {
  constructor() {
    this.refreshInterval = 20 * 60 * 1000; // 20分钟刷新一次
    this.batchSize = 50; // 每批处理50个
    this.isRunning = false;
    this.signalCrawler = new JRKANSignalCrawler();
    this.domainManager = new DomainManager();
    this.refreshTimer = null;
  }

  /**
   * 启动自动刷新
   */
  startAutoRefresh() {
    if (this.isRunning) {
      console.warn('⚠️ SignalRefresher 已经在运行中');
      return;
    }

    this.isRunning = true;
    console.log(`🔄 SignalRefresher 启动，刷新间隔: ${this.refreshInterval / 1000 / 60} 分钟`);

    // 立即执行一次
    this.refreshAll();

    // 定时执行
    this.refreshTimer = setInterval(async () => {
      await this.refreshAll();
    }, this.refreshInterval);
  }

  /**
   * 停止自动刷新
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      this.isRunning = false;
      console.log('✅ SignalRefresher 已停止');
    }
  }

  /**
   * 刷新所有需要更新的信号源
   */
  async refreshAll() {
    try {
      console.log('🔄 开始刷新信号源...');
      
      // 获取需要刷新的映射
      const mappings = await mappingDB.getMappingsToRefresh();
      
      if (mappings.length === 0) {
        console.log('✅ 没有需要刷新的信号源');
        return { success: true, count: 0 };
      }

      console.log(`📋 找到 ${mappings.length} 个需要刷新的信号源`);

      let successCount = 0;
      let failCount = 0;

      // 批量刷新
      for (const mapping of mappings) {
        try {
          const result = await this.refreshMatchSignal(
            mapping.stream_id,
            mapping.steam_id,
            mapping.domain
          );
          
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }

          // 避免请求过快
          await this.sleep(500);

        } catch (error) {
          console.error(`❌ 刷新失败 ${mapping.stream_id}/${mapping.steam_id}:`, error.message);
          failCount++;
        }
      }

      console.log(`✅ 刷新完成: 成功 ${successCount}/${mappings.length}, 失败 ${failCount}`);

      return {
        success: true,
        total: mappings.length,
        successCount,
        failCount
      };

    } catch (error) {
      console.error('❌ 批量刷新失败:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * 刷新单个比赛的信号源
   */
  async refreshMatchSignal(streamId, steamId, domain) {
    try {
      // 如果domain格式不对，尝试修复
      if (domain && !domain.startsWith('http')) {
        domain = `http://${domain}`;
      }

      // 如果没有domain，使用domainManager尝试多个域名
      if (!domain) {
        const result = await this.domainManager.tryMultipleDomains(
          steamId,
          this.signalCrawler
        );

        if (result.success) {
          // 更新映射表中的验证时间
          await mappingDB.incrementSuccess(streamId, steamId);
          return { success: true, usedDomain: result.usedDomain };
        } else {
          await mappingDB.incrementFailure(streamId, steamId);
          return { success: false, message: '所有域名都失败' };
        }
      }

      // 使用指定domain刷新
      const url = `${domain}/play/steam${steamId}.html`;
      const signal = await this.signalCrawler.crawlSignal(url);

      if (signal && signal.playUrl) {
        // 更新成功
        await mappingDB.incrementSuccess(streamId, steamId);
        console.log(`✅ 刷新成功: ${streamId} → ${steamId}`);
        return { success: true };
      } else {
        // 刷新失败，记录失败
        await mappingDB.incrementFailure(streamId, steamId);
        console.log(`❌ 刷新失败: ${streamId} → ${steamId}`);
        return { success: false, message: '抓取失败' };
      }

    } catch (error) {
      console.error(`❌ 刷新信号源失败:`, error.message);
      await mappingDB.incrementFailure(streamId, steamId);
      return { success: false, message: error.message };
    }
  }

  /**
   * 手动触发刷新指定比赛
   */
  async refreshMatch(streamId) {
    try {
      const mappings = await mappingDB.getMapping(streamId);
      
      if (!mappings || mappings.length === 0) {
        return { 
          success: false, 
          message: '未找到该比赛的映射数据' 
        };
      }

      let successCount = 0;
      for (const mapping of mappings) {
        const result = await this.refreshMatchSignal(
          mapping.stream_id,
          mapping.steam_id,
          mapping.domain
        );
        if (result.success) {
          successCount++;
        }
      }

      return {
        success: true,
        total: mappings.length,
        successCount,
        message: `刷新完成: ${successCount}/${mappings.length} 个频道成功`
      };

    } catch (error) {
      console.error('❌ 手动刷新失败:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 获取刷新器状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      refreshInterval: this.refreshInterval,
      batchSize: this.batchSize,
      nextRefreshIn: this.isRunning 
        ? `${Math.floor(this.refreshInterval / 1000 / 60)} 分钟`
        : 'N/A'
    };
  }

  /**
   * 辅助函数：延迟
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SignalRefresher;

