/**
 * 在 Docker 容器中清理数据库中的"主播解说"频道数据
 * 
 * 执行方式：
 * docker-compose -f docker-compose.prod.yml exec app node 清理主播解说数据-docker.js
 * 或者：
 * docker exec -it live_show-app-1 node 清理主播解说数据-docker.js
 */

const { pool } = require('./server/config/database');

async function cleanCommentatorChannels() {
  let connection;
  
  try {
    console.log('🔍 开始清理"主播解说"数据...\n');
    
    connection = await pool.getConnection();
    
    // 1. 查找 stream_mappings 表中的"主播解说"记录
    const [mappingRows] = await connection.query(`
      SELECT id, stream_id, channel_name, steam_id, domain 
      FROM stream_mappings 
      WHERE channel_name LIKE '%主播%' 
         OR channel_name LIKE '%解说%'
         OR channel_name LIKE '%commentator%'
         OR channel_name LIKE '%host%'
    `);
    
    console.log(`📊 找到 ${mappingRows.length} 条"主播解说"映射记录:`);
    mappingRows.forEach((row, index) => {
      console.log(`  ${index + 1}. ID: ${row.id}, 频道: ${row.channel_name}, streamId: ${row.stream_id}, steamId: ${row.steam_id}`);
    });
    
    // 2. 删除 stream_mappings 表中的"主播解说"记录
    if (mappingRows.length > 0) {
      const [deleteResult] = await connection.query(`
        DELETE FROM stream_mappings 
        WHERE channel_name LIKE '%主播%' 
           OR channel_name LIKE '%解说%'
           OR channel_name LIKE '%commentator%'
           OR channel_name LIKE '%host%'
      `);
      console.log(`\n✅ 已删除 ${deleteResult.affectedRows} 条 stream_mappings 记录`);
    } else {
      console.log('\n✅ stream_mappings 表中没有"主播解说"记录');
    }
    
    // 3. 查找 live_sources 表中的"主播解说"记录（如果有的话）
    const [sourceRows] = await connection.query(`
      SELECT id, match_id, name, url 
      FROM live_sources 
      WHERE name LIKE '%主播%' 
         OR name LIKE '%解说%'
         OR name LIKE '%commentator%'
         OR name LIKE '%host%'
      LIMIT 100
    `);
    
    if (sourceRows.length > 0) {
      console.log(`\n📊 找到 ${sourceRows.length} 条"主播解说"信号源记录:`);
      sourceRows.forEach((row, index) => {
        console.log(`  ${index + 1}. ID: ${row.id}, 名称: ${row.name}, matchId: ${row.match_id}`);
      });
      
      const [deleteSourceResult] = await connection.query(`
        DELETE FROM live_sources 
        WHERE name LIKE '%主播%' 
           OR name LIKE '%解说%'
           OR name LIKE '%commentator%'
           OR name LIKE '%host%'
      `);
      console.log(`\n✅ 已删除 ${deleteSourceResult.affectedRows} 条 live_sources 记录`);
    } else {
      console.log('\n✅ live_sources 表中没有"主播解说"记录');
    }
    
    // 4. 统计清理后的数据
    const [totalMappings] = await connection.query('SELECT COUNT(*) as count FROM stream_mappings');
    const [totalSources] = await connection.query('SELECT COUNT(*) as count FROM live_sources');
    
    console.log('\n📊 清理后的数据统计:');
    console.log(`  stream_mappings: ${totalMappings[0].count} 条记录`);
    console.log(`  live_sources: ${totalSources[0].count} 条记录`);
    
    console.log('\n✅ 清理完成！');
    console.log('\n⚠️  注意：请重启 Docker 服务以清除内存缓存');
    
  } catch (error) {
    console.error('\n❌ 清理失败:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    // 等待一下再退出，确保日志输出完成
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// 执行清理
cleanCommentatorChannels();

