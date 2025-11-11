import axios from 'axios'

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
      console.error('API错误:', data.message)
      return Promise.reject(new Error(data.message))
    }
  },
  error => {
    console.error('响应错误:', error.message)
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

export default api
