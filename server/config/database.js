const mysql = require('mysql2/promise');
const redis = require('redis');

// MySQL数据库配置 - 支持 Zeabur 自动注入
// Zeabur 会在部署时自动注入以下环境变量：
// - DB_HOST: 数据库主机地址
// - DB_PORT: 数据库端口（通常为 3306）
// - DB_USER: 数据库用户名
// - DB_PASSWORD: 数据库密码
// - DB_NAME: 数据库名称
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'BTHsprots',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// 数据库连接健康检查
pool.on('connection', (connection) => {
  console.log('✅ 数据库连接已建立');
});

pool.on('error', (err) => {
  console.error('❌ 数据库连接池错误:', err.message);
  // 不抛出错误，让应用继续运行（某些功能可能不需要数据库）
});

// 测试数据库连接（可选，不阻塞启动）
(async () => {
  try {
    const [rows] = await pool.query('SELECT 1 as test');
    if (rows && rows[0] && rows[0].test === 1) {
      console.log('✅ 数据库连接测试成功');
    }
  } catch (error) {
    console.warn('⚠️ 数据库连接测试失败（某些功能可能不可用）:', error.message);
    console.warn('   请检查数据库配置或确保数据库服务已启动');
  }
})();

// Redis配置 - 支持 Zeabur 自动注入（当前已禁用）
// Zeabur 会在部署时自动注入以下环境变量：
// - REDIS_HOST: Redis 主机地址
// - REDIS_PORT: Redis 端口（通常为 6379）
// - REDIS_PASSWORD: Redis 密码（如果有）
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined
};

// 创建Redis客户端（暂时禁用）
const redisClient = null;

// 注释掉Redis连接，避免错误
// redisClient.on('error', (err) => {
//   console.error('Redis连接错误:', err);
// });

// redisClient.on('connect', () => {
//   console.log('✅ Redis连接成功');
// });

// redisClient.connect().catch(console.error);

module.exports = {
  pool,
  redisClient
};
