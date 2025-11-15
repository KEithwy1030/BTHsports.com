-- ============================================
-- 用户系统数据库表结构（简化版 - 兼容所有 MySQL 版本）
-- ============================================
-- 说明：此文件包含用户系统所需的所有数据库表
-- 执行方式：在现有数据库上执行此 SQL 文件
-- 注意：如果字段已存在，执行会报错，可以忽略错误继续执行

-- USE live_sports; -- 数据库名由连接配置决定，不需要 USE 语句

-- ============================================
-- 1. 扩展 users 表
-- ============================================
-- 添加昵称字段（如果已存在会报错，可以忽略）
ALTER TABLE users ADD COLUMN nickname VARCHAR(50) COMMENT '昵称，用于聊天区显示';

-- 添加头像字段
ALTER TABLE users ADD COLUMN avatar VARCHAR(255) COMMENT '头像URL';

-- 添加角色字段
ALTER TABLE users ADD COLUMN role ENUM('user', 'expert', 'admin') DEFAULT 'user' COMMENT '用户角色：普通用户/专家/管理员';

-- 添加最后登录时间字段
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL COMMENT '最后登录时间';

-- 如果 avatar_url 字段存在，迁移数据到 avatar
UPDATE users SET avatar = avatar_url WHERE avatar IS NULL AND avatar_url IS NOT NULL;

-- 创建索引（如果已存在会报错，可以忽略）
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_nickname ON users(nickname);

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
  match_id INT COMMENT '比赛ID（数据库ID，可为空）',
  match_identifier VARCHAR(100) COMMENT '比赛标识符（爬虫matchId，用于关联）',
  content VARCHAR(50) NOT NULL COMMENT '消息内容（最多50字）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_match_id (match_id),
  INDEX idx_match_identifier (match_identifier),
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

