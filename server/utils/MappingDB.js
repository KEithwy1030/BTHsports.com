const { pool } = require('../config/database');

/**
 * 信号源映射数据库操作类
 */
class MappingDB {
  /**
   * 批量保存映射关系
   * @param {string} streamId - 比赛ID
   * @param {Array} channels - 频道列表
   * @param {Object} matchInfo - 比赛信息（用于验证）
   */
  async saveMappings(streamId, channels, matchInfo = {}) {
    if (!channels || channels.length === 0) {
      console.warn(`⚠️ 保存映射失败: ${streamId} - 频道列表为空`);
      return { success: false, message: '频道列表为空' };
    }

    try {
      const values = [];
      const matchInfoJson = JSON.stringify({
        homeTeam: matchInfo.homeTeam,
        awayTeam: matchInfo.awayTeam,
        league: matchInfo.league,
        time: matchInfo.time
      });

      for (const channel of channels) {
        // 增强验证：检查steamId格式和频道有效性
        if (!channel.steamId || !channel.domain) {
          console.warn(`⚠️ 跳过无效频道: ${channel.name} (steamId: ${channel.steamId}, domain: ${channel.domain})`);
          continue;
        }
        
        // 验证steamId格式：必须是纯数字，4-8位
        if (!/^\d{4,8}$/.test(channel.steamId)) {
          console.warn(`⚠️ 跳过格式错误的steamId: ${channel.steamId}, 频道: ${channel.name}`);
          continue;
        }
        
        // 检查频道是否标记为有效
        if (channel.isValid === false) {
          console.warn(`⚠️ 跳过标记为无效的频道: ${channel.name}`);
          continue;
        }

        console.log(`✅ 保存映射: ${streamId} → steam${channel.steamId}, 频道: ${channel.name}`);
        values.push([
          streamId,
          channel.steamId,
          channel.channelIndex || 0,
          channel.name,
          channel.domain,
          channel.url,
          matchInfoJson
        ]);
      }

      if (values.length === 0) {
        console.warn(`⚠️ 保存映射失败: ${streamId} - 所有频道都没有steamId`);
        console.warn(`   频道数据:`, JSON.stringify(channels.slice(0, 2)));
        return { success: false, message: '没有有效的映射数据(无steamId)' };
      }

      const sql = `
        INSERT INTO stream_mappings 
        (stream_id, steam_id, channel_index, channel_name, domain, full_url, match_info)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          steam_id = VALUES(steam_id),
          channel_name = VALUES(channel_name),
          domain = VALUES(domain),
          full_url = VALUES(full_url),
          match_info = VALUES(match_info),
          updated_at = CURRENT_TIMESTAMP
      `;

      await pool.query(sql, [values]);
      
      console.log(`✅ 保存映射: ${streamId} → ${values.length}个频道`);
      
      return { 
        success: true, 
        count: values.length,
        message: `成功保存${values.length}个映射`
      };

    } catch (error) {
      console.error(`❌ 保存映射失败: ${streamId}`, error.message);
      console.error(`   完整错误:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * 查询映射关系
   * @param {string} streamId - 比赛ID
   * @param {number} channelIndex - 频道索引（可选）
   */
  async getMapping(streamId, channelIndex = null) {
    try {
      let sql, params;
      
      if (channelIndex !== null) {
        sql = `
          SELECT * FROM stream_mappings 
          WHERE stream_id = ? AND channel_index = ?
          ORDER BY success_count DESC
          LIMIT 1
        `;
        params = [streamId, channelIndex];
      } else {
        sql = `
          SELECT * FROM stream_mappings 
          WHERE stream_id = ?
          ORDER BY success_count DESC, channel_index ASC
        `;
        params = [streamId];
      }

      const [rows] = await pool.query(sql, params);
      
      if (channelIndex !== null) {
        return rows.length > 0 ? rows[0] : null;
      }
      
      return rows;

    } catch (error) {
      console.error('❌ 查询映射失败:', error.message);
      return null;
    }
  }

  /**
   * 更新成功计数
   */
  async incrementSuccess(streamId, steamId) {
    try {
      const sql = `
        UPDATE stream_mappings 
        SET success_count = success_count + 1,
            last_verified = CURRENT_TIMESTAMP
        WHERE stream_id = ? AND steam_id = ?
      `;
      await pool.query(sql, [streamId, steamId]);
      return true;
    } catch (error) {
      console.error('❌ 更新成功计数失败:', error.message);
      return false;
    }
  }

  /**
   * 更新失败计数
   */
  async incrementFailure(streamId, steamId) {
    try {
      const sql = `
        UPDATE stream_mappings 
        SET fail_count = fail_count + 1
        WHERE stream_id = ? AND steam_id = ?
      `;
      await pool.query(sql, [streamId, steamId]);
      return true;
    } catch (error) {
      console.error('❌ 更新失败计数失败:', error.message);
      return false;
    }
  }

  /**
   * 获取映射统计信息
   */
  async getStats() {
    try {
      const sql = `
        SELECT 
          COUNT(*) as total_mappings,
          COUNT(DISTINCT stream_id) as unique_streams,
          SUM(success_count) as total_success,
          SUM(fail_count) as total_fails,
          AVG(success_count / (success_count + fail_count + 1)) as success_rate
        FROM stream_mappings
        WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
      `;
      
      const [rows] = await pool.query(sql);
      return rows[0];
    } catch (error) {
      console.error('❌ 获取统计信息失败:', error.message);
      return null;
    }
  }

  /**
   * 获取需要刷新的映射（用于auth_key自动刷新）
   */
  async getMappingsToRefresh() {
    try {
      const sql = `
        SELECT DISTINCT stream_id, steam_id, domain, full_url
        FROM stream_mappings
        WHERE last_verified > DATE_SUB(NOW(), INTERVAL 2 HOUR)
        AND (last_verified IS NULL OR last_verified < DATE_SUB(NOW(), INTERVAL 20 MINUTE))
        ORDER BY last_verified ASC
        LIMIT 50
      `;
      
      const [rows] = await pool.query(sql);
      return rows;
    } catch (error) {
      console.error('❌ 获取待刷新映射失败:', error.message);
      return [];
    }
  }

  /**
   * 清理过期映射（7天前的数据）
   */
  async cleanupOldMappings() {
    try {
      const sql = `
        DELETE FROM stream_mappings
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND last_verified < DATE_SUB(NOW(), INTERVAL 3 DAY)
      `;
      
      const [result] = await pool.query(sql);
      console.log(`🧹 清理过期映射: ${result.affectedRows}条`);
      return result.affectedRows;
    } catch (error) {
      console.error('❌ 清理过期映射失败:', error.message);
      return 0;
    }
  }
}

module.exports = new MappingDB();

