<template>
  <div class="live-page">
    <div class="page-header">
      <h2><el-icon><VideoPlay /></el-icon> 正在直播</h2>
      <p>实时观看精彩体育赛事</p>
    </div>

    <div v-loading="loading" class="live-matches">
      <div v-if="liveMatches.length === 0 && !loading" class="empty-state">
        <el-empty description="暂无正在直播的比赛">
          <el-button type="primary" @click="refreshData">刷新数据</el-button>
        </el-empty>
      </div>

      <div v-else class="matches-grid">
        <div 
          v-for="match in liveMatches" 
          :key="match.id"
          class="live-match-card"
          @click="goToMatch(match.id)"
        >
          <div class="match-header">
            <div class="live-indicator">
              <span class="live-dot"></span>
              <span>直播中</span>
            </div>
            <div class="source-count">
              <el-icon><VideoPlay /></el-icon>
              {{ match.source_count }} 个信号源
            </div>
          </div>

          <div class="match-info">
            <div class="teams">
              <div class="team home-team">
                <img :src="match.home_logo || '/default-team.png'" :alt="match.home_team" />
                <span>{{ match.home_team }}</span>
                <span class="score">{{ match.home_score }}</span>
              </div>
              
              <div class="vs">VS</div>
              
              <div class="team away-team">
                <img :src="match.away_logo || '/default-team.png'" :alt="match.away_team" />
                <span>{{ match.away_team }}</span>
                <span class="score">{{ match.away_score }}</span>
              </div>
            </div>
            
            <div class="match-details">
              <div class="league">{{ match.league }}</div>
              <div class="time">{{ formatTime(match.match_time) }}</div>
            </div>
          </div>

          <div class="match-actions">
            <el-button type="primary" size="small" @click.stop="goToMatch(match.id)">
              <el-icon><VideoPlay /></el-icon>
              立即观看
            </el-button>
            <el-button size="small" @click.stop="showMatchInfo(match)">
              <el-icon><InfoFilled /></el-icon>
              详情
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 比赛详情弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      title="比赛详情"
      width="500px"
    >
      <div v-if="selectedMatch" class="match-detail">
        <div class="detail-header">
          <h3>{{ selectedMatch.home_team }} VS {{ selectedMatch.away_team }}</h3>
          <el-tag type="danger">直播中</el-tag>
        </div>
        
        <div class="detail-content">
          <div class="detail-item">
            <label>联赛：</label>
            <span>{{ selectedMatch.league }}</span>
          </div>
          <div class="detail-item">
            <label>时间：</label>
            <span>{{ formatTime(selectedMatch.match_time) }}</span>
          </div>
          <div class="detail-item">
            <label>信号源：</label>
            <span>{{ selectedMatch.source_count }} 个可用</span>
          </div>
          <div class="detail-item">
            <label>画质评分：</label>
            <span>{{ Math.round(selectedMatch.avg_quality || 0) }} 分</span>
          </div>
        </div>
        
        <div class="detail-actions">
          <el-button type="primary" @click="goToMatch(selectedMatch.id)">
            立即观看
          </el-button>
          <el-button @click="dialogVisible = false">关闭</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { liveApi } from '@/api'
import { VideoPlay, InfoFilled } from '@element-plus/icons-vue'
import { showError } from '@/utils/message'

const router = useRouter()
const loading = ref(false)
const liveMatches = ref([])
const dialogVisible = ref(false)
const selectedMatch = ref(null)
let refreshTimer = null

// 获取正在直播的比赛
const fetchLiveMatches = async () => {
  try {
    loading.value = true
    const data = await liveApi.getLiveMatches()
    liveMatches.value = data || []
  } catch (error) {
    console.error('获取直播比赛失败:', error)
    showError('获取直播数据失败，请刷新页面重试')
  } finally {
    loading.value = false
  }
}

// 刷新数据
const refreshData = () => {
  fetchLiveMatches()
}

// 跳转到比赛详情
const goToMatch = (matchId) => {
  router.push(`/match/${matchId}`)
}

// 显示比赛详情
const showMatchInfo = (match) => {
  selectedMatch.value = match
  dialogVisible.value = true
}

// 格式化时间
const formatTime = (timeString) => {
  if (!timeString) return ''
  const date = new Date(timeString)
  if (isNaN(date.getTime())) return timeString
  
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 自动刷新
const startAutoRefresh = () => {
  refreshTimer = setInterval(() => {
    fetchLiveMatches()
  }, 30000) // 每30秒刷新一次
}

// 停止自动刷新
const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

onMounted(() => {
  fetchLiveMatches()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.live-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
}

.page-header h2 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 0 0 10px 0;
  color: #2c3e50;
  font-size: 28px;
}

.page-header p {
  color: #666;
  margin: 0;
}

.live-matches {
  min-height: 400px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.matches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 20px;
}

.live-match-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  position: relative;
  overflow: hidden;
}

.live-match-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, #ff4757, #ff6b7a);
}

.live-match-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  border-color: #ff4757;
}

.match-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ff4757;
  font-weight: 600;
  font-size: 14px;
}

.live-dot {
  width: 8px;
  height: 8px;
  background: #ff4757;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(255, 71, 87, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 71, 87, 0);
  }
}

.source-count {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #666;
}

.match-info {
  margin: 20px 0;
}

.teams {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
}

.team {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.team img {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
}

.team span {
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.team .score {
  font-size: 18px;
  font-weight: bold;
  color: #ff4757;
}

.vs {
  font-weight: bold;
  color: #999;
  margin: 0 20px;
  font-size: 16px;
}

.match-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid #f0f0f0;
  border-bottom: 1px solid #f0f0f0;
}

.league {
  font-weight: 600;
  color: #667eea;
}

.time {
  font-size: 12px;
  color: #666;
}

.match-actions {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}

.match-detail {
  padding: 10px 0;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #f0f0f0;
}

.detail-header h3 {
  margin: 0;
  color: #2c3e50;
}

.detail-content {
  margin-bottom: 20px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.detail-item label {
  font-weight: 600;
  color: #2c3e50;
}

.detail-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .matches-grid {
    grid-template-columns: 1fr;
  }
  
  .teams {
    flex-direction: column;
    gap: 15px;
  }
  
  .vs {
    margin: 0;
  }
  
  .match-details {
    flex-direction: column;
    gap: 5px;
    align-items: flex-start;
  }
}
</style>
