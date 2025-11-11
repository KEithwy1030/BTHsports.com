<template>
  <div class="jrkan-homepage">
    <!-- 顶部导航栏 -->
    <header class="top-header">
      <div class="header-container">
        <div class="logo-section">
          <div class="logo">JRKAN.COM</div>
        </div>
        <div class="domain-links">
          <a href="https://www.jrs04.com" class="domain-link">
            <i class="icon-camera"></i>
            www.jrs04.com
          </a>
          <a href="https://www.jrs80.com" class="domain-link">
            <i class="icon-download"></i>
            www.jrs80.com
          </a>
        </div>
        <div class="language-selector">
          <span class="lang active">简</span>
          <span class="lang">繁</span>
          <span class="lang">EN</span>
        </div>
      </div>
    </header>

    <!-- 主菜单导航 -->
    <nav class="main-nav">
      <div class="nav-container">
        <div class="nav-tabs">
          <div 
            v-for="tab in navTabs" 
            :key="tab.key"
            :class="['nav-tab', { active: activeTab === tab.key }]"
            @click="switchTab(tab.key)"
          >
            {{ tab.label }}
          </div>
        </div>
      </div>
    </nav>

    <!-- 备用域名提示 -->
    <div class="backup-domains">
      <span>备用域名 www.jrs04.com www.jrs80.com www.jrs03.com</span>
    </div>

    <!-- 比赛列表 -->
    <div class="match-container">
      <div class="loading" v-if="loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在加载比赛数据...</span>
      </div>
      
      <div class="match-table" v-else>
        <table>
          <thead>
            <tr>
              <th class="col-event">赛事</th>
              <th class="col-time">时间</th>
              <th class="col-status">状态</th>
              <th class="col-home">主队</th>
              <th class="col-score">比分</th>
              <th class="col-away">客队</th>
              <th class="col-channels">频道</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="match in filteredMatches" :key="match.id" class="match-row">
              <td class="col-event">
                <div class="league-info">
                  <span class="league-name">{{ match.league }}</span>
                </div>
              </td>
              <td class="col-time">{{ match.time }}</td>
              <td class="col-status">
                <span :class="['status', match.statusClass]">{{ match.status }}</span>
              </td>
              <td class="col-home">
                <div class="team-info">
                  <img 
                    :src="getTeamLogo(match.homeLogo, match.homeTeam)" 
                    :alt="match.homeTeam"
                    class="team-logo"
                    @error="handleLogoError"
                  />
                  <span class="team-name">{{ match.homeTeam }}</span>
                </div>
              </td>
              <td class="col-score">
                <span class="score">{{ match.score }}</span>
              </td>
              <td class="col-away">
                <div class="team-info">
                  <img 
                    :src="getTeamLogo(match.awayLogo, match.awayTeam)" 
                    :alt="match.awayTeam"
                    class="team-logo"
                    @error="handleLogoError"
                  />
                  <span class="team-name">{{ match.awayTeam }}</span>
                </div>
              </td>
              <td class="col-channels">
                <div class="channels">
                  <a 
                    v-for="(channel, index) in match.channels" 
                    :key="index"
                    :href="channel.url" 
                    class="channel-link"
                    target="_blank"
                  >
                    <i class="icon-play"></i>
                    <span>{{ channel.name }}</span>
                  </a>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="no-data" v-if="!loading && matches.length === 0">
        <p>暂无比赛数据</p>
      </div>
    </div>

    <!-- 更新状态 -->
    <div class="update-status">
      <span>最后更新时间: {{ lastUpdateTime }}</span>
      <span class="update-countdown">下次更新: {{ countdown }}分钟</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import api from '@/api'

// 响应式数据
const loading = ref(true)
const matches = ref([])
const activeTab = ref('all')
const lastUpdateTime = ref('')
const countdown = ref(10)

// 导航标签
const navTabs = ref([
  { key: 'all', label: '全部' },
  { key: 'football', label: '足球' },
  { key: 'basketball', label: '篮球' },
  { key: 'other', label: '其他' }
])

// 定时器
let updateTimer = null
let countdownTimer = null

// 计算属性
const filteredMatches = computed(() => {
  if (activeTab.value === 'all') {
    return matches.value
  }
  
  const sportMap = {
    football: ['中超', '英超', '德甲', '西甲', '意甲', '法甲', '欧冠', '欧联'],
    basketball: ['NBA', 'CBA', '欧篮杯', '篮冠联'],
    other: []
  }
  
  const targetLeagues = sportMap[activeTab.value] || []
  return matches.value.filter(match => 
    targetLeagues.some(league => match.league.includes(league))
  )
})

// 球队Logo映射表
const teamLogoMap = {
  // NBA球队
  '湖人': 'https://cdn.nba.com/logos/nba/1610612747/global/L/logo.svg',
  '勇士': 'https://cdn.nba.com/logos/nba/1610612744/global/L/logo.svg',
  '凯尔特人': 'https://cdn.nba.com/logos/nba/1610612738/global/L/logo.svg',
  '热火': 'https://cdn.nba.com/logos/nba/1610612748/global/L/logo.svg',
  
  // 中超球队
  '深圳新鹏城': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9IiNmNWY1ZjUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Ik0xMiAxNmgxNmwtOCA4eiIgZmlsbD0iIzk5OSIvPgo8L3N2Zz4K',
  '上海海港': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9IiNmNWY1ZjUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Ik0xMiAxNmgxNmwtOCA4eiIgZmlsbD0iIzk5OSIvPgo8L3N2Zz4K'
}

// 方法
const switchTab = (tabKey) => {
  activeTab.value = tabKey
}

const getTeamLogo = (logoUrl, teamName) => {
  // 优先使用映射表中的稳定Logo
  if (teamName && teamLogoMap[teamName]) {
    return teamLogoMap[teamName]
  }
  
  // 如果Logo URL为空或无效，返回默认Logo
  if (!logoUrl || logoUrl === '/static/img/default-img.png') {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9IiNmNWY1ZjUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Ik0xMiAxNmgxNmwtOCA4eiIgZmlsbD0iIzk5OSIvPgo8L3N2Zz4K'
  }
  
  // 如果是相对路径，添加默认Logo前缀
  if (logoUrl.startsWith('/static/')) {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9IiNmNWY1ZjUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Ik0xMiAxNmgxNmwtOCA4eiIgZmlsbD0iIzk5OSIvPgo8L3N2Zz4K'
  }
  
  // 对于腾讯图片服务器，直接返回默认Logo，避免跨域问题
  if (logoUrl.includes('mat1.gtimg.com') || logoUrl.includes('img1.gtimg.com')) {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9IiNmNWY1ZjUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Ik0xMiAxNmgxNmwtOCA4eiIgZmlsbD0iIzk5OSIvPgo8L3N2Zz4K'
  }
  
  // 其他情况返回原始URL
  return logoUrl
}

const handleLogoError = (event) => {
  console.warn('Logo加载失败:', event.target.src)
  // 使用base64编码的默认Logo，避免路径问题
  event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9IiNmNWY1ZjUiIHN0cm9rZT0iI2RkZCIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Ik0xMiAxNmgxNmwtOCA4eiIgZmlsbD0iIzk5OSIvPgo8L3N2Zz4K'
  event.target.onerror = null // 防止无限循环
}

const loadMatches = async () => {
  try {
    loading.value = true
    console.log('🔄 加载JRKAN比赛数据...')
    
    const response = await api.get('/jrkan/matches')
    
    if (response.data && response.data.success) {
      matches.value = response.data.data || []
      
      // 使用API返回的抓取时间，格式化为 HH:MM
      if (response.data.lastUpdate) {
        const updateTime = new Date(response.data.lastUpdate)
        const hours = String(updateTime.getHours()).padStart(2, '0')
        const minutes = String(updateTime.getMinutes()).padStart(2, '0')
        lastUpdateTime.value = `${hours}:${minutes}`
        console.log(`✅ 成功加载 ${matches.value.length} 场比赛，数据抓取时间: ${lastUpdateTime.value}`)
      } else {
        // 如果API没有返回时间，使用当前时间作为备用
        const now = new Date()
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        lastUpdateTime.value = `${hours}:${minutes}`
        console.log(`✅ 成功加载 ${matches.value.length} 场比赛（使用当前时间）`)
      }
    } else {
      console.error('❌ 数据加载失败:', response.data?.message)
      matches.value = []
    }
  } catch (error) {
    console.error('❌ 加载比赛数据失败:', error)
    matches.value = []
  } finally {
    loading.value = false
  }
}

const startUpdateTimer = () => {
  // 每10分钟更新一次
  updateTimer = setInterval(() => {
    loadMatches()
  }, 10 * 60 * 1000)
  
  // 倒计时显示
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      countdown.value = 10
    }
  }, 60 * 1000)
}

// 生命周期
onMounted(() => {
  loadMatches()
  startUpdateTimer()
})

onUnmounted(() => {
  if (updateTimer) {
    clearInterval(updateTimer)
  }
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
})
</script>

<style scoped>
.jrkan-homepage {
  min-height: 100vh;
  background-color: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 顶部导航栏 */
.top-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.header-container {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 20px;
}

.logo {
  font-size: 24px;
  font-weight: bold;
  color: white;
}

.domain-links {
  display: flex;
  gap: 20px;
}

.domain-link {
  color: white;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: opacity 0.3s;
}

.domain-link:hover {
  opacity: 0.8;
}

.icon-camera::before {
  content: "📹";
}

.icon-download::before {
  content: "☁️";
}

.language-selector {
  display: flex;
  gap: 10px;
}

.lang {
  padding: 5px 10px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.lang.active {
  background-color: rgba(255,255,255,0.2);
}

.lang:hover {
  background-color: rgba(255,255,255,0.1);
}

/* 主菜单导航 */
.main-nav {
  background-color: white;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.nav-tabs {
  display: flex;
}

.nav-tab {
  padding: 15px 25px;
  cursor: pointer;
  color: #666;
  font-weight: 500;
  border-bottom: 3px solid transparent;
  transition: all 0.3s;
}

.nav-tab:hover {
  color: #333;
  background-color: #f8f9fa;
}

.nav-tab.active {
  color: #667eea;
  border-bottom-color: #667eea;
  background-color: #f8f9fa;
}

/* 备用域名提示 */
.backup-domains {
  background-color: #fff3cd;
  color: #856404;
  padding: 10px 20px;
  text-align: center;
  font-size: 14px;
  border-bottom: 1px solid #ffeaa7;
}

/* 比赛容器 */
.match-container {
  max-width: 1200px;
  margin: 20px auto;
  padding: 0 20px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #666;
  gap: 10px;
}

/* 比赛表格 */
.match-table {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.match-table table {
  width: 100%;
  border-collapse: collapse;
}

.match-table th {
  background-color: #f8f9fa;
  padding: 15px 10px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #e9ecef;
}

.match-table td {
  padding: 15px 10px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
}

.match-row:hover {
  background-color: #f8f9fa;
}

.col-event {
  width: 120px;
}

.col-time {
  width: 100px;
}

.col-status {
  width: 80px;
}

.col-home, .col-away {
  width: 180px;
}

.col-score {
  width: 100px;
  text-align: center;
}

.col-channels {
  width: 200px;
}

.league-name {
  font-weight: 500;
  color: #333;
}

.team-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.team-logo {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.team-name {
  font-weight: 500;
  color: #333;
}

.score {
  font-weight: 600;
  color: #667eea;
  font-size: 16px;
}

.status {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status.live {
  background-color: #ff4757;
  color: white;
}

.status.finished {
  background-color: #747d8c;
  color: white;
}

.status.upcoming {
  background-color: #70a1ff;
  color: white;
}

.channels {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.channel-link {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background-color: #667eea;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 12px;
  transition: background-color 0.3s;
}

.channel-link:hover {
  background-color: #5a67d8;
}

.icon-play::before {
  content: "▶";
  font-size: 10px;
}

.no-data {
  text-align: center;
  padding: 40px;
  color: #666;
}

/* 更新状态 */
.update-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background-color: white;
  border-radius: 8px;
  margin-top: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  font-size: 14px;
  color: #666;
}

.update-countdown {
  color: #667eea;
  font-weight: 500;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header-container {
    flex-direction: column;
    gap: 15px;
    text-align: center;
  }
  
  .nav-tabs {
    justify-content: center;
  }
  
  .match-table {
    overflow-x: auto;
  }
  
  .match-table table {
    min-width: 800px;
  }
  
  .update-status {
    flex-direction: column;
    gap: 10px;
    text-align: center;
  }
}
</style>
