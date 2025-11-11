const mysql = require('mysql2/promise');
const redis = require('redis');

// MySQL数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'live_sports',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// Redis配置
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
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
