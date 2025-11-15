/**
 * 比赛聊天区路由
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateUser } = require('../utils/auth');
const { filterSensitiveWords } = require('../utils/sensitiveWords');

// 存储 SSE 连接（按比赛ID分组）
const sseConnections = new Map(); // Map<matchId, Set<response>>

/**
 * 获取聊天历史消息
 * GET /api/chat/:matchId/history
 * Query: { limit = 50 }
 * 注意：matchId可以是数据库id或爬虫的matchId（通过match_url关联）
 */
router.get('/:matchId/history', async (req, res) => {
  try {
    const matchId = req.params.matchId;
    const limit = parseInt(req.query.limit) || 50;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: '比赛ID无效'
      });
    }

    // 先尝试作为数据库ID查找
    let dbMatchId = parseInt(matchId);
    let isNumericId = !isNaN(dbMatchId);
    
    // 获取最近的消息（支持数据库ID或match_identifier）
    let messages;
    if (isNumericId) {
      [messages] = await pool.query(
        `SELECT 
          cm.id,
          cm.user_id,
          cm.match_id,
          cm.content,
          cm.created_at,
          u.nickname,
          u.avatar,
          u.username
         FROM user_chat_messages cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.match_id = ?
         ORDER BY cm.created_at DESC
         LIMIT ?`,
        [dbMatchId, limit]
      );
    } else {
      // 使用match_identifier查找
      [messages] = await pool.query(
        `SELECT 
          cm.id,
          cm.user_id,
          cm.match_id,
          cm.content,
          cm.created_at,
          u.nickname,
          u.avatar,
          u.username
         FROM user_chat_messages cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.match_identifier = ?
         ORDER BY cm.created_at DESC
         LIMIT ?`,
        [matchId, limit]
      );
    }

    // 反转顺序（从旧到新）
    messages.reverse();

    res.json({
      success: true,
      data: {
        messages: messages.map(msg => ({
          id: msg.id,
          userId: msg.user_id,
          matchId: msg.match_id,
          content: msg.content,
          nickname: msg.nickname || msg.username,
          avatar: msg.avatar,
          createdAt: msg.created_at
        }))
      }
    });
  } catch (error) {
    console.error('获取聊天历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取聊天历史失败'
    });
  }
});

/**
 * 发送聊天消息
 * POST /api/chat/:matchId/message
 * Body: { content }
 */
router.post('/:matchId/message', authenticateUser, async (req, res) => {
  try {
    const matchId = req.params.matchId; // 支持数字ID和字符串matchId
    let { content } = req.body;
    const userId = req.user.id;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: '比赛ID无效'
      });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        message: '消息内容不能为空'
      });
    }

    // 去除首尾空格
    content = content.trim();

    // 验证字数限制（最多50字）
    if (content.length === 0) {
      return res.status(400).json({
        success: false,
        message: '消息内容不能为空'
      });
    }

    if (content.length > 50) {
      return res.status(400).json({
        success: false,
        message: '消息内容不能超过50个字符'
      });
    }

    // 检查发言频率限制（每10秒最多1条）
    const [rateLimit] = await pool.query(
      'SELECT last_message_at FROM user_chat_rate_limit WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (rateLimit.length > 0 && rateLimit[0].last_message_at) {
      const lastMessageAt = new Date(rateLimit[0].last_message_at);
      const now = new Date();
      const timeDiff = (now - lastMessageAt) / 1000; // 秒

      if (timeDiff < 10) {
        return res.status(429).json({
          success: false,
          message: `发言过于频繁，请${Math.ceil(10 - timeDiff)}秒后再试`
        });
      }
    }

    // 验证比赛是否存在并获取比赛开始时间（简化版：只查数据库，不调用爬虫）
    // 逻辑：允许赛前讨论、赛中讨论；比赛结束超过5小时不允许发言
    let dbMatchId = parseInt(matchId);
    let isNumericId = !isNaN(dbMatchId);
    let startTime = null;
    
    // 尝试从数据库获取比赛时间（只查一次，简单快速）
    if (isNumericId) {
      const [matches] = await pool.query(
        'SELECT id, start_time FROM matches WHERE id = ? LIMIT 1',
        [dbMatchId]
      );
      if (matches.length > 0) {
        dbMatchId = matches[0].id;
        startTime = matches[0].start_time;
      }
    } else {
      const [matchesByUrl] = await pool.query(
        'SELECT id, start_time FROM matches WHERE match_url LIKE ? OR match_url = ? OR match_identifier = ? LIMIT 1',
        [`%${matchId}%`, matchId, matchId]
      );
      if (matchesByUrl.length > 0) {
        dbMatchId = matchesByUrl[0].id;
        startTime = matchesByUrl[0].start_time;
      }
    }

    // 检查比赛时间限制（只在数据库有记录时检查）
    if (startTime) {
      const startTimeDate = new Date(startTime);
      const now = new Date();
      const hoursDiff = (now - startTimeDate) / (1000 * 60 * 60);
      
      // 比赛开始时间在未来：允许发言（赛前讨论）
      // 比赛开始时间在过去但在5小时内：允许发言（赛中/赛后讨论）
      // 比赛开始时间在过去且超过5小时：不允许发言
      if (startTimeDate <= now && hoursDiff > 5) {
        return res.status(400).json({
          success: false,
          message: '比赛已结束'
        });
      }
    }
    // 如果数据库没有记录，允许发言（前端已做主要判断，这里只做兜底）

    // 过滤敏感词
    content = filterSensitiveWords(content);

    // 保存消息到数据库（支持数据库ID或match_identifier）
    let result;
    if (dbMatchId) {
      // 有数据库ID，使用match_id
      [result] = await pool.query(
        'INSERT INTO user_chat_messages (user_id, match_id, match_identifier, content) VALUES (?, ?, ?, ?)',
        [userId, dbMatchId, matchId, content]
      );
    } else {
      // 没有数据库ID，只使用match_identifier
      [result] = await pool.query(
        'INSERT INTO user_chat_messages (user_id, match_identifier, content) VALUES (?, ?, ?)',
        [userId, matchId, content]
      );
    }

    // 更新或插入频率限制记录
    await pool.query(
      `INSERT INTO user_chat_rate_limit (user_id, last_message_at) 
       VALUES (?, NOW()) 
       ON DUPLICATE KEY UPDATE last_message_at = NOW()`,
      [userId]
    );

    // 获取用户信息
    const [users] = await pool.query(
      'SELECT id, username, nickname, avatar FROM users WHERE id = ?',
      [userId]
    );

    const user = users[0];
    const message = {
      id: result.insertId,
      userId: userId,
      matchId: dbMatchId,
      content: content,
      nickname: user.nickname || user.username,
      avatar: user.avatar,
      createdAt: new Date()
    };

    // 广播消息给所有连接的客户端（使用原始matchId作为key）
    broadcastMessage(matchId, message);

    res.json({
      success: true,
      message: '消息发送成功',
      data: { message }
    });
  } catch (error) {
    console.error('发送消息失败:', error);
    console.error('错误详情:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      sqlState: error.sqlState
    });
    
    // 根据错误类型返回更具体的错误信息
    let errorMessage = '发送消息失败';
    if (error.code === 'ER_NO_SUCH_TABLE') {
      errorMessage = '数据库表不存在，请联系管理员';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      errorMessage = '数据库连接失败，请稍后重试';
    } else if (error.code === 'ER_DUP_ENTRY') {
      errorMessage = '消息重复发送，请稍后再试';
    } else if (error.sqlState) {
      errorMessage = `数据库错误：${error.message}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
});

/**
 * SSE 连接：实时接收聊天消息
 * GET /api/chat/:matchId/stream
 * 注意：matchId可以是数据库id或爬虫的matchId
 */
router.get('/:matchId/stream', (req, res) => {
  try {
    const matchId = req.params.matchId;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: '比赛ID无效'
      });
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲

    // 发送初始连接消息
    res.write(`data: ${JSON.stringify({ type: 'connected', matchId })}\n\n`);

    // 将连接添加到对应比赛的连接集合
    if (!sseConnections.has(matchId)) {
      sseConnections.set(matchId, new Set());
    }
    sseConnections.get(matchId).add(res);

    // 客户端断开连接时清理
    req.on('close', () => {
      const connections = sseConnections.get(matchId);
      if (connections) {
        connections.delete(res);
        if (connections.size === 0) {
          sseConnections.delete(matchId);
        }
      }
    });
  } catch (error) {
    console.error('SSE 连接失败:', error);
    res.status(500).json({
      success: false,
      message: '连接失败'
    });
  }
});

/**
 * 广播消息给所有连接的客户端
 * @param {number} matchId - 比赛ID
 * @param {object} message - 消息对象
 */
function broadcastMessage(matchId, message) {
  const connections = sseConnections.get(matchId);
  if (!connections || connections.size === 0) {
    return;
  }

  const data = JSON.stringify({
    type: 'message',
    data: message
  });

  // 发送给所有连接的客户端
  connections.forEach(res => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (error) {
      console.error('发送SSE消息失败:', error);
      // 连接已断开，从集合中移除
      connections.delete(res);
    }
  });
}

/**
 * 清理过期聊天记录（定时任务调用）
 * 删除创建时间超过7天的聊天记录（保留最近一周的讨论）
 */
async function cleanupExpiredChatMessages() {
  try {
    // 清理所有超过7天的聊天记录（无论是否有match_id）
    const [result] = await pool.query(
      `DELETE FROM user_chat_messages 
       WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    if (result.affectedRows > 0) {
      console.log(`🧹 清理了 ${result.affectedRows} 条过期聊天记录（超过7天）`);
    }

    // 同时清理频率限制表中的过期记录（超过1小时未发言）
    await pool.query(
      'DELETE FROM user_chat_rate_limit WHERE last_message_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)'
    );
  } catch (error) {
    console.error('清理过期聊天记录失败:', error);
  }
}

// 导出清理函数供定时任务使用
module.exports = {
  router,
  cleanupExpiredChatMessages,
  broadcastMessage
};

