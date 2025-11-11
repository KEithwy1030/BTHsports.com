const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

/**
 * 初始化数据库表
 * POST /api/admin/init-database
 */
router.post('/init-database', async (req, res) => {
  try {
    console.log('🔧 开始初始化数据库...');

    const createRecommendationsTableSQL = `
      CREATE TABLE IF NOT EXISTS plan_articles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        match_id VARCHAR(64) NOT NULL COMMENT '关联的比赛ID',
        match_snapshot JSON NULL COMMENT '比赛信息快照',
        title VARCHAR(255) NOT NULL,
        cover_image VARCHAR(255),
        price_kcoin INT DEFAULT 0 COMMENT '解锁所需K币',
        summary TEXT COMMENT '文章摘要',
        content MEDIUMTEXT COMMENT '文章内容HTML',
        author VARCHAR(100) DEFAULT '匿名专家',
        expert_name VARCHAR(100) DEFAULT NULL,
        expert_title VARCHAR(100) DEFAULT NULL,
        expert_avatar VARCHAR(255) DEFAULT NULL,
        expert_win_rate DECIMAL(5,2) DEFAULT NULL,
        expert_recent_record VARCHAR(100) DEFAULT NULL,
        status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
        published_at DATETIME NULL,
        is_deleted TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_match_id (match_id),
        INDEX idx_status (status),
        INDEX idx_published_at (published_at),
        INDEX idx_is_deleted (is_deleted)
      ) COMMENT='方案推荐文章表';
    `;

    const createUnlockLogTableSQL = `
      CREATE TABLE IF NOT EXISTS plan_unlock_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        article_id INT NOT NULL,
        user_id INT DEFAULT NULL,
        device_fingerprint VARCHAR(128) DEFAULT NULL,
        kcoin_spent INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_article (user_id, article_id),
        INDEX idx_article_id (article_id),
        INDEX idx_user_id (user_id),
        INDEX idx_fingerprint (device_fingerprint),
        CONSTRAINT fk_plan_unlock_article FOREIGN KEY (article_id) REFERENCES plan_articles(id) ON DELETE CASCADE
      ) COMMENT='方案文章解锁记录表';
    `;

    await pool.query(createRecommendationsTableSQL);
    console.log('✅ plan_articles 表创建完成');
    await pool.query(createUnlockLogTableSQL);
    console.log('✅ plan_unlock_logs 表创建完成');

    // 对已有表执行列增强
    const alterStatements = [
      `ALTER TABLE plan_articles ADD COLUMN IF NOT EXISTS match_snapshot JSON NULL AFTER match_id`,
      `ALTER TABLE plan_articles ADD COLUMN IF NOT EXISTS expert_name VARCHAR(100) NULL AFTER author`,
      `ALTER TABLE plan_articles ADD COLUMN IF NOT EXISTS expert_title VARCHAR(100) NULL AFTER expert_name`,
      `ALTER TABLE plan_articles ADD COLUMN IF NOT EXISTS expert_avatar VARCHAR(255) NULL AFTER expert_title`,
      `ALTER TABLE plan_articles ADD COLUMN IF NOT EXISTS expert_win_rate DECIMAL(5,2) NULL AFTER expert_avatar`,
      `ALTER TABLE plan_articles ADD COLUMN IF NOT EXISTS expert_recent_record VARCHAR(100) NULL AFTER expert_win_rate`,
      `ALTER TABLE plan_articles ADD COLUMN IF NOT EXISTS cover_image VARCHAR(255) NULL AFTER title`,
      `ALTER TABLE plan_articles ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) DEFAULT 0 AFTER status`,
      `ALTER TABLE plan_unlock_logs ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(128) NULL`
    ];

    for (const sql of alterStatements) {
      try {
        await pool.query(sql);
      } catch (err) {
        console.warn(`⚠️ 列更新可能已存在: ${err.message}`);
      }
    }

    // 为指纹解锁增加唯一索引
    try {
      await pool.query(`ALTER TABLE plan_unlock_logs ADD UNIQUE KEY uniq_device_article (device_fingerprint, article_id)`);
    } catch (err) {
      if (!/Duplicate key name/.test(err.message)) {
        console.warn(`⚠️ 创建指纹唯一索引失败: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: '计划推荐相关表已初始化完成'
    });

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.toString()
    });
  }
});

module.exports = router;

