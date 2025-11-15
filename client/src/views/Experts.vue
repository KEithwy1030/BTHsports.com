<template>
  <div class="experts-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <h2>专家列表</h2>
          <el-input
            v-model="keyword"
            placeholder="搜索专家"
            style="width: 300px"
            clearable
            @input="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </template>

      <div v-loading="loading" class="experts-list">
        <div v-if="experts.length === 0 && !loading" class="empty-state">
          <el-empty description="暂无专家" />
        </div>

        <div v-else class="experts-grid">
          <div v-for="expert in experts" :key="expert.id" class="expert-card">
            <div class="expert-avatar">
              <el-avatar :size="64" :src="getAvatarUrl(expert.avatar)">
                {{ expert.nickname.charAt(0).toUpperCase() }}
              </el-avatar>
            </div>
            <div class="expert-info">
              <h3 class="expert-name">{{ expert.nickname }}</h3>
              <p class="expert-username">@{{ expert.username }}</p>
            </div>
            <div class="expert-actions">
              <el-button
                v-if="userStore.loggedIn"
                :type="isFollowingMap[expert.id] ? 'info' : 'primary'"
                :loading="loadingMap[expert.id]"
                @click="toggleFollow(expert.id)"
              >
                {{ isFollowingMap[expert.id] ? '已关注' : '关注' }}
              </el-button>
              <el-button v-else type="primary" @click="$router.push('/login')">
                登录后关注
              </el-button>
            </div>
          </div>
        </div>

        <!-- 分页 -->
        <div v-if="pagination.totalPages > 1" class="pagination">
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.limit"
            :total="pagination.total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="loadExperts"
            @current-change="loadExperts"
          />
        </div>
      </div>
    </el-card>

    <!-- 我关注的专家 -->
    <el-card v-if="userStore.loggedIn" class="following-card">
      <template #header>
        <h2>我关注的专家</h2>
      </template>

      <div v-loading="followingLoading" class="following-list">
        <div v-if="following.length === 0 && !followingLoading" class="empty-state">
          <el-empty description="还没有关注任何专家" />
        </div>

        <div v-else class="following-grid">
          <div v-for="expert in following" :key="expert.id" class="following-item">
            <el-avatar :size="40" :src="getAvatarUrl(expert.avatar)">
              {{ expert.nickname.charAt(0).toUpperCase() }}
            </el-avatar>
            <div class="following-info">
              <span class="following-name">{{ expert.nickname }}</span>
              <span class="following-username">@{{ expert.username }}</span>
            </div>
            <el-button
              type="danger"
              size="small"
              :loading="loadingMap[expert.id]"
              @click="toggleFollow(expert.id)"
            >
              取消关注
            </el-button>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { followApi } from '@/api'
import { showError, showSuccess, showApiError } from '@/utils/message'
import { Search } from '@element-plus/icons-vue'

// 简单的防抖函数
const debounce = (func, wait) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

const router = useRouter()
const userStore = useUserStore()

const loading = ref(false)
const followingLoading = ref(false)
const keyword = ref('')
const experts = ref([])
const following = ref([])
const loadingMap = ref({})
const isFollowingMap = ref({})

const pagination = ref({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0
})

// 获取头像URL
const getAvatarUrl = (avatar) => {
  if (!avatar) return ''
  if (avatar.startsWith('http')) return avatar
  return avatar.startsWith('/') ? avatar : `/${avatar}`
}

// 加载专家列表
const loadExperts = async () => {
  loading.value = true
  try {
    const response = await followApi.getExperts({
      page: pagination.value.page,
      limit: pagination.value.limit,
      keyword: keyword.value
    })
    const { data } = response.data
    
    experts.value = data.experts || []
    pagination.value = {
      ...pagination.value,
      ...data.pagination
    }

    // 批量检查关注状态
    if (userStore.loggedIn && experts.value.length > 0) {
      await checkFollowingStatus(experts.value.map(e => e.id))
    }
  } catch (error) {
    showError('加载专家列表失败，请刷新页面重试')
  } finally {
    loading.value = false
  }
}

// 加载关注的专家列表
const loadFollowing = async () => {
  if (!userStore.loggedIn) return

  followingLoading.value = true
  try {
    const response = await followApi.getFollowing()
    const { data } = response.data
    
    following.value = data.experts || []
    
    // 更新关注状态映射
    following.value.forEach(expert => {
      isFollowingMap.value[expert.id] = true
    })
  } catch (error) {
    showError('加载关注列表失败，请刷新页面重试')
  } finally {
    followingLoading.value = false
  }
}

// 检查关注状态
const checkFollowingStatus = async (expertIds) => {
  if (!userStore.loggedIn || expertIds.length === 0) return

  try {
    const response = await followApi.checkBatchFollowing(expertIds)
    const { data } = response.data
    
    Object.assign(isFollowingMap.value, data.followingMap)
  } catch (error) {
    console.error('检查关注状态失败:', error)
  }
}

// 切换关注状态
const toggleFollow = async (expertId) => {
  if (!userStore.loggedIn) {
    router.push('/login')
    return
  }

  loadingMap.value[expertId] = true
  try {
    const isFollowing = isFollowingMap.value[expertId]

    if (isFollowing) {
      await followApi.unfollowExpert(expertId)
      showSuccess('已取消关注该专家')
      isFollowingMap.value[expertId] = false
      
      // 从关注列表中移除
      following.value = following.value.filter(e => e.id !== expertId)
    } else {
      await followApi.followExpert(expertId)
      showSuccess('已成功关注该专家，将收到其发布的方案通知')
      isFollowingMap.value[expertId] = true
      
      // 添加到关注列表
      const expert = experts.value.find(e => e.id === expertId)
      if (expert) {
        following.value.unshift({
          ...expert,
          followedAt: new Date()
        })
      }
    }
  } catch (error) {
    const message = error.response?.data?.message || error.message || '操作失败'
    showApiError(error, '操作失败，请稍后重试')
  } finally {
    loadingMap.value[expertId] = false
  }
}

// 搜索（防抖）
const handleSearch = debounce(() => {
  pagination.value.page = 1
  loadExperts()
}, 500)

onMounted(() => {
  loadExperts()
  if (userStore.loggedIn) {
    loadFollowing()
  }
})
</script>

<style scoped>
.experts-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.experts-list {
  min-height: 400px;
}

.experts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.expert-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  transition: all 0.3s;
}

.expert-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.expert-avatar {
  margin-bottom: 16px;
}

.expert-info {
  text-align: center;
  margin-bottom: 16px;
  flex: 1;
}

.expert-name {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.expert-username {
  margin: 0;
  font-size: 14px;
  color: #909399;
}

.expert-actions {
  width: 100%;
}

.expert-actions .el-button {
  width: 100%;
}

.following-card {
  margin-top: 24px;
}

.following-card h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.following-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.following-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}

.following-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.following-name {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}

.following-username {
  font-size: 12px;
  color: #909399;
}

.pagination {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

.empty-state {
  padding: 60px 0;
  text-align: center;
}

/* 响应式 */
@media (max-width: 768px) {
  .experts-container {
    padding: 10px;
  }
  
  .card-header {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }
  
  .experts-grid {
    grid-template-columns: 1fr;
  }
}
</style>

