<template>
  <div class="home">
    <!-- 轮播图 -->
    <el-carousel class="hero-carousel" height="300px" indicator-position="outside">
      <el-carousel-item v-for="match in featuredMatches" :key="match.id">
        <div class="carousel-item" @click="goToMatch(match.id)">
          <div class="match-info">
            <h2>{{ match.home_team }} VS {{ match.away_team }}</h2>
            <p class="league">{{ match.league }}</p>
            <p class="time">{{ formatTime(match.match_time) }}</p>
            <el-tag :type="getStatusType(match.status)">
              {{ getStatusText(match.status) }}
            </el-tag>
          </div>
        </div>
      </el-carousel-item>
    </el-carousel>

    <!-- 今日比赛 -->
    <div class="section">
      <div class="section-header">
        <h3><el-icon><Calendar /></el-icon> 今日比赛</h3>
        <router-link to="/matches">
          <el-button type="primary" size="small">查看全部</el-button>
        </router-link>
      </div>
      
      <div class="matches-grid">
        <div 
          v-for="match in todayMatches" 
          :key="match.id"
          class="match-card"
          @click="goToMatch(match.id)"
        >
          <div class="match-header">
            <div class="league-info">
              <span class="league">{{ match.league }}</span>
              <span class="round" v-if="match.round">{{ match.round }}</span>
            </div>
            <el-tag :type="getStatusType(match.status)" size="small">
              {{ getStatusText(match.status) }}
            </el-tag>
          </div>
          
          <div class="teams">
            <div class="team home-team">
              <img :src="match.home_logo || '/default-team.png'" :alt="match.home_team" />
              <span class="team-name">{{ match.home_team }}</span>
              <span class="team-rank" v-if="match.home_rank">#{{ match.home_rank }}</span>
            </div>
            
            <div class="vs-section">
              <div class="score" v-if="match.status === 'live' || match.status === 'finished'">
                <span class="score-number">{{ match.home_score || 0 }}</span>
                <span class="score-separator">:</span>
                <span class="score-number">{{ match.away_score || 0 }}</span>
              </div>
              <div class="vs" v-else>VS</div>
              <div class="match-progress" v-if="match.status === 'live'">
                <span class="progress-text">{{ match.progress || '进行中' }}</span>
                <span class="elapsed-time" v-if="match.elapsed_time">{{ match.elapsed_time }}'</span>
              </div>
            </div>
            
            <div class="team away-team">
              <img :src="match.away_logo || '/default-team.png'" :alt="match.away_team" />
              <span class="team-name">{{ match.away_team }}</span>
              <span class="team-rank" v-if="match.away_rank">#{{ match.away_rank }}</span>
            </div>
          </div>
          
          <div class="match-details">
            <div class="match-time">
              <el-icon><Clock /></el-icon>
              {{ formatTime(match.match_time) }}
            </div>
            
            <div class="source-info" v-if="match.source_count > 0">
              <el-icon><VideoPlay /></el-icon>
              {{ match.source_count }} 个信号源
              <span class="quality-badge" v-if="match.avg_quality">
                {{ getQualityText(match.avg_quality) }}
              </span>
            </div>
            
            <div class="venue-info" v-if="match.venue">
              <el-icon><Location /></el-icon>
              {{ match.venue }}
            </div>
          </div>
          
          <div class="match-stats" v-if="match.status === 'live'">
            <div class="stat-item">
              <span class="stat-label">控球率</span>
              <span class="stat-value">{{ match.possession || '50%' }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">射门</span>
              <span class="stat-value">{{ match.shots || '0' }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">角球</span>
              <span class="stat-value">{{ match.corners || '0' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 热门联赛 -->
    <div class="section">
      <div class="section-header">
        <h3><el-icon><Trophy /></el-icon> 热门联赛</h3>
      </div>
      
      <div class="leagues-grid">
        <div 
          v-for="league in leagues" 
          :key="league.league"
          class="league-card"
          @click="filterByLeague(league.league)"
        >
          <div class="league-name">{{ league.league }}</div>
          <div class="match-count">{{ league.match_count }} 场比赛</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { matchesApi } from '@/api'
import { Calendar, Clock, VideoPlay, Trophy, Location } from '@element-plus/icons-vue'

const router = useRouter()
const featuredMatches = ref([])
const todayMatches = ref([])
const leagues = ref([])

// 获取首页数据
const fetchHomeData = async () => {
  try {
    // 获取正在直播的比赛作为轮播图
    const liveData = await matchesApi.getMatches({ status: 'live', limit: 5 })
    featuredMatches.value = liveData.matches || []
    
    // 获取今日比赛
    const todayData = await matchesApi.getMatches({ limit: 8 })
    todayMatches.value = todayData.matches || []
    
    // 获取联赛列表
    const leaguesData = await matchesApi.getLeagues()
    leagues.value = leaguesData.slice(0, 6) // 只显示前6个热门联赛
    
  } catch (error) {
    console.error('获取首页数据失败:', error)
  }
}

// 跳转到比赛详情
const goToMatch = (matchId) => {
  router.push(`/match/${matchId}`)
}

// 按联赛筛选
const filterByLeague = (league) => {
  router.push(`/matches?league=${encodeURIComponent(league)}`)
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

// 获取质量文本
const getQualityText = (quality) => {
  if (quality >= 90) return '超清'
  if (quality >= 80) return '高清'
  if (quality >= 70) return '标清'
  return '普通'
}

onMounted(() => {
  fetchHomeData()
})
</script>

<style scoped>
.home {
  max-width: 1200px;
  margin: 0 auto;
}

.hero-carousel {
  margin-bottom: 40px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.carousel-item {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.3s ease;
}

.carousel-item:hover {
  transform: scale(1.02);
}

.match-info {
  text-align: center;
  padding: 40px;
}

.match-info h2 {
  font-size: 32px;
  margin: 0 0 10px 0;
  font-weight: bold;
}

.match-info .league {
  font-size: 18px;
  margin: 10px 0;
  opacity: 0.9;
}

.match-info .time {
  font-size: 16px;
  margin: 10px 0;
  opacity: 0.8;
}

.section {
  margin-bottom: 40px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.section-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: #2c3e50;
  font-size: 20px;
}

.matches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.match-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid #f0f0f0;
}

.match-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.match-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.league-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.league {
  font-weight: 600;
  color: #667eea;
  font-size: 14px;
}

.round {
  font-size: 12px;
  color: #999;
  font-weight: normal;
}

.teams {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20px 0;
}

.team {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.team img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.team-name {
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.team-rank {
  font-size: 11px;
  color: #999;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 10px;
}

.vs-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin: 0 15px;
}

.vs {
  font-weight: bold;
  color: #999;
  font-size: 14px;
}

.score {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: bold;
  font-size: 18px;
  color: #2c3e50;
}

.score-number {
  font-size: 20px;
  font-weight: 700;
}

.score-separator {
  font-size: 16px;
  color: #666;
}

.match-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: #666;
}

.progress-text {
  font-weight: 500;
}

.elapsed-time {
  color: #999;
}

.match-details {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #f0f0f0;
}

.match-time, .source-info, .venue-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #666;
  margin: 6px 0;
}

.quality-badge {
  background: #e8f4fd;
  color: #1890ff;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  margin-left: 4px;
}

.match-stats {
  display: flex;
  justify-content: space-between;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #f0f0f0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.stat-label {
  font-size: 11px;
  color: #999;
  font-weight: 500;
}

.stat-value {
  font-size: 13px;
  font-weight: 600;
  color: #2c3e50;
}

.leagues-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}

.league-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid #f0f0f0;
}

.league-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  border-color: #667eea;
}

.league-name {
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 8px;
}

.match-count {
  font-size: 12px;
  color: #666;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .matches-grid {
    grid-template-columns: 1fr;
  }
  
  .leagues-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .match-info h2 {
    font-size: 24px;
  }
}
</style>
