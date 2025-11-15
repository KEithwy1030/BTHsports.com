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
    await conn.query("ALTER TABLE users ADD COLUMN nickname VARCHAR(50) COMMENT '昵称，用于聊天区显示'");
    console.log('✅ nickname 字段添加成功');
  } catch(e) {
    if(e.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠️  nickname 字段已存在');
    } else {
      console.log('❌ 错误:', e.message);
      throw e;
    }
  }
  await conn.end();
})();

