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
import { Calendar, Document } from '@element-plus/icons-vue'
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
