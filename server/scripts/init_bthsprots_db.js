/**
 * 初始化 BTHsprots 数据库
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'BTHsprots',
  multipleStatements: true
};

async function initDatabase() {
  let connection;
  
  try {
    console.log('🔌 连接数据库...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 连接成功\n');

    // 创建基础 users 表
    console.log('📦 创建 users 表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nickname VARCHAR(50),
        avatar VARCHAR(255),
        role ENUM('user', 'expert', 'admin') DEFAULT 'user',
        last_login_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_role (role),
        INDEX idx_users_nickname (nickname)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ users 表创建成功\n');

    // 创建 matches 表
    console.log('📦 创建 matches 表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id INT PRIMARY KEY AUTO_INCREMENT,
        match_id VARCHAR(100),
        match_url VARCHAR(500),
        match_identifier VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ matches 表创建成功\n');

    // 创建用户系统相关表
    const tableDefinitions = [
      `CREATE TABLE IF NOT EXISTS user_sessions (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      
      `CREATE TABLE IF NOT EXISTS user_follows (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        expert_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (expert_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY uk_user_expert (user_id, expert_id),
        INDEX idx_user_id (user_id),
        INDEX idx_expert_id (expert_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      
      `CREATE TABLE IF NOT EXISTS expert_applications (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      
      `CREATE TABLE IF NOT EXISTS user_chat_messages (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      
      `CREATE TABLE IF NOT EXISTS user_comments (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      
      `CREATE TABLE IF NOT EXISTS user_notifications (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      
      `CREATE TABLE IF NOT EXISTS user_settings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL UNIQUE,
        notification_expert_plan TINYINT(1) DEFAULT 1,
        notification_comment_reply TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      
      `CREATE TABLE IF NOT EXISTS user_chat_rate_limit (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        match_id INT,
        match_identifier VARCHAR(100),
        message_count INT DEFAULT 1,
        window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_match (user_id, match_id),
        INDEX idx_user_match_identifier (user_id, match_identifier),
        INDEX idx_window_start (window_start)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ];

    for (const tableSql of tableDefinitions) {
      try {
        await connection.query(tableSql);
        const tableName = tableSql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
        console.log(`✅ ${tableName} 表创建成功`);
      } catch (error) {
        console.log(`⚠️  表可能已存在: ${error.message}`);
      }
    }

    // 验证表
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`\n✅ 数据库初始化完成！共 ${tables.length} 张表`);
    tables.forEach(t => console.log(`   - ${Object.values(t)[0]}`));

    await connection.end();
  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (connection) await connection.end();
    process.exit(1);
  }
}

initDatabase();

