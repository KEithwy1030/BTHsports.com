<template>
  <div class="match-chat">
    <div class="chat-header">
      <h3>聊天区</h3>
      <span v-if="connected" class="status connected">已连接</span>
      <span v-else class="status disconnected">未连接</span>
    </div>

    <!-- 聊天消息列表 -->
    <div ref="messagesContainer" class="chat-messages">
      <div v-if="messages.length === 0 && !loading" class="empty-chat">
        <p>暂无聊天记录，快来发言吧！</p>
      </div>

      <div
        v-for="message in messages"
        :key="message.id"
        class="chat-message"
      >
        <span class="message-nickname">{{ message.nickname }}：</span>
        <span class="message-text">{{ message.content }}</span>
        <span class="message-time">{{ formatTime(message.createdAt) }}</span>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="chat-input-area">
      <div v-if="!userStore.loggedIn" class="login-prompt">
        <el-button type="primary" size="small" @click="$router.push('/login')">
          登录后发言
        </el-button>
      </div>
      <div v-else class="input-group">
        <el-input
          v-model="inputMessage"
          placeholder="输入消息（最多50字）"
          :maxlength="50"
          show-word-limit
          :disabled="sending"
          @keyup.enter="sendMessage"
        />
        <el-button
          type="primary"
          :loading="sending"
          :disabled="!inputMessage.trim()"
          @click="sendMessage"
        >
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { chatApi } from '@/api'
import { showError, showWarning } from '@/utils/message'

const props = defineProps({
  matchId: {
    type: [Number, String],
    required: true
  },
  startTime: {
    type: [String, Number, Date],
    default: null
  }
})

const router = useRouter()
const userStore = useUserStore()

const messages = ref([])
const inputMessage = ref('')
const loading = ref(false)
const sending = ref(false)
const connected = ref(false)
const messagesContainer = ref(null)
const eventSource = ref(null)
const currentUserId = computed(() => userStore.user?.id || null)

// 格式化时间
const formatTime = (timeString) => {
  if (!timeString) return ''
  const date = new Date(timeString)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 加载历史消息
const loadHistory = async () => {
  loading.value = true
  try {
    const response = await chatApi.getHistory(props.matchId, 50)
    const { data } = response.data
    
    messages.value = data.messages || []
    scrollToBottom()
  } catch (error) {
    console.error('加载聊天历史失败:', error)
  } finally {
    loading.value = false
  }
}

// 建立SSE连接
const connectSSE = () => {
  if (eventSource.value) {
    eventSource.value.close()
  }

  const token = localStorage.getItem('token')
  const url = `/api/chat/${props.matchId}/stream`
  
  eventSource.value = new EventSource(url)

  eventSource.value.onopen = () => {
    connected.value = true
    console.log('SSE连接已建立')
  }

  eventSource.value.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      
      if (data.type === 'connected') {
        console.log('SSE连接成功')
      } else if (data.type === 'message') {
        // 收到新消息
        messages.value.push(data.data)
        scrollToBottom()
      }
    } catch (error) {
      console.error('解析SSE消息失败:', error)
    }
  }

  eventSource.value.onerror = (error) => {
    console.error('SSE连接错误:', error)
    connected.value = false
    
    // 尝试重连
    setTimeout(() => {
      if (eventSource.value?.readyState === EventSource.CLOSED) {
        connectSSE()
      }
    }, 3000)
  }
}

// 发送消息
const sendMessage = async () => {
  if (!userStore.loggedIn) {
    router.push('/login')
    return
  }

  const content = inputMessage.value.trim()
  if (!content) {
    return
  }

  if (content.length > 50) {
    showWarning('消息内容不能超过50个字符，请缩短后重试')
    return
  }

  // 前端判断：如果比赛已结束超过5小时，直接提示（快速响应，不发送请求）
  if (props.startTime) {
    const startTimeDate = new Date(props.startTime)
    const now = new Date()
    const hoursDiff = (now - startTimeDate) / (1000 * 60 * 60)
    
    // 比赛已开始且超过5小时，不允许发言
    if (startTimeDate <= now && hoursDiff > 5) {
      showError('比赛已结束')
      return
    }
  }

  sending.value = true
  try {
    const response = await chatApi.sendMessage(props.matchId, content)
    
    if (response.data.success) {
      inputMessage.value = ''
      // 消息会通过SSE推送，不需要手动添加
    } else {
      showError(response.data.message || '消息发送失败，请检查网络连接或稍后重试')
    }
  } catch (error) {
    console.error('发送消息错误:', error)
    console.error('错误详情:', {
      response: error.response,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    })
    
    // 提取具体的错误信息
    let errorMessage = '消息发送失败，请检查网络连接或稍后重试'
    
    if (error.response) {
      // 有响应，使用后端返回的错误信息
      errorMessage = error.response.data?.message || error.message || errorMessage
      
      // 根据状态码提供更具体的提示
      if (error.response.status === 401) {
        errorMessage = '请先登录后再发送消息'
      } else if (error.response.status === 429) {
        errorMessage = error.response.data?.message || '发言过于频繁，请稍后再试'
      } else if (error.response.status === 400) {
        errorMessage = error.response.data?.message || '消息内容不符合要求，请检查后重试'
      } else if (error.response.status === 404) {
        errorMessage = error.response.data?.message || '比赛不存在，无法发送消息'
      } else if (error.response.status === 500) {
        errorMessage = error.response.data?.message || '服务器错误，请稍后重试'
      }
    } else if (error.message) {
      // 网络错误或其他错误
      if (error.message.includes('Network Error') || error.message.includes('timeout')) {
        errorMessage = '网络连接失败，请检查网络后重试'
      } else {
        errorMessage = error.message
      }
    }
    
    showError(errorMessage)
  } finally {
    sending.value = false
  }
}

// 监听matchId变化
watch(() => props.matchId, (newId) => {
  if (newId) {
    messages.value = []
    if (eventSource.value) {
      eventSource.value.close()
    }
    loadHistory()
    connectSSE()
  }
})

onMounted(() => {
  if (props.matchId) {
    loadHistory()
    connectSSE()
  }
})

onUnmounted(() => {
  if (eventSource.value) {
    eventSource.value.close()
    eventSource.value = null
  }
})
</script>

<style scoped>
.match-chat {
  display: flex;
  flex-direction: column;
  height: 500px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: white;
  overflow: hidden;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
  background: #f5f7fa;
}

.chat-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.status.connected {
  color: #67c23a;
  background: #f0f9ff;
}

.status.disconnected {
  color: #909399;
  background: #f5f7fa;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-chat {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
}

.chat-message {
  display: flex;
  align-items: baseline;
  line-height: 1.6;
  word-wrap: break-word;
  word-break: break-all;
  padding: 4px 0;
}

.message-nickname {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  flex-shrink: 0;
}

.message-text {
  flex: 1;
  font-size: 14px;
  color: #606266;
  margin: 0 12px;
  word-wrap: break-word;
  word-break: break-all;
  min-width: 0;
}

.message-time {
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
  white-space: nowrap;
  margin-left: auto;
}

.chat-input-area {
  padding: 12px 16px;
  border-top: 1px solid #e4e7ed;
  background: #fafafa;
}

.login-prompt {
  text-align: center;
  padding: 8px 0;
}

.input-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-group .el-input {
  flex: 1;
}

/* 滚动条样式 */
.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 响应式 */
@media (max-width: 768px) {
  .match-chat {
    height: 400px;
  }
  
  .chat-messages {
    padding: 12px;
  }
}
</style>

