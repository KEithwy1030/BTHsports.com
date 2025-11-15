<template>
  <div id="app">
    <el-container class="layout-container">
      <!-- 头部导航 -->
      <el-header class="header">
        <div class="header-content">
          <div class="logo">
            <router-link to="/" class="logo-link" aria-label="返回首页">
              <img src="/icon/老k解说icon.png" alt="老K解说" class="logo-icon" />
              <h1>百体汇</h1>
            </router-link>
          </div>
          <nav class="nav-menu">
            <router-link to="/" class="nav-item">
              <el-icon><Calendar /></el-icon>
              比赛赛程
            </router-link>
            <router-link to="/plan" class="nav-item">
              <el-icon><Document /></el-icon>
              方案推荐
            </router-link>
          </nav>
          
          <!-- 用户菜单 -->
          <div class="user-menu">
            <el-dropdown v-if="isLoggedIn" trigger="click" @command="handleUserCommand">
              <div class="user-info">
                <el-avatar :size="32" :src="userAvatar">
                  {{ nickname.charAt(0).toUpperCase() }}
                </el-avatar>
                <span class="username">{{ nickname }}</span>
                <el-icon><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                  <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <div v-else class="auth-buttons">
              <router-link to="/login" class="auth-link">登录</router-link>
              <router-link to="/register" class="auth-link register-link">注册</router-link>
            </div>
          </div>
        </div>
      </el-header>

      <!-- 主要内容区域 -->
      <el-main class="main-content">
        <router-view />
      </el-main>

      <!-- 底部 -->
      <el-footer class="footer">
        <div class="footer-content">
          <p>本站所有直播信号均由用户收集或从搜索引擎整理获得，内容均来自互联网</p>
          <p>我们不提供任何直播或视频内容，如有侵权请通知我们，我们会立即处理</p>
        </div>
      </el-footer>
    </el-container>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { Calendar, Document, ArrowDown } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()

// 计算属性，确保响应式
const isLoggedIn = computed(() => userStore.loggedIn)
const nickname = computed(() => userStore.nickname)
const userAvatar = computed(() => userStore.user?.avatar)

// 初始化用户状态
onMounted(async () => {
  await userStore.init()
})

// 处理用户菜单命令
const handleUserCommand = async (command) => {
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
      await userStore.logout()
      router.push('/')
    } catch {
      // 用户取消
    }
  } else if (command === 'profile') {
    router.push('/profile')
  }
}
</script>

<style scoped>
.layout-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

.logo h1 {
  margin: 0;
  font-size: 24px;
  font-weight: bold;
}

.logo-link {
  color: inherit;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.logo-link:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.6);
  outline-offset: 4px;
}

.logo-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25);
  object-fit: cover;
}

.nav-menu {
  display: flex;
  gap: 30px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: white;
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.nav-item.router-link-active {
  background: rgba(255, 255, 255, 0.2);
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.user-info:hover {
  background: rgba(255, 255, 255, 0.1);
}

.username {
  font-size: 14px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auth-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auth-link {
  color: white;
  text-decoration: none;
  padding: 6px 16px;
  border-radius: 6px;
  transition: all 0.3s ease;
  font-size: 14px;
}

.auth-link:hover {
  background: rgba(255, 255, 255, 0.1);
}

.register-link {
  background: rgba(255, 255, 255, 0.2);
  font-weight: 500;
}

.register-link:hover {
  background: rgba(255, 255, 255, 0.3);
}

.main-content {
  background: #f5f7fa;
  padding: 20px;
  flex: 1;
}

.footer {
  background: #2c3e50;
  color: white;
  text-align: center;
  padding: 24px 16px;
  height: auto;
  line-height: 1.6;
}

.footer-content p {
  margin: 5px 0;
  font-size: 14px;
  opacity: 0.85;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: 15px;
    padding: 10px;
  }
  
  .nav-menu {
    gap: 15px;
  }
  
  .logo h1 {
    font-size: 20px;
  }
}
</style>
