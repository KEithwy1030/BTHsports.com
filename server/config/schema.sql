CREATE DATABASE IF NOT EXISTS BTHsprots CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE BTHsprots;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 比赛表
CREATE TABLE IF NOT EXISTS matches (
  id INT PRIMARY KEY AUTO_INCREMENT,
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  league VARCHAR(50) NOT NULL,
  match_time DATETIME NOT NULL,
  status ENUM('upcoming', 'live', 'finished') DEFAULT 'upcoming',
  home_score INT DEFAULT 0,
  away_score INT DEFAULT 0,
  home_logo VARCHAR(255),
  away_logo VARCHAR(255),
  match_url VARCHAR(255),
  source_platform VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_match_time (match_time),
  INDEX idx_status (status),
  INDEX idx_league (league)
);

CREATE TABLE IF NOT EXISTS live_sources (
  id INT PRIMARY KEY AUTO_INCREMENT,
  match_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  source_type ENUM('jrkan', 'proxy') NOT NULL,
  quality_score INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  last_check TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  INDEX idx_match_id (match_id),
  INDEX idx_source_type (source_type),
  INDEX idx_is_active (is_active)
);

-- 用户观看记录表
CREATE TABLE IF NOT EXISTS user_watch_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  match_id INT NOT NULL,
  source_id INT NOT NULL,
  watch_duration INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES live_sources(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_match_id (match_id)
);

-- 爬虫日志表
CREATE TABLE IF NOT EXISTS crawler_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  platform VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  status ENUM('success', 'error', 'warning') NOT NULL,
  message TEXT,
  data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_platform (platform),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

-- 信号源映射表 (streamId到steamId的映射)
CREATE TABLE IF NOT EXISTS stream_mappings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  stream_id VARCHAR(50) NOT NULL COMMENT 'JRS比赛ID',
  steam_id VARCHAR(50) NOT NULL COMMENT 'JRKAN信号源ID',
  channel_index INT DEFAULT 0 COMMENT '线路编号',
  channel_name VARCHAR(100) COMMENT '线路名称',
  domain VARCHAR(255) COMMENT '播放域名',
  full_url TEXT COMMENT '完整播放URL',
  match_info JSON COMMENT '比赛详情用于验证',
  success_count INT DEFAULT 0 COMMENT '成功播放次数',
  fail_count INT DEFAULT 0 COMMENT '失败次数',
  last_verified TIMESTAMP NULL COMMENT '最后验证时间',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_stream_channel (stream_id, channel_index),
  INDEX idx_steam_id (steam_id),
  INDEX idx_stream_id (stream_id),
  INDEX idx_last_verified (last_verified)
) COMMENT='比赛ID与信号源ID的映射关系表';

-- 用户会话表
CREATE TABLE IF NOT EXISTS user_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token VARCHAR(500) NOT NULL,
  refresh_token VARCHAR(500),
  device_info VARCHAR(255),
  ip_address VARCHAR(50),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_token (token(100)),
  INDEX idx_expires_at (expires_at)
);

-- 用户关注表
CREATE TABLE IF NOT EXISTS user_follows (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  expert_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (expert_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user_expert (user_id, expert_id),
  INDEX idx_user_id (user_id),
  INDEX idx_expert_id (expert_id)
);

-- 专家申请表
CREATE TABLE IF NOT EXISTS expert_applications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  reason TEXT,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  reviewed_by INT,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
);

-- 聊天消息表
CREATE TABLE IF NOT EXISTS user_chat_messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  match_id INT,
  match_identifier VARCHAR(100),
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_match_id (match_id),
  INDEX idx_match_identifier (match_identifier),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);

-- 聊天频率限制表
CREATE TABLE IF NOT EXISTS user_chat_rate_limit (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  match_id INT,
  match_identifier VARCHAR(100),
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  message_count INT DEFAULT 1,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_match (user_id, match_id),
  INDEX idx_user_match_identifier (user_id, match_identifier),
  INDEX idx_window_start (window_start)
);

-- 用户评论表
CREATE TABLE IF NOT EXISTS user_comments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  plan_id INT,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  parent_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES user_comments(id) ON DELETE CASCADE,
  INDEX idx_plan_id (plan_id),
  INDEX idx_user_id (user_id),
  INDEX idx_parent_id (parent_id)
);

-- 用户通知表
CREATE TABLE IF NOT EXISTS user_notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  content TEXT,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read),
  INDEX idx_created_at (created_at)
);

-- 用户设置表
CREATE TABLE IF NOT EXISTS user_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  notification_expert_plan TINYINT(1) DEFAULT 1,
  notification_comment_reply TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 插入示例数据
INSERT INTO matches (home_team, away_team, league, match_time, status, source_platform) VALUES
('76人', '尼克斯', 'NBA季前赛', '2025-10-04 23:00:00', 'live', 'jrkan'),
('梅斯', '马赛', '法甲第7轮', '2025-10-04 23:00:00', 'finished', 'jrkan'),
('切尔西', '利物浦', '英超', '2025-10-05 00:30:00', 'live', 'jrkan');
