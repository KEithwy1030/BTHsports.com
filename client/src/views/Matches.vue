<template>
  <div class="matches-page">
    <div class="page-header">
      <h2><el-icon><Calendar /></el-icon> 比赛列表</h2>
      <div class="header-actions">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索比赛..."
          @input="handleSearch"
          clearable
          style="width: 250px; margin-right: 10px;"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" @click="refreshData">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <!-- 筛选器 -->
    <div class="filters">
      <el-row :gutter="20">
        <el-col :span="6">
          <el-select v-model="selectedLeague" placeholder="选择联赛" clearable @change="handleFilter">
            <el-option label="全部联赛" value="" />
            <el-option 
              v-for="league in leagues" 
              :key="league.league" 
              :label="league.league" 
              :value="league.league" 
            />
          </el-select>
        </el-col>
        <el-col :span="6">
          <el-select v-model="selectedStatus" placeholder="选择状态" clearable @change="handleFilter">
            <el-option label="全部状态" value="" />
            <el-option label="即将开始" value="upcoming" />
            <el-option label="直播中" value="live" />
            <el-option label="已结束" value="finished" />
          </el-select>
        </el-col>
        <el-col :span="6">
          <el-date-picker
            v-model="selectedDate"
            type="date"
            placeholder="选择日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            @change="handleFilter"
            clearable
          />
        </el-col>
        <el-col :span="6">
          <el-button @click="resetFilters">重置筛选</el-button>
        </el-col>
      </el-row>
    </div>

    <!-- 比赛列表 -->
    <div v-loading="loading" class="matches-list">
      <div v-if="matches.length === 0 && !loading" class="empty-state">
        <el-empty description="暂无比赛数据">
          <el-button type="primary" @click="refreshData">刷新数据</el-button>
        </el-empty>
      </div>

      <div v-else>
        <div 
          v-for="match in matches" 
          :key="match.id"
          class="match-item"
          @click="goToMatch(match.id)"
        >
          <div class="match-time">
            <div class="datetime">{{ formatTime(match.match_time) }}</div>
          </div>

          <div class="match-content">
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

            <div class="match-info">
              <div class="league">{{ match.league }}</div>
              <div class="source-info" v-if="match.source_count > 0">
                <el-icon><VideoPlay /></el-icon>
                {{ match.source_count }} 个信号源
              </div>
            </div>
          </div>

          <div class="match-status">
            <el-tag :type="getStatusType(match.status)">
              {{ getStatusText(match.status) }}
            </el-tag>
            <div class="quality-score" v-if="match.avg_quality">
              画质: {{ Math.round(match.avg_quality) }}分
            </div>
          </div>

          <div class="match-actions">
            <el-button 
              v-if="match.status === 'live'" 
              type="primary" 
              size="small"
              @click.stop="goToMatch(match.id)"
            >
              <el-icon><VideoPlay /></el-icon>
              观看
            </el-button>
            <el-button 
              v-else-if="match.status === 'upcoming'" 
              type="info" 
              size="small"
              disabled
            >
              即将开始
            </el-button>
            <el-button 
              v-else 
              type="success" 
              size="small"
              @click.stop="goToMatch(match.id)"
            >
              查看回放
            </el-button>
          </div>
        </div>

        <!-- 分页 -->
        <div class="pagination" v-if="pagination.total > 0">
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="pagination.total"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { matchesApi } from '@/api'
import { Calendar, Search, Refresh, VideoPlay } from '@element-plus/icons-vue'
import { showError } from '@/utils/message'

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const matches = ref([])
const leagues = ref([])
const pagination = ref({
  page: 1,
  limit: 20,
  total: 0,
  pages: 0
})

// 筛选条件
const searchKeyword = ref('')
const selectedLeague = ref('')
const selectedStatus = ref('')
const selectedDate = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

// 获取比赛列表
const fetchMatches = async () => {
  try {
    loading.value = true
    
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      league: selectedLeague.value,
      status: selectedStatus.value
    }

    const data = await matchesApi.getMatches(params)
    matches.value = data.matches || []
    pagination.value = data.pagination || pagination.value
    
  } catch (error) {
    console.error('获取比赛列表失败:', error)
    showError('获取比赛数据失败，请刷新页面重试')
  } finally {
    loading.value = false
  }
}

// 获取联赛列表
const fetchLeagues = async () => {
  try {
    const data = await matchesApi.getLeagues()
    leagues.value = data || []
  } catch (error) {
    console.error('获取联赛列表失败:', error)
  }
}

// 搜索比赛
const handleSearch = async () => {
  if (!searchKeyword.value.trim()) {
    fetchMatches()
    return
  }
  
  try {
    loading.value = true
    const data = await matchesApi.searchMatches(searchKeyword.value, 50)
    matches.value = data || []
    pagination.value = { total: data.length, page: 1, limit: 50, pages: 1 }
  } catch (error) {
    console.error('搜索比赛失败:', error)
    showError('搜索失败，请检查搜索关键词或稍后重试')
  } finally {
    loading.value = false
  }
}

// 筛选处理
const handleFilter = () => {
  currentPage.value = 1
  fetchMatches()
}

// 重置筛选
const resetFilters = () => {
  searchKeyword.value = ''
  selectedLeague.value = ''
  selectedStatus.value = ''
  selectedDate.value = ''
  currentPage.value = 1
  fetchMatches()
}

// 刷新数据
const refreshData = () => {
  fetchMatches()
  fetchLeagues()
}

// 跳转到比赛详情
const goToMatch = (matchId) => {
  router.push(`/match/${matchId}`)
}

// 分页处理
const handleSizeChange = (size) => {
  pageSize.value = size
  currentPage.value = 1
  fetchMatches()
}

const handleCurrentChange = (page) => {
  currentPage.value = page
  fetchMatches()
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

// 格式化日期
const formatDate = (timeString) => {
  if (!timeString) return ''
  const date = new Date(timeString)
  if (isNaN(date.getTime())) return timeString
  
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
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

// 监听路由参数变化
watch(() => route.query, (newQuery) => {
  if (newQuery.league) {
    selectedLeague.value = newQuery.league
  }
  handleFilter()
}, { immediate: true })

onMounted(() => {
  fetchLeagues()
  fetchMatches()
})
</script>

<style scoped>
.matches-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  flex-wrap: wrap;
  gap: 20px;
}

.page-header h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: #2c3e50;
  font-size: 24px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filters {
  background: white;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.matches-list {
  min-height: 400px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.match-item {
  display: flex;
  align-items: center;
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 15px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.3s ease;
  gap: 20px;
}

.match-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.match-time {
  text-align: center;
  min-width: 80px;
}

.match-time .date {
  font-size: 14px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 4px;
}

.match-time .time {
  font-size: 12px;
  color: #666;
}

.match-time .datetime {
  font-size: 13px;
  font-weight: 600;
  color: #2c3e50;
  line-height: 1.4;
}

.match-content {
  flex: 1;
}

.teams {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.team {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.team.home-team {
  justify-content: flex-end;
  text-align: right;
}

.team.away-team {
  justify-content: flex-start;
  text-align: left;
}

.team img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.team span {
  font-size: 14px;
  font-weight: 600;
}

.team .score {
  font-size: 16px;
  font-weight: bold;
  color: #ff4757;
  min-width: 20px;
}

.vs {
  font-weight: bold;
  color: #999;
  margin: 0 20px;
}

.match-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #666;
}

.league {
  font-weight: 600;
  color: #667eea;
}

.source-info {
  display: flex;
  align-items: center;
  gap: 4px;
}

.match-status {
  text-align: center;
  min-width: 100px;
}

.quality-score {
  font-size: 11px;
  color: #666;
  margin-top: 4px;
}

.match-actions {
  min-width: 100px;
  text-align: center;
}

.pagination {
  display: flex;
  justify-content: center;
  margin-top: 30px;
  padding: 20px 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  
  .header-actions {
    justify-content: center;
  }
  
  .match-item {
    flex-direction: column;
    gap: 15px;
    text-align: center;
  }
  
  .teams {
    flex-direction: column;
    gap: 10px;
  }
  
  .team.home-team,
  .team.away-team {
    justify-content: center;
    text-align: center;
  }
  
  .vs {
    margin: 0;
  }
  
  .match-info {
    flex-direction: column;
    gap: 5px;
  }
}
</style>
