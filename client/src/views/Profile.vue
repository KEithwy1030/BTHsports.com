<template>
  <div class="profile-container">
    <el-card class="profile-card">
      <template #header>
        <div class="card-header">
          <h2>个人中心</h2>
        </div>
      </template>

      <el-tabs v-model="activeTab" class="profile-tabs">
        <!-- 基本信息 -->
        <el-tab-pane label="基本信息" name="info">
          <el-form
            ref="profileFormRef"
            :model="profileForm"
            :rules="profileRules"
            label-width="100px"
            class="profile-form"
          >
            <el-form-item label="用户名">
              <el-input v-model="profileForm.username" disabled />
              <div class="form-tip">用户名不可修改</div>
            </el-form-item>

            <el-form-item label="邮箱">
              <el-input v-model="profileForm.email" disabled />
              <div class="form-tip">邮箱不可修改</div>
            </el-form-item>

            <el-form-item label="昵称" prop="nickname">
              <el-input
                v-model="profileForm.nickname"
                placeholder="请输入昵称（用于聊天区显示）"
                maxlength="50"
                show-word-limit
              />
            </el-form-item>

            <el-form-item label="头像">
              <div class="avatar-upload">
                <el-upload
                  class="avatar-uploader"
                  :action="uploadAction"
                  :headers="uploadHeaders"
                  :show-file-list="false"
                  :before-upload="beforeAvatarUpload"
                  :on-success="handleAvatarSuccess"
                  :on-error="handleAvatarError"
                  :auto-upload="true"
                >
                  <img v-if="avatarUrl" :src="avatarUrl" class="avatar" />
                  <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
                </el-upload>
                <div class="avatar-tip">
                  <p>支持 JPG、PNG、GIF 格式，大小不超过 2MB</p>
                  <p>建议尺寸：200x200 像素</p>
                </div>
              </div>
            </el-form-item>

            <el-form-item label="注册时间">
              <el-input :value="formatDate(profileForm.createdAt)" disabled />
            </el-form-item>

            <el-form-item label="最后登录">
              <el-input :value="formatDate(profileForm.lastLoginAt)" disabled />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="saving" @click="handleSaveProfile">
                保存修改
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 修改密码 -->
        <el-tab-pane label="修改密码" name="password">
          <el-form
            ref="passwordFormRef"
            :model="passwordForm"
            :rules="passwordRules"
            label-width="100px"
            class="profile-form"
          >
            <el-form-item label="旧密码" prop="oldPassword">
              <el-input
                v-model="passwordForm.oldPassword"
                type="password"
                placeholder="请输入旧密码"
                show-password
              />
            </el-form-item>

            <el-form-item label="新密码" prop="newPassword">
              <el-input
                v-model="passwordForm.newPassword"
                type="password"
                placeholder="请输入新密码（6-50个字符，包含字母和数字）"
                show-password
              />
            </el-form-item>

            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input
                v-model="passwordForm.confirmPassword"
                type="password"
                placeholder="请再次输入新密码"
                show-password
              />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="changingPassword" @click="handleChangePassword">
                修改密码
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/api'
import { showError, showSuccess } from '@/utils/message'
import { Plus } from '@element-plus/icons-vue'

const userStore = useUserStore()

const activeTab = ref('info')
const saving = ref(false)
const changingPassword = ref(false)
const profileFormRef = ref(null)
const passwordFormRef = ref(null)

const profileForm = ref({
  username: '',
  email: '',
  nickname: '',
  avatar: '',
  createdAt: null,
  lastLoginAt: null
})

const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const avatarUrl = computed(() => {
  if (profileForm.value.avatar) {
    // 如果是完整 URL，直接返回
    if (profileForm.value.avatar.startsWith('http')) {
      return profileForm.value.avatar
    }
    // 否则拼接基础路径
    return profileForm.value.avatar.startsWith('/') 
      ? profileForm.value.avatar 
      : `/${profileForm.value.avatar}`
  }
  return ''
})

const uploadAction = computed(() => {
  return '/api/user/avatar'
})

const uploadHeaders = computed(() => {
  const token = localStorage.getItem('token')
  return {
    Authorization: `Bearer ${token}`
  }
})

const profileRules = {
  nickname: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { min: 1, max: 50, message: '昵称长度必须在1-50个字符之间', trigger: 'blur' }
  ]
}

const validateConfirmPassword = (rule, value, callback) => {
  if (value !== passwordForm.value.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const passwordRules = {
  oldPassword: [
    { required: true, message: '请输入旧密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 50, message: '密码长度必须在6-50个字符之间', trigger: 'blur' },
    { pattern: /[a-zA-Z]/, message: '密码必须包含至少一个字母', trigger: 'blur' },
    { pattern: /[0-9]/, message: '密码必须包含至少一个数字', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

// 加载用户资料
const loadProfile = async () => {
  try {
    const response = await userApi.getProfile()
    const { data } = response.data
    
    profileForm.value = {
      username: data.user.username,
      email: data.user.email,
      nickname: data.user.nickname || data.user.username,
      avatar: data.user.avatar || '',
      createdAt: data.user.createdAt,
      lastLoginAt: data.user.lastLoginAt
    }
  } catch (error) {
    showError('加载用户资料失败，请刷新页面重试')
  }
}

// 保存资料
const handleSaveProfile = async () => {
  if (!profileFormRef.value) return

  await profileFormRef.value.validate(async (valid) => {
    if (!valid) return

    saving.value = true
    try {
      const response = await userApi.updateProfile({
        nickname: profileForm.value.nickname
      })
      
      showSuccess('个人资料更新成功')
      
      // 更新 store 中的用户信息
      await userStore.fetchUserInfo()
      
      // 重新加载资料
      await loadProfile()
    } catch (error) {
      const message = error.response?.data?.message || error.message || '资料更新失败，请检查输入信息'
      showError(message)
    } finally {
      saving.value = false
    }
  })
}

// 修改密码
const handleChangePassword = async () => {
  if (!passwordFormRef.value) return

  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return

    changingPassword.value = true
    try {
      await userApi.changePassword({
        oldPassword: passwordForm.value.oldPassword,
        newPassword: passwordForm.value.newPassword
      })
      
      showSuccess('密码修改成功，请妥善保管新密码')
      
      // 清空表单
      passwordForm.value = {
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
      passwordFormRef.value.resetFields()
    } catch (error) {
      const message = error.response?.data?.message || error.message || '密码修改失败，请检查原密码是否正确'
      showError(message)
    } finally {
      changingPassword.value = false
    }
  })
}

// 头像上传前验证
const beforeAvatarUpload = (file) => {
  const isImage = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.type)
  const isLt2M = file.size / 1024 / 1024 < 2

  if (!isImage) {
    showError('只能上传图片文件（支持 JPG、PNG、GIF、WebP 格式）')
    return false
  }
  if (!isLt2M) {
    showError('图片大小不能超过 2MB，请压缩后重试')
    return false
  }
  return true
}

// 头像上传成功
const handleAvatarSuccess = (response) => {
  if (response.success) {
    profileForm.value.avatar = response.data.avatar
    showSuccess('头像上传成功，已更新')
    
    // 更新 store 中的用户信息
    userStore.fetchUserInfo()
  } else {
    showError(response.message || '头像上传失败，请检查图片格式和大小')
  }
}

// 头像上传失败
const handleAvatarError = (error) => {
  showError('头像上传失败，请检查网络连接或稍后重试')
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '暂无'
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  loadProfile()
})
</script>

<style scoped>
.profile-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.profile-card {
  min-height: 500px;
}

.card-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.profile-tabs {
  margin-top: 20px;
}

.profile-form {
  max-width: 600px;
  margin-top: 20px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.avatar-upload {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

.avatar-uploader {
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  width: 120px;
  height: 120px;
  transition: all 0.3s;
}

.avatar-uploader:hover {
  border-color: #409eff;
}

.avatar-uploader-icon {
  font-size: 28px;
  color: #8c939d;
  width: 120px;
  height: 120px;
  line-height: 120px;
  text-align: center;
}

.avatar {
  width: 120px;
  height: 120px;
  display: block;
  object-fit: cover;
}

.avatar-tip {
  flex: 1;
}

.avatar-tip p {
  margin: 4px 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

/* 响应式 */
@media (max-width: 768px) {
  .profile-container {
    padding: 10px;
  }
  
  .avatar-upload {
    flex-direction: column;
  }
  
  .avatar-tip {
    width: 100%;
  }
}
</style>

