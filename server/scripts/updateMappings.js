const axios = require('axios');

// 获取所有比赛的streamId
async function getAllStreamIds() {
  try {
    const response = await axios.get('http://localhost:7001/api/jrkan/matches');
    const matches = response.data.data || [];
    
    const streamIds = matches.map(match => {
      // 从match.id提取streamId
      const idParts = match.id.split('_');
      if (idParts.length >= 2) {
        const dataLid = idParts[1];
        return dataLid.split(',')[0];
      }
      return null;
    }).filter(id => id !== null);
    
    console.log(`📊 找到 ${streamIds.length} 个streamId`);
    return streamIds;
  } catch (error) {
    console.error('❌ 获取streamId失败:', error.message);
    return [];
  }
}

// 批量更新映射表
async function updateMappings() {
  try {
    console.log('🚀 开始批量更新映射表...');
    
    // 获取所有streamId
    const streamIds = await getAllStreamIds();
    
    if (streamIds.length === 0) {
      console.log('❌ 没有找到streamId');
      return;
    }
    
    // 调用批量更新API
    const response = await axios.post('http://localhost:7001/api/jrkan/update-mappings', {
      streamIds: streamIds
    });
    
    if (response.data.success) {
      console.log('✅ 批量更新完成');
      console.log('📊 统计信息:', response.data.stats);
    } else {
      console.log('❌ 批量更新失败:', response.data.message);
    }
    
  } catch (error) {
    console.error('❌ 批量更新失败:', error.message);
  }
}

// 获取映射表统计信息
async function getMappingStats() {
  try {
    const response = await axios.get('http://localhost:7001/api/jrkan/mapping-stats');
    
    if (response.data.success) {
      console.log('📊 映射表统计信息:');
      console.log(`总映射数量: ${response.data.stats.totalMappings}`);
      console.log('映射详情:', response.data.stats.mappings);
    }
  } catch (error) {
    console.error('❌ 获取统计信息失败:', error.message);
  }
}

// 主函数
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'update':
      await updateMappings();
      break;
    case 'stats':
      await getMappingStats();
      break;
    default:
      console.log('用法:');
      console.log('  node updateMappings.js update  - 批量更新映射表');
      console.log('  node updateMappings.js stats   - 查看映射表统计');
  }
}

main().catch(console.error);
