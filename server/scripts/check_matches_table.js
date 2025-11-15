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

(async () => {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [cols] = await connection.query('DESCRIBE matches');
    console.log('matches 表的字段:');
    cols.forEach(c => console.log(`  - ${c.Field} (${c.Type})`));
  } catch (error) {
    console.error('错误:', error.message);
  } finally {
    if (connection) await connection.end();
  }
})();

