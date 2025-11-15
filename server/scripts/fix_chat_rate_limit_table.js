/**
 * 修复 user_chat_rate_limit 表结构
 * 添加缺失的字段
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config(); // Load environment variables

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'BTHsprots',
  multipleStatements: true
};

async function fixTable() {
  let connection;
  try {
    console.log('🔌 连接数据库...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 连接成功\n');

    // 检查表是否存在
    const [tables] = await connection.query(
      "SHOW TABLES LIKE 'user_chat_rate_limit'"
    );

    if (tables.length === 0) {
      console.log('📦 创建 user_chat_rate_limit 表...');
      await connection.query(`
        CREATE TABLE user_chat_rate_limit (
          user_id INT PRIMARY KEY,
          last_message_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后发言时间',
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天发言频率限制表'
      `);
      console.log('✅ 表创建成功\n');
    } else {
      console.log('📦 表已存在，检查字段...\n');
      
      // 检查字段是否存在
      const [columns] = await connection.query(
        "SHOW COLUMNS FROM user_chat_rate_limit LIKE 'last_message_at'"
      );

      if (columns.length === 0) {
        console.log('➕ 添加 last_message_at 字段...');
        await connection.query(`
          ALTER TABLE user_chat_rate_limit 
          ADD COLUMN last_message_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后发言时间'
        `);
        console.log('✅ 字段添加成功\n');
      } else {
        console.log('✅ last_message_at 字段已存在\n');
      }
    }

    // 显示表结构
    console.log('📋 当前表结构:');
    const [structure] = await connection.query('DESCRIBE user_chat_rate_limit');
    console.table(structure);

    console.log('\n✅ 修复完成！');

  } catch (error) {
    console.error('❌ 修复失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

fixTable().catch(console.error);

