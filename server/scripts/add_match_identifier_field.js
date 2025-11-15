const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// 加载环境变量
const projectRoot = path.join(__dirname, '../..');
const envFiles = ['.env', 'env.dev', 'env.local'].filter(file => {
  return fs.existsSync(path.join(projectRoot, file));
});

if (envFiles.length > 0) {
  dotenv.config({ path: path.join(projectRoot, envFiles[0]) });
}

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'live_sports'
};

(async () => {
  const conn = await mysql.createConnection(dbConfig);
  try {
    // 添加 match_identifier 字段
    try {
      await conn.query("ALTER TABLE user_chat_messages ADD COLUMN match_identifier VARCHAR(100) COMMENT '比赛标识符（爬虫matchId，用于关联）'");
      console.log('✅ match_identifier 字段添加成功');
    } catch(e) {
      if(e.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️  match_identifier 字段已存在');
      } else {
        throw e;
      }
    }

    // 修改 match_id 字段为可空
    try {
      await conn.query("ALTER TABLE user_chat_messages MODIFY COLUMN match_id INT COMMENT '比赛ID（数据库ID，可为空）'");
      console.log('✅ match_id 字段已修改为可空');
    } catch(e) {
      console.log('⚠️  修改 match_id 字段失败（可能已经是可空）:', e.message);
    }

    // 添加 match_identifier 索引
    try {
      await conn.query('CREATE INDEX idx_match_identifier ON user_chat_messages(match_identifier)');
      console.log('✅ match_identifier 索引创建成功');
    } catch(e) {
      if(e.code === 'ER_DUP_KEYNAME') {
        console.log('⚠️  match_identifier 索引已存在');
      } else {
        console.log('⚠️  创建索引失败:', e.message);
      }
    }

    console.log('✅ 所有字段更新完成');
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();

