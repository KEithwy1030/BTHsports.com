-- 创建数据库
CREATE DATABASE IF NOT EXISTS live_sports CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE live_sports;

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

-- 信号源表
CREATE TABLE IF NOT EXISTS live_sources (
  id INT PRIMARY KEY AUTO_INCREMENT,
  match_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  source_type ENUM('jrkan', 'popo', 'proxy') NOT NULL,
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

-- 插入示例数据
INSERT INTO matches (home_team, away_team, league, match_time, status, source_platform) VALUES
('76人', '尼克斯', 'NBA季前赛', '2025-10-04 23:00:00', 'live', 'popozhibo'),
('梅斯', '马赛', '法甲第7轮', '2025-10-04 23:00:00', 'finished', 'popozhibo'),
('切尔西', '利物浦', '英超', '2025-10-05 00:30:00', 'live', 'popozhibo');
