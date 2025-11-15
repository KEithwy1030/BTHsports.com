/**
 * 清除信号源缓存（包括包含"主播解说"的缓存）
 * 
 * 执行方式（在 Docker 容器中）：
 * docker exec live_show-app-1 node -e "require('./server/utils/StreamSessionStore').clearCommentatorCache()"
 * 
 * 或者在 Node.js 中直接运行：
 * node -e "require('./server/utils/StreamSessionStore').clearCommentatorCache()"
 */

const streamSessionStore = require('./server/utils/StreamSessionStore');

console.log('🔍 开始清除包含"主播解说"的信号源缓存...\n');

const clearedCount = streamSessionStore.clearCommentatorCache();

if (clearedCount === 0) {
  console.log('✅ 缓存中没有包含"主播解说"的数据');
} else {
  console.log(`✅ 已清除 ${clearedCount} 个包含"主播解说"的缓存项`);
}

console.log('\n⚠️  提示：请重启服务以完全清除内存缓存');

