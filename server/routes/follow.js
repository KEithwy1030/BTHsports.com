/**
 * 关注专家路由
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateUser } = require('../utils/auth');

/**
 * 获取专家列表
 * GET /api/follow/experts
 * Query: { page, limit, keyword }
 */
router.get('/experts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const keyword = req.query.keyword || '';
    const offset = (page - 1) * limit;

    let whereClause = "WHERE role = 'expert'";
    const params = [];

    if (keyword) {
      whereClause += " AND (username LIKE ? OR nickname LIKE ?)";
      const keywordPattern = `%${keyword}%`;
      params.push(keywordPattern, keywordPattern);
    }

    // 获取总数
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // 获取专家列表
    const [experts] = await pool.query(
      `SELECT id, username, nickname, avatar, role, created_at 
       FROM users 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // 处理头像 URL
    const expertsList = experts.map(expert => ({
      id: expert.id,
      username: expert.username,
      nickname: expert.nickname || expert.username,
      avatar: expert.avatar || null,
      role: expert.role,
      createdAt: expert.created_at
    }));

    res.json({
      success: true,
      data: {
        experts: expertsList,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取专家列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取专家列表失败'
    });
  }
});

/**
 * 获取当前用户关注的专家列表
 * GET /api/follow/following
 */
router.get('/following', authenticateUser, async (req, res) => {
  try {
    const [follows] = await pool.query(
      `SELECT uf.id, uf.expert_id, uf.created_at,
              u.id as user_id, u.username, u.nickname, u.avatar, u.role
       FROM user_follows uf
       JOIN users u ON uf.expert_id = u.id
       WHERE uf.user_id = ?
       ORDER BY uf.created_at DESC`,
      [req.user.id]
    );

    const followingList = follows.map(follow => ({
      id: follow.expert_id,
      username: follow.username,
      nickname: follow.nickname || follow.username,
      avatar: follow.avatar || null,
      role: follow.role,
      followedAt: follow.created_at
    }));

    res.json({
      success: true,
      data: {
        experts: followingList
      }
    });
  } catch (error) {
    console.error('获取关注列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取关注列表失败'
    });
  }
});

/**
 * 关注专家
 * POST /api/follow/:expertId
 */
router.post('/:expertId', authenticateUser, async (req, res) => {
  try {
    const expertId = parseInt(req.params.expertId);
    const userId = req.user.id;

    if (expertId === userId) {
      return res.status(400).json({
        success: false,
        message: '不能关注自己'
      });
    }

    // 检查专家是否存在且是专家角色
    const [experts] = await pool.query(
      'SELECT id, role FROM users WHERE id = ?',
      [expertId]
    );

    if (experts.length === 0) {
      return res.status(404).json({
        success: false,
        message: '专家不存在'
      });
    }

    if (experts[0].role !== 'expert') {
      return res.status(400).json({
        success: false,
        message: '该用户不是专家'
      });
    }

    // 检查是否已关注
    const [existing] = await pool.query(
      'SELECT id FROM user_follows WHERE user_id = ? AND expert_id = ?',
      [userId, expertId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: '已关注该专家'
      });
    }

    // 添加关注
    await pool.query(
      'INSERT INTO user_follows (user_id, expert_id) VALUES (?, ?)',
      [userId, expertId]
    );

    res.json({
      success: true,
      message: '关注成功'
    });
  } catch (error) {
    console.error('关注专家失败:', error);
    
    // 处理唯一约束错误
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: '已关注该专家'
      });
    }

    res.status(500).json({
      success: false,
      message: '关注专家失败'
    });
  }
});

/**
 * 取消关注专家
 * DELETE /api/follow/:expertId
 */
router.delete('/:expertId', authenticateUser, async (req, res) => {
  try {
    const expertId = parseInt(req.params.expertId);
    const userId = req.user.id;

    const [result] = await pool.query(
      'DELETE FROM user_follows WHERE user_id = ? AND expert_id = ?',
      [userId, expertId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '未关注该专家'
      });
    }

    res.json({
      success: true,
      message: '取消关注成功'
    });
  } catch (error) {
    console.error('取消关注失败:', error);
    res.status(500).json({
      success: false,
      message: '取消关注失败'
    });
  }
});

/**
 * 检查是否关注了某个专家
 * GET /api/follow/check/:expertId
 */
router.get('/check/:expertId', authenticateUser, async (req, res) => {
  try {
    const expertId = parseInt(req.params.expertId);
    const userId = req.user.id;

    const [follows] = await pool.query(
      'SELECT id FROM user_follows WHERE user_id = ? AND expert_id = ?',
      [userId, expertId]
    );

    res.json({
      success: true,
      data: {
        isFollowing: follows.length > 0
      }
    });
  } catch (error) {
    console.error('检查关注状态失败:', error);
    res.status(500).json({
      success: false,
      message: '检查关注状态失败'
    });
  }
});

/**
 * 批量检查关注状态
 * POST /api/follow/check-batch
 * Body: { expertIds: [1, 2, 3] }
 */
router.post('/check-batch', authenticateUser, async (req, res) => {
  try {
    const { expertIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(expertIds) || expertIds.length === 0) {
      return res.json({
        success: true,
        data: {
          followingMap: {}
        }
      });
    }

    const placeholders = expertIds.map(() => '?').join(',');
    const [follows] = await pool.query(
      `SELECT expert_id FROM user_follows 
       WHERE user_id = ? AND expert_id IN (${placeholders})`,
      [userId, ...expertIds]
    );

    const followingMap = {};
    expertIds.forEach(id => {
      followingMap[id] = false;
    });
    follows.forEach(follow => {
      followingMap[follow.expert_id] = true;
    });

    res.json({
      success: true,
      data: {
        followingMap
      }
    });
  } catch (error) {
    console.error('批量检查关注状态失败:', error);
    res.status(500).json({
      success: false,
      message: '批量检查关注状态失败'
    });
  }
});

module.exports = router;

