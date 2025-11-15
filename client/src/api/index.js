import axios from 'axios'
import { showError } from '@/utils/message'

// 创建axios实例
const api = axios.create({
  baseURL: '/api', // 使用相对路径，让Vite代理处理
  timeout: 30000, // 增加超时时间到30秒，因为爬虫需要时间
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
api.interceptors.request.use(
  config => {
    // 添加 Token 到请求头
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    console.log('发送请求:', config.url, '完整URL:', config.baseURL + config.url)
    return config
  },
  error => {
    console.error('请求错误:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  response => {
    const { data } = response
    console.log('API响应:', data)
    
    // 兼容不同的响应格式
    if (data.code === 200 || data.success === true) {
      // 标准化响应格式 - 统一转换为前端期望的格式
      if (data.success === true && Array.isArray(data.data)) {
        // JRKAN API格式: {success: true, data: [...], total: 26}
        const standardizedData = {
          code: 200,
          data: {
            matches: data.data,
            total: data.total || data.data.length,
            page: 1,
            limit: data.data.length
          }
        }
        console.log('🔄 数据格式转换:', standardizedData)
        response.data = standardizedData
      }
      return response  // 返回完整的axios响应对象
    } else {
      // 如果 success 为 false，提取错误消息
      const errorMessage = data.message || '请求失败'
      console.error('API错误:', errorMessage)
      const error = new Error(errorMessage)
      error.response = response
      return Promise.reject(error)
    }
  },
  error => {
    console.error('响应错误:', error)
    
    // 处理 HTTP 错误响应
    if (error.response) {
      const { data, status } = error.response
      console.error('错误响应详情:', {
        status,
        data,
        message: data?.message,
        error: data?.error
      })
      // 优先使用后端返回的 message，如果没有则使用 error 字段，最后才使用默认消息
      const errorMessage = data?.message || data?.error || error.message || '请求失败，请稍后重试'
      
      // 处理 401 未授权错误
      if (status === 401) {
        // 清除本地存储的 token
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
        
        // 如果不在登录页面，跳转到登录页
        if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
          window.location.href = '/login'
        }
      }
      
      // 创建新的错误对象，确保消息正确传递
      const newError = new Error(errorMessage)
      newError.response = error.response
      return Promise.reject(newError)
    }
    
    // 网络错误或其他错误
    return Promise.reject(error)
  }
)

// 比赛相关API
export const matchesApi = {
  // 获取比赛列表
  getMatches(params = {}) {
    return api.get('/matches', { params })
  },
  
  // 获取比赛详情
  getMatchDetail(id) {
    return api.get(`/matches/detail/${id}`)
  },
  
  // 获取联赛列表
  getLeagues() {
    return api.get('/matches/leagues/list')
  },
  
  // 搜索比赛
  searchMatches(keyword, limit = 10) {
    return api.get(`/matches/search/${keyword}`, { params: { limit } })
  }
}

// 直播相关API
export const liveApi = {
  // 获取直播信号源
  getStreamSources(matchId) {
    return api.get(`/live/sources/${matchId}`)
  },
  
  // 切换信号源
  switchSource(matchId, sourceId) {
    return api.post('/live/switch', { matchId, sourceId })
  },
  
  // 测试信号源
  testSource(sourceId) {
    return api.post(`/live/test/${sourceId}`)
  },
  
  // 获取正在直播的比赛
  getLiveMatches() {
    return api.get('/live/now')
  },
  
  // 记录观看历史
  recordWatch(matchId, sourceId, duration = 0) {
    return api.post('/live/watch', { matchId, sourceId, duration })
  }
}

// 爬虫相关API
export const crawlerApi = {
  // 手动触发爬取
  triggerCrawl() {
    return api.post('/crawler/trigger')
  },
  
  // 获取爬虫日志
  getLogs(params = {}) {
    return api.get('/crawler/logs', { params })
  },
  
  // 获取爬虫统计
  getStats() {
    return api.get('/crawler/stats')
  },
  
  // 清理数据
  cleanup(days = 7) {
    return api.post('/crawler/cleanup', { days })
  }
}

// 文章相关API（预留接口）
export const articlesApi = {
  /**
   * 批量获取比赛相关文章
   * @param {Array<string|number>} matchIds
   */
  getByMatchIds(matchIds = []) {
    if (!Array.isArray(matchIds) || matchIds.length === 0) {
      return Promise.resolve({ data: { code: 200, data: {} } })
    }
    const ids = matchIds.join(',')
    return api.get('/articles/by-match', {
      params: { ids }
    })
  }
}

// 用户认证相关API
export const authApi = {
  // 获取图形验证码
  getCaptcha() {
    return api.get('/auth/captcha')
  },
  
  // 用户注册
  register(data) {
    return api.post('/auth/register', data)
  },
  
  // 用户登录
  login(data) {
    return api.post('/auth/login', data)
  },
  
  // 获取当前用户信息
  getMe() {
    return api.get('/auth/me')
  },
  
  // 刷新 Token
  refreshToken(refreshToken) {
    return api.post('/auth/refresh', { refreshToken })
  },
  
  // 用户登出
  logout() {
    return api.post('/auth/logout')
  }
}

// 用户资料相关API
export const userApi = {
  // 获取用户资料
  getProfile() {
    return api.get('/user/profile')
  },
  
  // 更新用户资料
  updateProfile(data) {
    return api.put('/user/profile', data)
  },
  
  // 上传头像
  uploadAvatar(file) {
    const formData = new FormData()
    formData.append('avatar', file)
    return api.post('/user/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  
  // 修改密码
  changePassword(data) {
    return api.post('/user/password', data)
  }
}

// 关注专家相关API
export const followApi = {
  // 获取专家列表
  getExperts(params = {}) {
    return api.get('/follow/experts', { params })
  },
  
  // 获取当前用户关注的专家列表
  getFollowing() {
    return api.get('/follow/following')
  },
  
  // 关注专家
  followExpert(expertId) {
    return api.post(`/follow/${expertId}`)
  },
  
  // 取消关注专家
  unfollowExpert(expertId) {
    return api.delete(`/follow/${expertId}`)
  },
  
  // 检查是否关注了某个专家
  checkFollowing(expertId) {
    return api.get(`/follow/check/${expertId}`)
  },
  
  // 批量检查关注状态
  checkBatchFollowing(expertIds) {
    return api.post('/follow/check-batch', { expertIds })
  }
}

// 比赛聊天相关API
export const chatApi = {
  // 获取聊天历史消息
  getHistory(matchId, limit = 50) {
    return api.get(`/chat/${matchId}/history`, { params: { limit } })
  },
  
  // 发送聊天消息
  sendMessage(matchId, content) {
    return api.post(`/chat/${matchId}/message`, { content })
  }
}

export default api
