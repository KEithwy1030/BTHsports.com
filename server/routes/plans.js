const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { notifyExpertPlanPublished } = require('../utils/notifications');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

const parseJSON = (payload, fallback = null) => {
  if (!payload) return fallback;
  try {
    return typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch (error) {
    return fallback;
  }
};

const mapArticleRow = (row, unlockedSet = new Set()) => {
  const matchSnapshot = parseJSON(row.match_snapshot, null);
  const summary =
    row.summary ||
    (row.content ? row.content.replace(/<[^>]+>/g, '').slice(0, 100).trim() + '…' : '');

  const expertWinRate =
    row.expert_win_rate !== null && row.expert_win_rate !== undefined
      ? Number(row.expert_win_rate)
      : null;

  return {
    id: row.id,
    matchId: row.match_id || matchSnapshot?.matchId || '',
    match: {
      ...matchSnapshot,
      league: matchSnapshot?.league || row.league || '',
      matchTime: matchSnapshot?.matchTime || row.published_at || null,
      homeTeam: matchSnapshot?.homeTeam || '',
      awayTeam: matchSnapshot?.awayTeam || ''
    },
    title: row.title,
    summary,
    priceKcoin: row.price_kcoin || 0,
    coverImage: row.cover_image || '',
    author: row.author || row.expert_name || '匿名专家',
    status: row.status,
    publishedAt: row.published_at,
    locked: !unlockedSet.has(row.id),
    expert: {
      name: row.expert_name || row.author || '匿名专家',
      title: row.expert_title || '',
      avatar: row.expert_avatar || '',
      winRate: expertWinRate,
      recentRecord: row.expert_recent_record || ''
    }
  };
};

const getUnlockedArticleIds = async ({ articleIds, userId, fingerprint }) => {
  if (!articleIds.length) return new Set();
  const conditions = [];
  const params = [articleIds];

  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }
  if (fingerprint) {
    conditions.push('device_fingerprint = ?');
    params.push(fingerprint);
  }

  if (!conditions.length) {
    return new Set();
  }

  const [rows] = await pool.query(
    `SELECT article_id FROM plan_unlock_logs WHERE article_id IN (?) AND (${conditions.join(' OR ')})`,
    params
  );

  return new Set(rows.map(row => row.article_id));
};

router.get('/', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || DEFAULT_PAGE, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 1), 50);
    const status = req.query.status || 'published';
    const fingerprint = req.query.fingerprint || null;
    const userId = req.query.userId ? Number(req.query.userId) : null;

    const whereClauses = ['is_deleted = 0'];
    const params = [];
    if (status) {
      whereClauses.push('status = ?');
      params.push(status);
    }
    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM plan_articles ${whereSQL}`,
      params
    );
    const total = countRow.total || 0;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
      `SELECT * FROM plan_articles ${whereSQL} ORDER BY COALESCE(published_at, created_at) DESC LIMIT ?, ?`,
      params.concat([offset, pageSize])
    );

    const articleIds = rows.map(row => row.id);
    const unlockedSet = await getUnlockedArticleIds({
      articleIds,
      userId,
      fingerprint
    });

    const items = rows.map(row => mapArticleRow(row, unlockedSet));

    res.json({
      code: 200,
      data: {
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    });
  } catch (error) {
    console.error('❌ 获取方案列表失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取方案列表失败',
      error: error.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const articleId = Number(req.params.id);
    if (!articleId) {
      return res.status(400).json({ code: 400, message: '缺少文章ID' });
    }

    const fingerprint = req.query.fingerprint || null;
    const userId = req.query.userId ? Number(req.query.userId) : null;

    const [rows] = await pool.query('SELECT * FROM plan_articles WHERE id = ? AND is_deleted = 0', [
      articleId
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '方案不存在' });
    }

    const row = rows[0];
    const unlockedSet = await getUnlockedArticleIds({
      articleIds: [row.id],
      userId,
      fingerprint
    });
    const payload = mapArticleRow(row, unlockedSet);

    if (!payload.locked) {
      payload.content = row.content || '';
    } else {
      payload.content = null;
    }

    res.json({ code: 200, data: payload });
  } catch (error) {
    console.error('❌ 获取方案详情失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取方案详情失败',
      error: error.message
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      matchId,
      matchSnapshot,
      title,
      summary,
      content,
      priceKcoin = 0,
      coverImage = '',
      author = '匿名专家',
      status = 'draft',
      publishedAt = null,
      expert = {}
    } = req.body || {};

    if (!matchId || !title) {
      return res.status(400).json({ code: 400, message: '缺少必要参数: matchId 或 title' });
    }

    const insertSQL = `
      INSERT INTO plan_articles (
        match_id,
        match_snapshot,
        title,
        cover_image,
        price_kcoin,
        summary,
        content,
        author,
        expert_name,
        expert_title,
        expert_avatar,
        expert_win_rate,
        expert_recent_record,
        status,
        published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      matchId,
      matchSnapshot ? JSON.stringify(matchSnapshot) : null,
      title,
      coverImage,
      priceKcoin,
      summary || null,
      content || '',
      author,
      expert.name || author || '匿名专家',
      expert.title || null,
      expert.avatar || null,
      expert.winRate !== undefined && expert.winRate !== null ? expert.winRate : null,
      expert.recentRecord || null,
      status,
      publishedAt
    ];

    const [result] = await pool.query(insertSQL, params);
    const planId = result.insertId;

    // 如果方案已发布，通知关注该专家的用户
    if (status === 'published' && author) {
      // 根据author查找专家ID（假设author是用户名）
      try {
        const [users] = await pool.query(
          'SELECT id FROM users WHERE username = ? AND role = ?',
          [author, 'expert']
        );
        
        if (users.length > 0) {
          const expertId = users[0].id;
          // 异步发送通知，不阻塞响应
          notifyExpertPlanPublished(expertId, planId, title).catch(err => {
            console.error('发送通知失败:', err);
          });
        }
      } catch (error) {
        console.error('查找专家ID失败:', error);
      }
    }

    res.json({
      code: 200,
      message: '方案创建成功',
      data: { id: planId }
    });
  } catch (error) {
    console.error('❌ 创建方案失败:', error);
    res.status(500).json({
      code: 500,
      message: '创建方案失败',
      error: error.message
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const articleId = Number(req.params.id);
    if (!articleId) {
      return res.status(400).json({ code: 400, message: '缺少文章ID' });
    }

    const {
      matchId,
      matchSnapshot,
      title,
      summary,
      content,
      priceKcoin,
      coverImage,
      author,
      status,
      publishedAt,
      expert = {}
    } = req.body || {};

    const fields = [];
    const params = [];

    if (matchId !== undefined) {
      fields.push('match_id = ?');
      params.push(matchId);
    }
    if (matchSnapshot !== undefined) {
      fields.push('match_snapshot = ?');
      params.push(matchSnapshot ? JSON.stringify(matchSnapshot) : null);
    }
    if (title !== undefined) {
      fields.push('title = ?');
      params.push(title);
    }
    if (summary !== undefined) {
      fields.push('summary = ?');
      params.push(summary);
    }
    if (content !== undefined) {
      fields.push('content = ?');
      params.push(content);
    }
    if (priceKcoin !== undefined) {
      fields.push('price_kcoin = ?');
      params.push(priceKcoin);
    }
    if (coverImage !== undefined) {
      fields.push('cover_image = ?');
      params.push(coverImage);
    }
    if (author !== undefined) {
      fields.push('author = ?');
      params.push(author);
    }
    if (status !== undefined) {
      fields.push('status = ?');
      params.push(status);
    }
    if (publishedAt !== undefined) {
      fields.push('published_at = ?');
      params.push(publishedAt);
    }

    if (expert) {
      if (expert.name !== undefined) {
        fields.push('expert_name = ?');
        params.push(expert.name);
      }
      if (expert.title !== undefined) {
        fields.push('expert_title = ?');
        params.push(expert.title);
      }
      if (expert.avatar !== undefined) {
        fields.push('expert_avatar = ?');
        params.push(expert.avatar);
      }
      if (expert.winRate !== undefined) {
        fields.push('expert_win_rate = ?');
        params.push(expert.winRate);
      }
      if (expert.recentRecord !== undefined) {
        fields.push('expert_recent_record = ?');
        params.push(expert.recentRecord);
      }
    }

    if (!fields.length) {
      return res.status(400).json({ code: 400, message: '没有可更新的字段' });
    }

    params.push(articleId);

    await pool.query(
      `UPDATE plan_articles SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params
    );

    res.json({ code: 200, message: '方案更新成功' });
  } catch (error) {
    console.error('❌ 更新方案失败:', error);
    res.status(500).json({
      code: 500,
      message: '更新方案失败',
      error: error.message
    });
  }
});

router.post('/:id/unlock', async (req, res) => {
  try {
    const articleId = Number(req.params.id);
    if (!articleId) {
      return res.status(400).json({ code: 400, message: '缺少文章ID' });
    }

    const { userId = null, fingerprint = null, kcoinSpent = 0 } = req.body || {};

    if (!userId && !fingerprint) {
      return res.status(400).json({
        code: 400,
        message: '解锁至少需要 userId 或 fingerprint'
      });
    }

    const [existsRows] = await pool.query(
      'SELECT id FROM plan_articles WHERE id = ? AND is_deleted = 0',
      [articleId]
    );
    if (existsRows.length === 0) {
      return res.status(404).json({ code: 404, message: '方案不存在' });
    }

    const insertSQL = `
      INSERT INTO plan_unlock_logs (article_id, user_id, device_fingerprint, kcoin_spent)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE kcoin_spent = VALUES(kcoin_spent)
    `;

    await pool.query(insertSQL, [articleId, userId, fingerprint, kcoinSpent]);

    res.json({
      code: 200,
      message: '方案解锁状态已记录'
    });
  } catch (error) {
    console.error('❌ 记录方案解锁失败:', error);
    res.status(500).json({
      code: 500,
      message: '记录解锁行为失败',
      error: error.message
    });
  }
});

module.exports = router;

