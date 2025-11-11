<template>
  <div class="match-schedule">
    <div class="page-header">
      <h1>比赛赛程</h1>
    </div>

    <div class="matches-container" v-loading="loading">
      <template v-if="groupedMatches.length">
        <div
          v-for="group in groupedMatches"
          :key="group.date"
          class="date-group"
        >
          <div class="date-header">
            <h2>{{ formatDateHeader(group.date) }}</h2>
            <span class="match-count">{{ group.matches.length }} 场比赛</span>
          </div>

          <div class="matches-table">
            <div class="table-header">
              <div class="col-time">时间</div>
              <div class="col-info">对阵 / 文章</div>
              <div class="col-action">操作</div>
            </div>

            <div class="table-body">
              <div
                v-for="match in group.matches"
                :key="match.id"
                class="match-row"
                @click="goToMatch(match.id)"
              >
                <div class="col-time">
                  <span class="time">{{ formatDateTime(match.date, match.time) }}</span>
                  <span class="league-badge">{{ match.league || '未分类' }}</span>
                </div>

                <div class="col-info" @click.stop>
                  <div class="teams-line">
                    <div class="team home">
                      <img
                        :src="getTeamLogo(match.home_team_logo, match.home_team)"
                        :alt="match.home_team"
                        class="team-logo"
                        @error="handleLogoError"
                      />
                      <span class="team-name">{{ match.home_team }}</span>
                    </div>
                    <span class="vs">VS</span>
                    <div class="team away">
                      <span class="team-name">{{ match.away_team }}</span>
                      <img
                        :src="getTeamLogo(match.away_team_logo, match.away_team)"
                        :alt="match.away_team"
                        class="team-logo"
                        @error="handleLogoError"
                      />
                    </div>
                  </div>
                  <div class="article-links">
                    <template v-if="match.articles && match.articles.length">
                      <a
                        v-for="article in match.articles"
                        :key="article.id || article.title"
                        class="article-link"
                        :href="article.url || '#'"
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        @click.stop
                      >
                        {{ article.title }}
                      </a>
                    </template>
                    <span v-else class="article-empty">暂无相关文章</span>
                  </div>
                </div>

                <div class="col-action" @click.stop>
                <el-button
                  class="action-button"
                  type="primary"
                  :disabled="match.canWatch === false"
                  @click.stop="goToMatch(match.id)"
                >
                  {{ match.canWatch === false ? '已结束' : '查看直播' }}
                </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="empty-state">
        <el-empty description="暂无比赛数据">
          <el-button type="primary" @click="refreshData">刷新数据</el-button>
        </el-empty>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { matchesApi, articlesApi } from '@/api'

const router = useRouter()

const matches = ref([])
const loading = ref(false)
let refreshTimer = null

const USE_MOCK_ARTICLES = true

const generateMockArticles = (match) => {
  const home = match.home_team || '主队'
  const away = match.away_team || '客队'
  const league = match.league || '赛事'
  return [
    {
      id: `${match.id}-preview`,
      title: `${home} vs ${away} · 赛前情报速览`,
      url: '#'
    },
    {
      id: `${match.id}-analysis`,
      title: `${league} 战术拆解：${home} 如何应对 ${away}`,
      url: '#'
    }
  ]
}

const normalizeArticleList = (rawArticles) => {
  if (!Array.isArray(rawArticles)) {
    return []
  }
  return rawArticles
    .map(article => {
      const title = article?.title || article?.name || ''
      const url = article?.url || article?.link || ''
      if (!title) return null
      return {
        id: article?.id || `${title}-${url}` || undefined,
        title,
        url,
        source: article?.source || ''
      }
    })
    .filter(Boolean)
}

const normalizeArticleResponse = (payload) => {
  const map = {}
  if (!payload) {
    return map
  }

  const assignArticles = (matchId, articles) => {
    if (!matchId) return
    const key = String(matchId)
    const normalized = normalizeArticleList(articles)
    if (normalized.length > 0) {
      map[key] = normalized
    }
  }

  if (Array.isArray(payload)) {
    payload.forEach(article => {
      assignArticles(article?.matchId ?? article?.match_id, [article])
    })
  } else if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.articles)) {
      payload.articles.forEach(article => {
        assignArticles(article?.matchId ?? article?.match_id, [article])
      })
    } else {
      Object.entries(payload).forEach(([matchId, articles]) => {
        assignArticles(matchId, Array.isArray(articles) ? articles : [articles])
      })
    }
  }
  return map
}

const fetchArticlesForMatches = async (matchIds = []) => {
  if (USE_MOCK_ARTICLES) {
    matches.value = matches.value.map(match => ({
      ...match,
      articles: match.articles && match.articles.length
        ? match.articles
        : generateMockArticles(match)
    }))
    return
  }
  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    return
  }
  try {
    const response = await articlesApi.getByMatchIds(matchIds)
    const payload = response?.data?.data ?? response?.data ?? null
    const articleMap = normalizeArticleResponse(payload)
    if (Object.keys(articleMap).length > 0) {
      matches.value = matches.value.map(match => {
        const articles = articleMap[String(match.id)] || match.articles || []
        return {
          ...match,
          articles
        }
      })
    }
  } catch (error) {
    console.warn('加载比赛文章失败:', error)
  }
}

const fetchMatches = async () => {
  loading.value = true
  try {
    const response = await matchesApi.getMatches()
    console.log('原始API响应:', response)
    
    let matchesData = []
    if (response.data && response.data.code === 200 && response.data.data && response.data.data.matches) {
      matchesData = response.data.data.matches;
    } else if (response.data && response.data.success === true && Array.isArray(response.data.data)) {
      matchesData = response.data.data;
    }
    
    console.log('提取的比赛数据:', matchesData.length, '场')
    
    if (matchesData.length > 0) {
      matches.value = matchesData
        .map(match => {
          const homeTeam = match.home_team || match.homeTeam || ''
          const awayTeam = match.away_team || match.awayTeam || ''
          const rawTime = match.time || match.match_time || ''
          const homeLogo = match.home_team_logo || match.homeLogo || '/teams/default.png'
          const awayLogo = match.away_team_logo || match.awayLogo || '/teams/default.png'
          const parseScore = (scoreValue) => {
            if (scoreValue === null || scoreValue === undefined || scoreValue === '' || Number.isNaN(Number(scoreValue))) {
              return null
            }
            const numeric = Number(scoreValue)
            return Number.isFinite(numeric) ? numeric : null
          }

          const homeScoreVal = parseScore(match.homeScore ?? match.home_score)
          const awayScoreVal = parseScore(match.awayScore ?? match.away_score)

          const currentYear = new Date().getFullYear()
          const parts = rawTime.trim().split(/\s+/)
          if (parts.length < 2) {
            return null
          }

          const [datePart, timePart] = parts
          const timeSegments = timePart.split(':')
          if (timeSegments.length < 2) {
            return null
          }

          let year = currentYear
          let month
          let day

          if (/^\d{4}[\/-]\d{2}[\/-]\d{2}$/.test(datePart)) {
            const [y, m, d] = datePart.split(/[\/-]/)
            year = Number(y)
            month = Number(m)
            day = Number(d)
          } else if (/^\d{2}-\d{2}$/.test(datePart)) {
            const [m, d] = datePart.split('-')
            month = Number(m)
            day = Number(d)
          } else {
            return null
          }

          const [hour, minute] = timeSegments

          if (
            Number.isNaN(year) ||
            Number.isNaN(month) ||
            Number.isNaN(day) ||
            Number.isNaN(Number(hour)) ||
            Number.isNaN(Number(minute))
          ) {
            return null
          }

          const matchDateTime = new Date(year, month - 1, day, Number(hour), Number(minute))
          if (Number.isNaN(matchDateTime.getTime())) {
            return null
          }

          const dateStr = [
            year,
            String(month).padStart(2, '0'),
            String(day).padStart(2, '0')
          ].join('-')
          const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

          return {
            id: match.id,
            date: dateStr,
            time: timeStr,
            home_team: homeTeam,
            away_team: awayTeam,
            home_team_logo: homeLogo,
            away_team_logo: awayLogo,
            homeScore: homeScoreVal,
            awayScore: awayScoreVal,
            league: match.league || '',
            channels: match.channels || [],
          canWatch: match.canWatch !== false,
            articles: normalizeArticleList(match.articles || match.articleLinks || []),
            category: match.league.includes('NBA') || match.league.includes('CBA') || match.league.includes('韩篮甲') || match.league.includes('WNBA') || match.league.includes('中女锦') || match.league.includes('NBL') || match.league.includes('VTB联赛') ? 'basketball' : 
                     match.league.includes('网球') || match.league.includes('Tiburon') ? 'other' : 'football'
          }
        })
        .filter(Boolean)
      console.log(`✅ 获取到 ${matches.value.length} 场比赛`)
      await fetchArticlesForMatches(matches.value.map(match => match.id))
    } else {
      console.log('❌ 没有获取到比赛数据')
      matches.value = []
    }
  } catch (error) {
    console.error('获取比赛数据失败:', error)
    ElMessage.error('获取比赛数据失败')
  } finally {
    loading.value = false
  }
}

const groupedMatches = computed(() => {
  const groups = new Map()
  matches.value.forEach(match => {
    const groupKey = match.date || '未知日期'
    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey).push(match)
  })

  return Array.from(groups.entries())
    .map(([date, matches]) => ({ date, matches }))
})

// 格式化完整日期时间
const formatDateTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return ''
  
  try {
    const [year, month, day] = dateStr.split('-').map(Number)
    const [hour, minute] = timeStr.split(':').map(Number)
    if (
      Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) ||
      Number.isNaN(hour) || Number.isNaN(minute)
    ) {
      return `${dateStr} ${timeStr}`
    }
    const date = new Date(year, month - 1, day, hour, minute)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    console.error('日期时间格式化错误:', error)
    return `${dateStr} ${timeStr}`
  }
}

const formatDateHeader = (date) => {
  const [year, month, day] = date.split('-').map(Number)
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return date
  }
  return `${month}月${day}日`
}

const goToMatch = async (matchId) => {
  const match = matches.value.find(m => m.id === matchId)
  
  if (!match) {
    ElMessage.error('未找到比赛信息')
    return
  }
  
  const streamId = match.id
  const matchSnapshot = {
    id: match.id,
    league: match.league || match.tournament || match.competition || '',
    round: match.round || '',
    startTime: match.startTime || '',
    startTimestamp: match.startTimestamp || match.matchTimestamp || null,
    date: match.date || '',
    time: match.time || '',
    status: match.status || '',
    statusText: match.statusText || '',
    homeTeam: match.homeTeam || match.home_team || match.home || match.hostTeam || '',
    awayTeam: match.awayTeam || match.away_team || match.away || match.guestTeam || '',
    homeLogo: match.homeLogo || match.home_team_logo || '',
    awayLogo: match.awayLogo || match.away_team_logo || '',
    homeScore: match.homeScore ?? match.home_score ?? null,
    awayScore: match.awayScore ?? match.away_score ?? null,
    venue: match.venue || '',
    startTimeText: match.startTimeText || (match.date && match.time ? formatDateTime(match.date, match.time) : '')
  }
  const defaultPlayPage = `http://play.jgdhds.com/play/steam${streamId}.html`

  try {
    const payload = {
      match: matchSnapshot,
      defaultPlayPage,
      session: '',
      createdAt: Date.now()
    }
    sessionStorage.setItem(
      `player_payload_${streamId}`,
      JSON.stringify(payload)
    )
  } catch (error) {
    console.warn('缓存比赛信息失败:', error)
  }

  ElMessage.closeAll()
  router.push({ name: 'Player', params: { streamId } })
}

const refreshData = () => {
  fetchMatches()
  ElMessage.success('数据已刷新')
}

const startAutoRefresh = () => {
  refreshTimer = setInterval(() => {
    console.log('🔄 自动刷新比赛数据...')
    fetchMatches()
  }, 2 * 60 * 1000)
}

const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

const getTeamLogo = (logo, teamName) => {
  if (logo && logo !== '/teams/default.png') {
    return logo
  }
  return '/teams/default.png'
}

const handleLogoError = (event) => {
  event.target.src = '/teams/default.png'
}

onMounted(() => {
  fetchMatches()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
@import '../styles/match-meta.css';
.match-schedule {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
}

.page-header h1 {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 0 0 20px 0;
  color: #2c3e50;
  font-size: 28px;
}

.matches-container {
  min-height: 400px;
}

.date-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 15px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px;
}

.date-header h2 {
  margin: 0;
  font-size: 20px;
}

.match-count {
  font-size: 14px;
  opacity: 0.9;
}

.matches-table {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.table-header {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr) 180px;
  gap: 18px;
  padding: 16px 22px;
  background: #f8f9fa;
  font-weight: 600;
  color: #495057;
  border-bottom: 2px solid #dee2e6;
}

.table-body {
  overflow-y: visible;
}

.match-row {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr) 180px;
  gap: 18px;
  padding: 18px 22px;
  border-bottom: 1px solid #e9ecef;
  cursor: pointer;
  transition: all 0.2s ease;
}

.match-row:hover {
  background: #f3f6ff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.col-time {
  display: grid;
  gap: 10px;
  color: #7f8c8d;
  font-size: 13px;
  align-content: flex-start;
  justify-items: flex-start;
}

.col-info {
  display: grid;
  gap: 12px;
}

.article-links {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  overflow: hidden;
}

.article-link {
  font-size: 13px;
  color: #345df2;
  text-decoration: none;
  word-break: keep-all;
  white-space: nowrap;
}

.article-link:hover {
  text-decoration: underline;
}

.article-empty {
  font-size: 12px;
  color: #9aa4b8;
  white-space: nowrap;
}

.col-action {
  display: grid;
  gap: 10px;
  justify-items: end;
}

.action-button {
  letter-spacing: 0.16em;
  border-radius: 999px;
  padding: 10px 24px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.action-button.is-disabled,
.action-button:disabled {
  background: rgba(120, 144, 156, 0.3);
  border-color: transparent;
  color: #7a8b99;
  cursor: not-allowed;
  box-shadow: none;
}

.date-group {
  margin-bottom: 28px;
}

.date-group:last-of-type {
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .table-header,
  .match-row {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 14px 16px;
  }

  .col-time {
    grid-template-columns: repeat(2, auto);
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .col-action {
    justify-items: flex-start;
  }
}
</style>