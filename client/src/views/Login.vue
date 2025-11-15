<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h2>登录</h2>
        <p>欢迎回来！</p>
      </div>

      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="用户名或邮箱"
            size="large"
            prefix-icon="User"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="密码"
            size="large"
            prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item prop="captchaText">
          <div class="captcha-group">
            <el-input
              v-model="loginForm.captchaText"
              placeholder="验证码"
              size="large"
              prefix-icon="Key"
              style="flex: 1"
              @keyup.enter="handleLogin"
            />
            <div class="captcha-image" @click="refreshCaptcha">
              <div v-if="captchaLoading" class="captcha-loading">
                <el-icon class="is-loading"><Loading /></el-icon>
              </div>
              <div v-else-if="captchaImage" v-html="captchaImage" class="captcha-svg"></div>
              <div v-else class="captcha-placeholder">点击获取验证码</div>
            </div>
          </div>
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            {{ loading ? '登录中...' : '登录' }}
          </el-button>
        </el-form-item>

        <div class="login-footer">
          <span>还没有账号？</span>
          <router-link to="/register" class="register-link">立即注册</router-link>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { authApi } from '@/api'
import { showError, showWarning } from '@/utils/message'
import { User, Lock, Key, Loading } from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserStore()

const loginFormRef = ref(null)
const loading = ref(false)
const captchaLoading = ref(false)
const captchaImage = ref('')
const captchaId = ref('')

const loginForm = ref({
  username: '',
  password: '',
  captchaText: ''
})

const loginRules = {
  username: [
    { required: true, message: '请输入用户名或邮箱', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  captchaText: [
    { required: true, message: '请输入验证码', trigger: 'blur' }
  ]
}

// 获取验证码
const fetchCaptcha = async () => {
  try {
    captchaLoading.value = true
    const response = await authApi.getCaptcha()
    console.log('验证码响应:', response)
    
    // 处理不同的响应格式
    const responseData = response.data || response
    const data = responseData.data || responseData
    
    if (data.captchaId && data.captchaImage) {
      captchaId.value = data.captchaId
      captchaImage.value = data.captchaImage
      console.log('验证码获取成功:', data.captchaId)
    } else {
      console.error('验证码数据格式错误:', data)
      showError('验证码数据格式错误，请刷新页面重试')
    }
  } catch (error) {
    console.error('获取验证码失败:', error)
    const errorMessage = error.response?.data?.message || error.message || '获取验证码失败，请重试'
    showError(errorMessage || '获取验证码失败，请检查网络连接')
  } finally {
    captchaLoading.value = false
  }
}

// 刷新验证码
const refreshCaptcha = () => {
  loginForm.value.captchaText = ''
  fetchCaptcha()
}

// 登录
const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  await loginFormRef.value.validate(async (valid) => {
    if (!valid) return

    if (!captchaId.value) {
      showWarning('请先点击验证码图片获取验证码')
      return
    }

    loading.value = true
    try {
      const result = await userStore.login({
        username: loginForm.value.username,
        password: loginForm.value.password,
        captchaId: captchaId.value,
        captchaText: loginForm.value.captchaText
      })

      if (result.success) {
        // 保存用户信息到 localStorage
        localStorage.setItem('user', JSON.stringify(result.data.user))
        
        // 跳转到首页或之前的页面
        const redirect = router.currentRoute.value.query.redirect || '/'
        router.push(redirect)
      } else {
        // 登录失败，刷新验证码
        refreshCaptcha()
      }
    } catch (error) {
      refreshCaptcha()
    } finally {
      loading.value = false
    }
  })
}

onMounted(() => {
  fetchCaptcha()
})
</script>

<style scoped>
.login-container {
  min-height: calc(100vh - 200px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-box {
  width: 100%;
  max-width: 420px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  padding: 40px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-header h2 {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 600;
  color: #333;
}

.login-header p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.login-form {
  margin-top: 24px;
}

.captcha-group {
  display: flex;
  gap: 12px;
  align-items: center;
}

.captcha-image {
  width: 120px;
  height: 40px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  transition: all 0.3s;
}

.captcha-image:hover {
  border-color: #409eff;
  background: #ecf5ff;
}

.captcha-loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.captcha-svg {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.captcha-placeholder {
  font-size: 12px;
  color: #909399;
  text-align: center;
}

.login-button {
  width: 100%;
  margin-top: 8px;
}

.login-footer {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
  color: #666;
}

.register-link {
  color: #409eff;
  text-decoration: none;
  margin-left: 8px;
  font-weight: 500;
}

.register-link:hover {
  text-decoration: underline;
}

/* 响应式 */
@media (max-width: 480px) {
  .login-box {
    padding: 30px 20px;
  }
  
  .captcha-group {
    flex-direction: column;
  }
  
  .captcha-image {
    width: 100%;
  }
}
</style>

