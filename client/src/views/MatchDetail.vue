<template>
  <div class="match-detail-page">
    <div v-loading="loading" class="match-content">
      <!-- 比赛信息头部 -->
      <div class="match-header">
        <el-button @click="$router.back()" size="small">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        
        <!-- 比赛信息展示区域 -->
        <div v-if="match" class="match-info-display">
          <div class="match-teams">
            <!-- 主队 -->
            <div class="team-info home-team">
              <img 
                :src="match.home_team_logo || '/static/img/default-img.png'" 
                :alt="match.home_team"
                class="team-logo"
                @error="handleLogoError"
              />
              <span class="team-name">{{ match.home_team }}</span>
            </div>
            
            <!-- VS 分隔符 -->
            <div class="vs-separator">VS</div>
            
            <!-- 客队 -->
            <div class="team-info away-team">
              <img 
                :src="match.away_team_logo || '/static/img/default-img.png'" 
                :alt="match.away_team"
                class="team-logo"
                @error="handleLogoError"
              />
              <span class="team-name">{{ match.away_team }}</span>
            </div>
          </div>
          
          <!-- 比赛详情 -->
          <div class="match-details">
            <div class="match-league">{{ match.league }}</div>
            <div class="match-time">{{ formatMatchTime(match.match_time) }}</div>
            <div class="match-status">
              <el-tag :type="getStatusType(match.status)" size="large">
                {{ getStatusText(match.status) }}
              </el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 视频播放器和聊天区 -->
      <el-row :gutter="20" class="player-chat-section">
        <!-- 视频播放器 -->
        <el-col :xs="24" :sm="24" :md="16" :lg="16" :xl="16">
          <div v-if="sources.length > 0" class="player-section">
            <VideoPlayer
              v-if="sources.length > 0"
              :stream-url="getBestStreamUrl()"
              :stream-type="getStreamType()"
            />
          </div>

          <!-- 无信号源提示 -->
          <div v-else class="no-sources">
            <el-empty description="暂无可用信号源">
              <el-button type="primary" @click="refreshSources">刷新信号源</el-button>
            </el-empty>
          </div>
        </el-col>

        <!-- 聊天区 -->
        <el-col :xs="24" :sm="24" :md="8" :lg="8" :xl="8">
          <MatchChat v-if="match" :match-id="getMatchIdForChat()" />
        </el-col>
      </el-row>

      <!-- 信号源列表 -->
      <div v-if="sources.length > 0" class="sources-section">
        <h3>信号源列表</h3>
        <div class="sources-grid">
          <div 
            v-for="source in sources" 
            :key="source.id"
            class="source-card"
            :class="{ active: source.id === selectedSourceId }"
            @click="selectSource(source)"
          >
            <div class="source-header">
              <span class="source-name">{{ source.name }}</span>
              <el-tag 
                :type="getQualityType(source.quality)" 
                size="small"
                v-if="source.quality"
              >
                {{ source.quality }}分
              </el-tag>
            </div>
            
            <div class="source-info">
              <div class="source-type">
                <el-icon><Link /></el-icon>
                {{ getSourceTypeText(source.type) }}
              </div>
              <div class="source-status">
                <el-icon v-if="source.isActive" class="status-icon active"><Check /></el-icon>
                <el-icon v-else class="status-icon inactive"><Close /></el-icon>
                {{ source.isActive ? '可用' : '不可用' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 比赛统计 -->
      <div v-if="match" class="match-stats">
        <h3>比赛信息</h3>
        <el-row :gutter="20">
          <el-col :span="8">
            <div class="stat-card">
              <div class="stat-label">主队</div>
              <div class="stat-value">{{ match.home_team }}</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="stat-card">
              <div class="stat-label">比分</div>
              <div class="stat-value">{{ match.home_score }} - {{ match.away_score }}</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="stat-card">
              <div class="stat-label">客队</div>
              <div class="stat-value">{{ match.away_team }}</div>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 相关推荐 -->
      <div v-if="recommendations.length > 0" class="recommendations">
        <h3>相关推荐</h3>
        <div class="recommendations-grid">
          <div 
            v-for="rec in recommendations" 
            :key="rec.id"
            class="recommendation-card"
            @click="goToMatch(rec.id)"
          >
            <div class="rec-header">
              <span class="rec-teams">{{ rec.home_team }} VS {{ rec.away_team }}</span>
              <el-tag :type="getStatusType(rec.status)" size="small">
                {{ getStatusText(rec.status) }}
              </el-tag>
            </div>
            <div class="rec-info">
              <span class="rec-league">{{ rec.league }}</span>
              <span class="rec-time">{{ formatTime(rec.match_time) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { matchesApi, liveApi } from '@/api'
import VideoPlayer from '@/components/VideoPlayer.vue'
import MatchChat from '@/components/MatchChat.vue'
import { ArrowLeft, Link, Check, Close } from '@element-plus/icons-vue'
import { showError, showWarning, showSuccess } from '@/utils/message'

const props = defineProps({
  id: {
    type: [String, Number],
    required: true
  }
})

const router = useRouter()
const loading = ref(false)
const match = ref(null)
const sources = ref([])
const recommendations = ref([])
const selectedSourceId = ref(null)

// 获取比赛详情
const fetchMatchDetail = async () => {
  try {
    loading.value = true
    
    // 获取比赛详情
    const matchData = await matchesApi.getMatchDetail(props.id)
    match.value = matchData.data
    
    // 单独获取信号源
    try {
      const sourcesData = await liveApi.getStreamSources(props.id)
      sources.value = sourcesData.data.sources || []
      console.log('获取到信号源:', sources.value.length, '个')
    } catch (sourcesError) {
      console.log('信号源获取失败，使用空数组:', sourcesError.message)
      sources.value = []
    }
    
    recommendations.value = [] // 暂时不显示推荐
    
    // 自动选择第一个可用信号源
    if (sources.value.length > 0) {
      const firstAvailable = sources.value.find(s => s.isActive)
      if (firstAvailable) {
        selectedSourceId.value = firstAvailable.id
      }
    }
    
  } catch (error) {
    console.error('获取比赛详情失败:', error)
    showError('获取比赛详情失败，请刷新页面重试')
  } finally {
    loading.value = false
  }
}

// 刷新信号源
const refreshSources = async () => {
  try {
    loading.value = true
    const data = await liveApi.getStreamSources(props.id)
    sources.value = data.data.sources || []
    
    if (sources.value.length === 0) {
      showWarning('当前比赛暂无可用信号源，请稍后再试')
    } else {
      showSuccess(`成功找到 ${sources.value.length} 个可用信号源`)
    }
    
  } catch (error) {
    console.error('刷新信号源失败:', error)
    showError('刷新信号源失败，请检查网络连接或稍后重试')
  } finally {
    loading.value = false
  }
}

// 选择信号源
const selectSource = (source) => {
  if (!source.isActive) {
    showWarning('该信号源当前不可用，请选择其他信号源')
    return
  }
  selectedSourceId.value = source.id
}

// 🎯 获取最佳流地址（优先m3u8流）
const getBestStreamUrl = () => {
  if (sources.value.length === 0) return null
  
  // 优先选择m3u8流
  const m3u8Source = sources.value.find(s => s.isM3u8Stream && s.isActive)
  if (m3u8Source) {
    console.log('🎯 使用m3u8流:', m3u8Source.url)
    return m3u8Source.url
  }
  
  // 如果没有m3u8流，选择第一个可用的信号源
  const firstAvailable = sources.value.find(s => s.isActive)
  if (firstAvailable) {
    console.log('🎯 使用HTML页面:', firstAvailable.url)
    return firstAvailable.url
  }
  
  return null
}

// 🎯 获取流类型
const getStreamType = () => {
  if (sources.value.length === 0) return 'unknown'
  
  // 检查是否有m3u8流
  const m3u8Source = sources.value.find(s => s.isM3u8Stream && s.isActive)
  if (m3u8Source) {
    return 'm3u8'
  }
  
  return 'html'
}

// 处理信号源变化
const handleSourceChanged = (source) => {
  selectedSourceId.value = source.id
  // 记录观看历史
  liveApi.recordWatch(props.id, source.id, 0)
}

// 处理播放器准备就绪
const handlePlayerReady = () => {
  // 静默处理：成功时直接播放，不需要弹窗提示
}

// 处理播放器错误
const handlePlayerError = (error) => {
  console.error('播放器错误:', error)
  showError('视频播放失败，请尝试切换其他信号源')
}

// 跳转到其他比赛
const goToMatch = (matchId) => {
  router.push(`/match/${matchId}`)
}

// 格式化时间
const formatTime = (timeString) => {
  if (!timeString) return ''
  const date = new Date(timeString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 格式化比赛时间（只显示时分）
const formatMatchTime = (timeString) => {
  if (!timeString) return ''
  const date = new Date(timeString)
  return date.toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 处理Logo加载错误
const handleLogoError = (event) => {
  event.target.src = '/static/img/default-img.png'
}

// 获取状态类型
const getStatusType = (status) => {
  const types = {
    'live': 'danger',
    'upcoming': 'info',
    'finished': 'success'
  }
  return types[status] || 'info'
}

// 获取状态文本
const getStatusText = (status) => {
  const texts = {
    'live': '直播中',
    'upcoming': '即将开始',
    'finished': '已结束'
  }
  return texts[status] || status
}

// 获取画质标签类型
const getQualityType = (quality) => {
  if (quality >= 80) return 'success'
  if (quality >= 60) return 'warning'
  return 'danger'
}

// 获取信号源类型文本
const getSourceTypeText = (type) => {
  const types = {
    'chinese_hd': '中文高清',
    'hd_live': '高清直播',
    'jrkan': 'JRKAN线路',
    'popo': 'POPO线路',
    'proxy': '代理线路'
  }
  return types[type] || type
}

// 获取用于聊天的比赛ID
// 注意：聊天功能需要数据库中的match.id，而不是爬虫的matchId
// 如果match对象有数据库id则使用，否则使用props.id（需要确保是数据库id）
const getMatchIdForChat = () => {
  // 优先使用match对象中的数据库id
  if (match.value && match.value.db_id) {
    return match.value.db_id
  }
  // 如果没有，尝试使用match.id（可能是数据库id）
  if (match.value && match.value.id) {
    return match.value.id
  }
  // 最后使用props.id（需要确保这是数据库中的id）
  return props.id
}

// 监听路由参数变化
watch(() => props.id, (newId) => {
  if (newId) {
    fetchMatchDetail()
  }
})

onMounted(() => {
  fetchMatchDetail()
})
</script>

<style scoped>
.match-detail-page {
  max-width: 1200px;
  margin: 0 auto;
}

.match-header {
  margin-bottom: 30px;
}

.match-info-display {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 30px;
  color: white;
  margin-top: 20px;
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
}

.match-teams {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 40px;
  margin-bottom: 20px;
}

.team-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.team-logo {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
}

.team-name {
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.vs-separator {
  font-size: 24px;
  font-weight: bold;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.match-details {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 30px;
  flex-wrap: wrap;
}

.match-league {
  font-size: 16px;
  font-weight: 600;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.match-time {
  font-size: 18px;
  font-weight: bold;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.match-status {
  display: flex;
  align-items: center;
}

.player-chat-section {
  margin-bottom: 30px;
}

.player-section {
  margin-bottom: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.no-sources {
  background: white;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  margin-bottom: 30px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.sources-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.sources-section h3 {
  margin: 0 0 20px 0;
  color: #2c3e50;
  font-size: 18px;
}

.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
}

.source-card {
  border: 2px solid #f0f0f0;
  border-radius: 8px;
  padding: 15px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.source-card:hover {
  border-color: #667eea;
  transform: translateY(-2px);
}

.source-card.active {
  border-color: #667eea;
  background: #f8f9ff;
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.source-name {
  font-weight: 600;
  color: #2c3e50;
}

.source-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #666;
}

.source-type {
  display: flex;
  align-items: center;
  gap: 4px;
}

.source-status {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-icon.active {
  color: #67c23a;
}

.status-icon.inactive {
  color: #f56c6c;
}

.match-stats {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.match-stats h3 {
  margin: 0 0 20px 0;
  color: #2c3e50;
  font-size: 18px;
}

.stat-card {
  text-align: center;
  padding: 15px;
  border-radius: 6px;
  background: #f8f9fa;
}

.stat-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.recommendations {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.recommendations h3 {
  margin: 0 0 20px 0;
  color: #2c3e50;
  font-size: 18px;
}

.recommendations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}

.recommendation-card {
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 15px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.recommendation-card:hover {
  border-color: #667eea;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.rec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.rec-teams {
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.rec-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
}

.rec-league {
  color: #667eea;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .match-info-display {
    padding: 20px;
  }
  
  .match-teams {
    gap: 20px;
    margin-bottom: 15px;
  }
  
  .team-logo {
    width: 50px;
    height: 50px;
  }
  
  .team-name {
    font-size: 14px;
  }
  
  .vs-separator {
    font-size: 20px;
  }
  
  .match-details {
    gap: 20px;
    flex-direction: column;
    text-align: center;
  }
  
  .match-league,
  .match-time {
    font-size: 14px;
  }
  
  .sources-grid {
    grid-template-columns: 1fr;
  }
  
  .recommendations-grid {
    grid-template-columns: 1fr;
  }
}
</style>
