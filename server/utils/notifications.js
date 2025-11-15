/**
 * 通知工具函数
 */

const { pool } = require('../config/database');

/**
 * 通知关注专家的用户：专家发布了新方案
 * @param {number} expertId - 专家用户ID
 * @param {number} planId - 方案ID
 * @param {string} planTitle - 方案标题
 */
async function notifyExpertPlanPublished(expertId, planId, planTitle) {
  try {
    // 获取所有关注该专家的用户
    const [followers] = await pool.query(
      'SELECT user_id FROM user_follows WHERE expert_id = ?',
      [expertId]
    );

    if (followers.length === 0) {
      console.log(`📢 专家 ${expertId} 发布方案，但无关注者`);
      return;
    }

    // 获取专家信息
    const [experts] = await pool.query(
      'SELECT username, nickname FROM users WHERE id = ?',
      [expertId]
    );

    if (experts.length === 0) {
      console.error(`❌ 专家 ${expertId} 不存在`);
      return;
    }

    const expert = experts[0];
    const expertName = expert.nickname || expert.username;

    // 为每个关注者创建通知
    const notifications = followers.map(follower => ({
      user_id: follower.user_id,
      type: 'expert_plan',
      title: `${expertName} 发布了新方案`,
      content: `您关注的专家 ${expertName} 发布了新方案：《${planTitle}》`,
      related_id: planId,
      is_read: false
    }));

    // 批量插入通知（使用参数化查询避免SQL注入）
    if (notifications.length > 0) {
      const insertPromises = notifications.map(n => 
        pool.query(
          `INSERT INTO user_notifications (user_id, type, title, content, related_id, is_read) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [n.user_id, n.type, n.title, n.content, n.related_id, n.is_read]
        )
      );

      await Promise.all(insertPromises);
      console.log(`📢 已通知 ${notifications.length} 位用户：专家 ${expertName} 发布了新方案`);
    }
  } catch (error) {
    console.error('❌ 发送专家方案通知失败:', error);
    // 不抛出错误，避免影响方案发布流程
  }
}

/**
 * 创建系统通知
 * @param {number} userId - 用户ID
 * @param {string} title - 通知标题
 * @param {string} content - 通知内容
 * @param {string} type - 通知类型
 * @param {number} relatedId - 关联ID（可选）
 */
async function createNotification(userId, title, content, type = 'system', relatedId = null) {
  try {
    await pool.query(
      `INSERT INTO user_notifications (user_id, type, title, content, related_id, is_read) 
       VALUES (?, ?, ?, ?, ?, 0)`,
      [userId, type, title, content, relatedId]
    );
  } catch (error) {
    console.error('❌ 创建通知失败:', error);
  }
}

module.exports = {
  notifyExpertPlanPublished,
  createNotification
};

