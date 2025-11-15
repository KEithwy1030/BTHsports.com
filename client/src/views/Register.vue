<template>
  <div class="register-container">
    <div class="register-box">
      <div class="register-header">
        <h2>注册</h2>
        <p>创建新账号</p>
      </div>

      <el-form
        ref="registerFormRef"
        :model="registerForm"
        :rules="registerRules"
        class="register-form"
        @submit.prevent="handleRegister"
      >
        <el-form-item prop="username">
          <el-input
            v-model="registerForm.username"
            placeholder="用户名（3-20个字符，字母、数字、下划线）"
            size="large"
            prefix-icon="User"
            clearable
          />
        </el-form-item>

        <el-form-item prop="email">
          <el-input
            v-model="registerForm.email"
            type="email"
            placeholder="邮箱"
            size="large"
            prefix-icon="Message"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="registerForm.password"
            type="password"
            placeholder="密码（至少6位，包含字母和数字）"
            size="large"
            prefix-icon="Lock"
            show-password
          />
        </el-form-item>

        <el-form-item prop="confirmPassword">
          <el-input
            v-model="registerForm.confirmPassword"
            type="password"
            placeholder="确认密码"
            size="large"
            prefix-icon="Lock"
            show-password
            @keyup.enter="handleRegister"
          />
        </el-form-item>

        <el-form-item prop="captchaText">
          <div class="captcha-group">
            <el-input
              v-model="registerForm.captchaText"
              placeholder="验证码"
              size="large"
              prefix-icon="Key"
              style="flex: 1"
              @keyup.enter="handleRegister"
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
            class="register-button"
            :loading="loading"
            @click="handleRegister"
          >
            {{ loading ? '注册中...' : '注册' }}
          </el-button>
        </el-form-item>

        <div class="register-footer">
          <span>已有账号？</span>
          <router-link to="/login" class="login-link">立即登录</router-link>
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
import { User, Message, Lock, Key, Loading } from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserStore()

const registerFormRef = ref(null)
const loading = ref(false)
const captchaLoading = ref(false)
const captchaImage = ref('')
const captchaId = ref('')

const registerForm = ref({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  captchaText: ''
})

// 验证确认密码
const validateConfirmPassword = (rule, value, callback) => {
  if (value !== registerForm.value.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const registerRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度为3-20个字符', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字、下划线', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 50, message: '密码长度为6-50个字符', trigger: 'blur' },
    { pattern: /[a-zA-Z]/, message: '密码必须包含至少一个字母', trigger: 'blur' },
    { pattern: /[0-9]/, message: '密码必须包含至少一个数字', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
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
  registerForm.value.captchaText = ''
  fetchCaptcha()
}

// 注册
const handleRegister = async () => {
  if (!registerFormRef.value) return
  
  await registerFormRef.value.validate(async (valid) => {
    if (!valid) return

    if (!captchaId.value) {
      showWarning('请先点击验证码图片获取验证码')
      return
    }

    loading.value = true
    try {
      const registerData = {
        username: registerForm.value.username,
        email: registerForm.value.email,
        password: registerForm.value.password,
        captchaId: captchaId.value,
        captchaText: registerForm.value.captchaText
      }
      console.log('准备发送注册请求，数据:', {
        username: registerData.username,
        email: registerData.email,
        password: registerData.password ? '***' : undefined,
        captchaId: registerData.captchaId,
        captchaText: registerData.captchaText
      })
      const result = await userStore.register(registerData)

      if (result.success) {
        // 保存用户信息到 localStorage
        localStorage.setItem('user', JSON.stringify(result.data.user))
        
        // 跳转到首页
        router.push('/')
      } else {
        // 注册失败，刷新验证码
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
.register-container {
  min-height: calc(100vh - 200px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.register-box {
  width: 100%;
  max-width: 420px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  padding: 40px;
}

.register-header {
  text-align: center;
  margin-bottom: 32px;
}

.register-header h2 {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 600;
  color: #333;
}

.register-header p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.register-form {
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

.register-button {
  width: 100%;
  margin-top: 8px;
}

.register-footer {
  text-align: center;
  margin-top: 20px;
  font-size: 14px;
  color: #666;
}

.login-link {
  color: #409eff;
  text-decoration: none;
  margin-left: 8px;
  font-weight: 500;
}

.login-link:hover {
  text-decoration: underline;
}

/* 响应式 */
@media (max-width: 480px) {
  .register-box {
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

