/**
 * 用户系统数据库表结构创建脚本
 * 使用方法: node server/scripts/setup_user_system_db.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 加载环境变量
const projectRoot = path.join(__dirname, '../..');
const envFiles = ['.env', 'env.dev', 'env.local'].filter(file => {
  const envPath = path.join(projectRoot, file);
  return fs.existsSync(envPath);
});

if (envFiles.length > 0) {
  dotenv.config({ path: path.join(projectRoot, envFiles[0]) });
}

// 数据库配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'live_sports',
  multipleStatements: true // 允许执行多条 SQL 语句
};

async function checkTableExists(connection, tableName) {
  const [rows] = await connection.query(`
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
  `, [dbConfig.database, tableName]);
  return rows[0].count > 0;
}

async function checkColumnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(`
    SELECT COUNT(*) as count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, [dbConfig.database, tableName, columnName]);
  return rows[0].count > 0;
}

async function setupDatabase() {
  let connection;
  
  try {
    console.log('🔌 正在连接数据库...');
    console.log(`   主机: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`   数据库: ${dbConfig.database}`);
    console.log(`   用户: ${dbConfig.user}`);
    
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 数据库连接成功\n');

    // 检查基础表是否存在
    console.log('🔍 检查基础表...');
    const usersExists = await checkTableExists(connection, 'users');
    const matchesExists = await checkTableExists(connection, 'matches');
    
    console.log(`   users 表: ${usersExists ? '✅ 存在' : '❌ 不存在'}`);
    console.log(`   matches 表: ${matchesExists ? '✅ 存在' : '❌ 不存在'}\n`);

    // 如果基础表不存在，先创建基础表
    if (!usersExists || !matchesExists) {
      console.log('📦 创建基础表...');
      const baseSchemaFile = path.join(__dirname, '../config/schema.sql');
      
      if (fs.existsSync(baseSchemaFile)) {
        const baseSql = fs.readFileSync(baseSchemaFile, 'utf8');
        // 移除示例数据插入
        const cleanBaseSql = baseSql.replace(/-- 插入示例数据[\s\S]*$/m, '');
        
        try {
          await connection.query(cleanBaseSql);
          console.log('✅ 基础表创建成功\n');
        } catch (error) {
          // 忽略表已存在的错误
          if (!error.message.includes("already exists")) {
            throw error;
          }
          console.log('⚠️  基础表已存在，跳过创建\n');
        }
      } else {
        console.log('⚠️  未找到基础表 SQL 文件，将只创建 users 表\n');
        // 创建最基础的 users 表
        if (!usersExists) {
          await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
              id INT PRIMARY KEY AUTO_INCREMENT,
              username VARCHAR(50) UNIQUE NOT NULL,
              email VARCHAR(100) UNIQUE NOT NULL,
              password_hash VARCHAR(255) NOT NULL,
              avatar_url VARCHAR(255),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          console.log('✅ users 基础表创建成功\n');
        }
      }
    }

    // 读取用户系统 SQL 文件
    const sqlFile = path.join(__dirname, '../config/user_system_schema_simple.sql');
    console.log(`📖 读取用户系统 SQL 文件: ${sqlFile}`);
    
    if (!fs.existsSync(sqlFile)) {
      throw new Error(`SQL 文件不存在: ${sqlFile}`);
    }
    
    const sql = fs.readFileSync(sqlFile, 'utf8');
    console.log('✅ SQL 文件读取成功\n');

    // 执行 SQL（智能处理字段已存在的情况）
    console.log('🚀 开始执行用户系统 SQL...\n');
    
    // 使用更智能的方式分割 SQL 语句
    // 移除注释行（保留分隔注释）
    const lines = sql.split('\n');
    const cleanLines = lines.filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('--') || trimmed.startsWith('-- =') || trimmed === '';
    });
    
    // 按分号分割，但保留多行 CREATE TABLE 语句
    let currentStatement = '';
    const statements = [];
    
    for (const line of cleanLines) {
      currentStatement += line + '\n';
      // 如果行以分号结尾，且不在字符串中，则是一个完整的语句
      if (line.trim().endsWith(';')) {
        const trimmed = currentStatement.trim();
        if (trimmed && !trimmed.startsWith('USE ')) {
          statements.push(trimmed);
        }
        currentStatement = '';
      }
    }
    
    // 添加最后一个语句（如果没有分号结尾）
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue;
      
      try {
        // 检查是否是 ALTER TABLE 添加字段
        const alterMatch = statement.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
        if (alterMatch) {
          const [, tableName, columnName] = alterMatch;
          const columnExists = await checkColumnExists(connection, tableName, columnName);
          if (columnExists) {
            console.log(`⚠️  跳过（字段已存在）: ${tableName}.${columnName}`);
            skipCount++;
            continue;
          }
        }
        
        // 检查是否是 CREATE INDEX
        const indexMatch = statement.match(/CREATE INDEX (\w+) ON (\w+)\s*\((\w+)\)/i);
        if (indexMatch) {
          const [, indexName, tableName, columnName] = indexMatch;
          // 先检查字段是否存在
          const columnExists = await checkColumnExists(connection, tableName, columnName);
          if (!columnExists) {
            console.log(`⚠️  跳过索引创建（字段不存在）: ${indexName} on ${tableName}.${columnName}`);
            skipCount++;
            continue;
          }
          // 再检查索引是否存在
          const [indexRows] = await connection.query(`
            SELECT COUNT(*) as count
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
          `, [dbConfig.database, tableName, indexName]);
          
          if (indexRows[0].count > 0) {
            console.log(`⚠️  跳过（索引已存在）: ${indexName}`);
            skipCount++;
            continue;
          }
        }
        
        await connection.query(statement);
        successCount++;
        // 显示成功执行的语句（简化版）
        if (alterMatch) {
          console.log(`✅ 添加字段: ${alterMatch[1]}.${alterMatch[2]}`);
        } else if (indexMatch) {
          console.log(`✅ 创建索引: ${indexMatch[1]}`);
        } else if (statement.match(/CREATE TABLE/i)) {
          const tableMatch = statement.match(/CREATE TABLE.*?(\w+)\s*\(/i);
          if (tableMatch) {
            console.log(`✅ 创建表: ${tableMatch[1]}`);
          }
        }
      } catch (error) {
        // 忽略字段/索引/表已存在的错误
        if (error.code === 'ER_DUP_FIELDNAME' || 
            error.code === 'ER_DUP_KEYNAME' ||
            error.code === 'ER_TABLE_EXISTS_ERROR' ||
            error.code === 'ER_DUP_KEY' ||
            error.message.includes('Duplicate column name') ||
            error.message.includes('Duplicate key name')) {
          console.log(`⚠️  跳过（已存在）: ${error.message.split('\n')[0]}`);
          skipCount++;
        } else {
          errorCount++;
          errors.push({
            statement: statement.substring(0, 80) + '...',
            error: error.message
          });
          console.error(`❌ 执行失败: ${error.message.split('\n')[0]}`);
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 执行结果:');
    console.log(`   ✅ 成功: ${successCount} 条`);
    if (skipCount > 0) {
      console.log(`   ⚠️  跳过: ${skipCount} 条（已存在）`);
    }
    if (errorCount > 0) {
      console.log(`   ❌ 失败: ${errorCount} 条`);
      console.log('\n错误详情:');
      errors.forEach((err, index) => {
        console.log(`   ${index + 1}. ${err.error}`);
      });
    }
    console.log('='.repeat(50) + '\n');

    // 验证表结构
    console.log('🔍 验证表结构...\n');
    
    // 检查 users 表扩展字段
    const [usersColumns] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
      AND COLUMN_NAME IN ('nickname', 'avatar', 'role', 'last_login_at')
      ORDER BY COLUMN_NAME
    `, [dbConfig.database]);

    console.log('📋 users 表扩展字段:');
    if (usersColumns.length === 0) {
      console.log('   ⚠️  未找到扩展字段');
    } else {
      usersColumns.forEach(col => {
        console.log(`   ✅ ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} - ${col.COLUMN_COMMENT || ''}`);
      });
    }

    // 检查新创建的表
    const [tables] = await connection.query(`
      SELECT TABLE_NAME, TABLE_COMMENT
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
      AND (TABLE_NAME LIKE 'user_%' OR TABLE_NAME LIKE 'expert_%')
      ORDER BY TABLE_NAME
    `, [dbConfig.database]);

    console.log('\n📋 用户系统相关表:');
    if (tables.length === 0) {
      console.log('   ⚠️  未找到新表');
    } else {
      tables.forEach(table => {
        console.log(`   ✅ ${table.TABLE_NAME} - ${table.TABLE_COMMENT || ''}`);
      });
    }

    console.log('\n✅ 数据库表结构创建完成！');
    
  } catch (error) {
    console.error('\n❌ 执行失败:', error.message);
    console.error('   请检查:');
    console.error('   1. 数据库服务是否启动');
    console.error('   2. 数据库配置是否正确（env.dev 文件）');
    console.error('   3. 数据库用户是否有足够权限');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 数据库连接已关闭');
    }
  }
}

// 执行
setupDatabase().catch(console.error);
