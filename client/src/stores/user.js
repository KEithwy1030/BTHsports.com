/**
 * 用户状态管理 (Pinia)
 */

import { defineStore } from 'pinia'
import { authApi } from '@/api'
import { showSuccess, showApiError } from '@/utils/message'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    token: localStorage.getItem('token') || null,
    refreshToken: localStorage.getItem('refreshToken') || null,
    isAuthenticated: false
  }),

  getters: {
    // 用户是否已登录
    loggedIn: (state) => !!state.token && !!state.user,
    
    // 用户昵称
    nickname: (state) => state.user?.nickname || state.user?.username || '游客',
    
    // 用户角色
    role: (state) => state.user?.role || 'user',
    
    // 是否是专家
    isExpert: (state) => state.user?.role === 'expert',
    
    // 是否是管理员
    isAdmin: (state) => state.user?.role === 'admin'
  },

  actions: {
    // 设置用户信息
    setUser(user) {
      this.user = user
      this.isAuthenticated = !!user
    },

    // 设置 Token
    setToken(token, refreshToken = null) {
      this.token = token
      this.refreshToken = refreshToken || this.refreshToken
      
      if (token) {
        localStorage.setItem('token', token)
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken)
        }
      } else {
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
      }
    },

    // 登录
    async login(loginData) {
      try {
        const response = await authApi.login(loginData)
        const { data } = response.data
        
        this.setUser(data.user)
        this.setToken(data.token, data.refreshToken)
        
        showSuccess('登录成功，欢迎回来！')
        return { success: true, data }
      } catch (error) {
        showApiError(error, '登录失败，请检查用户名、密码和验证码是否正确')
        const message = error.response?.data?.message || error.message || '登录失败'
        return { success: false, error: message }
      }
    },

    // 注册
    async register(registerData) {
      try {
        const response = await authApi.register(registerData)
        const { data } = response.data
        
        this.setUser(data.user)
        this.setToken(data.token, data.refreshToken)
        
        showSuccess('注册成功，欢迎加入！')
        return { success: true, data }
      } catch (error) {
        showApiError(error, '注册失败，请检查输入信息是否正确')
        const message = error.response?.data?.message || error.message || '注册失败'
        return { success: false, error: message }
      }
    },

    // 获取当前用户信息
    async fetchUserInfo() {
      if (!this.token) {
        return { success: false }
      }

      try {
        const response = await authApi.getMe()
        const { data } = response.data
        
        this.setUser(data.user)
        // 保存到 localStorage
        localStorage.setItem('user', JSON.stringify(data.user))
        return { success: true, user: data.user }
      } catch (error) {
        // Token 可能已过期，清除本地存储
        if (error.response?.status === 401) {
          this.logout()
        }
        return { success: false, error: error.message }
      }
    },

    // 刷新 Token
    async refreshToken() {
      if (!this.refreshToken) {
        return { success: false }
      }

      try {
        const response = await authApi.refreshToken(this.refreshToken)
        const { data } = response.data
        
        this.setToken(data.token, data.refreshToken)
        return { success: true }
      } catch (error) {
        // Refresh Token 也过期了，需要重新登录
        this.logout()
        return { success: false }
      }
    },

    // 登出
    async logout() {
      try {
        if (this.token) {
          await authApi.logout()
        }
      } catch (error) {
        console.error('登出失败:', error)
      } finally {
        // 无论成功与否，都清除本地状态
        this.setUser(null)
        this.setToken(null)
        localStorage.removeItem('user')
        showSuccess('已成功退出登录')
      }
    },

    // 初始化用户状态（从 localStorage 恢复）
    async init() {
      const token = localStorage.getItem('token')
      const userStr = localStorage.getItem('user')
      
      if (token) {
        this.setToken(token, localStorage.getItem('refreshToken'))
        
        // 如果有缓存的用户信息，先使用
        if (userStr) {
          try {
            this.setUser(JSON.parse(userStr))
          } catch (e) {
            console.error('解析用户信息失败:', e)
          }
        }
        
        // 然后从服务器获取最新信息
        await this.fetchUserInfo()
      }
    }
  }
})

