-- ============================================
-- 用户系统数据库表结构
-- ============================================
-- 说明：此文件包含用户系统所需的所有数据库表
-- 执行方式：在现有数据库上执行此 SQL 文件
-- 注意：如果表已存在，会使用 ALTER TABLE 添加缺失的字段

USE live_sports;

-- ============================================
-- 1. 扩展 users 表
-- ============================================
-- 注意：MySQL 5.7+ 不支持 IF NOT EXISTS，需要手动检查
-- 如果字段已存在，会报错但可以忽略

-- 添加昵称字段
SET @dbname = DATABASE();
SET @tablename = 'users';
SET @columnname = 'nickname';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1', -- 字段已存在，不执行
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(50) COMMENT ''昵称，用于聊天区显示''')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 添加头像字段
SET @columnname = 'avatar';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(255) COMMENT ''头像URL''')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 添加角色字段
SET @columnname = 'role';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' ENUM(''user'', ''expert'', ''admin'') DEFAULT ''user'' COMMENT ''用户角色：普通用户/专家/管理员''')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 添加最后登录时间字段
SET @columnname = 'last_login_at';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' TIMESTAMP NULL COMMENT ''最后登录时间''')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 如果 avatar_url 字段存在，迁移数据到 avatar
-- 注意：需要先检查 avatar_url 字段是否存在
SET @columnname = 'avatar_url';
SET @has_avatar_url = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE
    (table_name = @tablename)
    AND (table_schema = @dbname)
    AND (column_name = @columnname)
);
SET @preparedStatement = IF(
  @has_avatar_url > 0,
  'UPDATE users SET avatar = avatar_url WHERE avatar IS NULL AND avatar_url IS NOT NULL',
  'SELECT 1'
);
PREPARE migrateAvatar FROM @preparedStatement;
EXECUTE migrateAvatar;
DEALLOCATE PREPARE migrateAvatar;

-- 创建索引（如果不存在）
-- 注意：MySQL 5.7+ 不支持 IF NOT EXISTS，需要手动检查
SET @indexname = 'idx_users_role';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      (table_name = 'users')
      AND (table_schema = DATABASE())
      AND (index_name = @indexname)
  ) > 0,
  'SELECT 1',
  'CREATE INDEX idx_users_role ON users(role)'
));
PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

SET @indexname = 'idx_users_nickname';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      (table_name = 'users')
      AND (table_schema = DATABASE())
      AND (index_name = @indexname)
  ) > 0,
  'SELECT 1',
  'CREATE INDEX idx_users_nickname ON users(nickname)'
));
PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

-- ============================================
-- 2. 用户会话表
-- ============================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token VARCHAR(500) NOT NULL COMMENT 'JWT Token',
  refresh_token VARCHAR(500) COMMENT 'Refresh Token',
  device_info VARCHAR(255) COMMENT '设备信息',
  ip_address VARCHAR(50) COMMENT 'IP地址',
  expires_at TIMESTAMP NOT NULL COMMENT '过期时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_token (token(100)),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户会话表';

-- 清理过期会话的定时任务（可选，可以在应用层实现）
-- DELETE FROM user_sessions WHERE expires_at < NOW();

-- ============================================
-- 3. 关注专家表
-- ============================================
CREATE TABLE IF NOT EXISTS user_follows (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '关注者用户ID',
  expert_id INT NOT NULL COMMENT '被关注的专家用户ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (expert_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user_expert (user_id, expert_id) COMMENT '防止重复关注',
  INDEX idx_user_id (user_id),
  INDEX idx_expert_id (expert_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户关注专家表';

-- ============================================
-- 4. 专家申请表
-- ============================================
CREATE TABLE IF NOT EXISTS expert_applications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '申请用户ID',
  application_reason TEXT COMMENT '申请理由',
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT '审核状态：待审核/已通过/已拒绝',
  admin_id INT COMMENT '审核管理员ID',
  reviewed_at TIMESTAMP NULL COMMENT '审核时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='专家申请表';

-- ============================================
-- 5. 比赛聊天消息表
-- ============================================
CREATE TABLE IF NOT EXISTS user_chat_messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '发送用户ID',
  match_id INT NOT NULL COMMENT '比赛ID',
  content VARCHAR(50) NOT NULL COMMENT '消息内容（最多50字）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_match_id (match_id),
  INDEX idx_created_at (created_at),
  INDEX idx_match_created (match_id, created_at) COMMENT '用于查询和清理'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='比赛聊天消息表（开赛时间超过5小时后自动清除）';

-- ============================================
-- 6. 用户评论表（方案评论）
-- ============================================
CREATE TABLE IF NOT EXISTS user_comments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '评论用户ID',
  target_type ENUM('plan') DEFAULT 'plan' COMMENT '评论目标类型',
  target_id INT NOT NULL COMMENT '评论目标ID（方案ID）',
  content TEXT NOT NULL COMMENT '评论内容',
  parent_id INT DEFAULT NULL COMMENT '父评论ID（二级评论）',
  likes INT DEFAULT 0 COMMENT '点赞数',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES user_comments(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_target (target_type, target_id),
  INDEX idx_parent_id (parent_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户评论表（方案评论）';

-- ============================================
-- 7. 用户通知表
-- ============================================
CREATE TABLE IF NOT EXISTS user_notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '接收用户ID',
  type ENUM('system', 'expert_plan', 'comment_reply') NOT NULL COMMENT '通知类型：系统通知/专家发布方案/评论回复',
  title VARCHAR(255) NOT NULL COMMENT '通知标题',
  content TEXT COMMENT '通知内容',
  is_read BOOLEAN DEFAULT FALSE COMMENT '是否已读',
  related_id INT COMMENT '关联ID（如方案ID）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read),
  INDEX idx_created_at (created_at),
  INDEX idx_user_read (user_id, is_read, created_at) COMMENT '用于查询未读通知'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户通知表';

-- ============================================
-- 8. 用户设置表
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL COMMENT '用户ID',
  setting_key VARCHAR(50) NOT NULL COMMENT '设置键',
  setting_value JSON COMMENT '设置值（JSON格式）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user_key (user_id, setting_key) COMMENT '每个用户的每个设置唯一',
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户设置表';

-- ============================================
-- 9. 发言频率限制表（用于聊天区防刷屏）
-- ============================================
-- 注意：此表用于记录用户最后发言时间，实现每10秒最多1条的限制
-- 可以使用 Redis 替代，但为了简单，先用数据库表
CREATE TABLE IF NOT EXISTS user_chat_rate_limit (
  user_id INT PRIMARY KEY,
  last_message_at TIMESTAMP NOT NULL COMMENT '最后发言时间',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天发言频率限制表';

-- ============================================
-- 完成提示
-- ============================================
SELECT '✅ 用户系统数据库表结构创建完成！' AS message;

