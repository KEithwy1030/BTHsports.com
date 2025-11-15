/**
 * 为 matches 表添加 start_time 字段
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'BTHsprots'
};

async function addField() {
  let connection;
  try {
    console.log('🔌 连接数据库...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 连接成功\n');

    // 检查字段是否存在
    const [columns] = await connection.query(
      "SHOW COLUMNS FROM matches LIKE 'start_time'"
    );

    if (columns.length === 0) {
      console.log('➕ 添加 start_time 字段...');
      await connection.query(`
        ALTER TABLE matches 
        ADD COLUMN start_time DATETIME NULL COMMENT '比赛开始时间'
      `);
      console.log('✅ 字段添加成功\n');
    } else {
      console.log('✅ start_time 字段已存在\n');
    }

    // 显示表结构
    console.log('📋 matches 表结构:');
    const [structure] = await connection.query('DESCRIBE matches');
    console.table(structure);

    console.log('\n✅ 完成！');

  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

addField().catch(console.error);

