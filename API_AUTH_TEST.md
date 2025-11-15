# 🔐 用户认证系统 API 测试文档

## 📋 API 端点列表

### 1. 获取图形验证码
**GET** `/api/auth/captcha`

**响应示例：**
```json
{
  "success": true,
  "data": {
    "captchaId": "abc123",
    "captchaImage": "<svg>...</svg>"
  }
}
```

---

### 2. 用户注册
**POST** `/api/auth/register`

**请求体：**
```json
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "test123456",
  "captchaId": "abc123",
  "captchaText": "abcd"
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "注册成功",
  "data": {
    "user": {
      "id": 1,
      "username": "testuser",
      "nickname": "testuser",
      "email": "test@example.com",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**验证规则：**
- 用户名：3-20个字符，只能包含字母、数字、下划线
- 邮箱：标准邮箱格式
- 密码：6-50个字符，必须包含至少一个字母和一个数字
- 验证码：必须正确

---

### 3. 用户登录
**POST** `/api/auth/login`

**请求体：**
```json
{
  "username": "testuser",
  "password": "test123456",
  "captchaId": "abc123",
  "captchaText": "abcd"
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "user": {
      "id": 1,
      "username": "testuser",
      "nickname": "testuser",
      "email": "test@example.com",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**说明：**
- 支持用户名或邮箱登录
- 登录后更新 `last_login_at` 字段

---

### 4. 获取当前用户信息
**GET** `/api/auth/me`

**请求头：**
```
Authorization: Bearer <token>
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "testuser",
      "nickname": "testuser",
      "email": "test@example.com",
      "avatar": null,
      "role": "user",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "lastLoginAt": "2025-01-01T00:00:00.000Z"
    }
  }
}
```

---

### 5. 刷新 Token
**POST** `/api/auth/refresh`

**请求体：**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 6. 用户登出
**POST** `/api/auth/logout`

**请求头：**
```
Authorization: Bearer <token>
```

**响应示例：**
```json
{
  "success": true,
  "message": "登出成功"
}
```

---

## 🧪 测试步骤

### 1. 测试注册流程
```bash
# 1. 获取验证码
curl http://localhost:7001/api/auth/captcha

# 2. 注册用户（替换 captchaId 和 captchaText）
curl -X POST http://localhost:7001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "test123456",
    "captchaId": "abc123",
    "captchaText": "abcd"
  }'
```

### 2. 测试登录流程
```bash
# 1. 获取验证码
curl http://localhost:7001/api/auth/captcha

# 2. 登录（替换 captchaId 和 captchaText）
curl -X POST http://localhost:7001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "test123456",
    "captchaId": "abc123",
    "captchaText": "abcd"
  }'
```

### 3. 测试获取用户信息
```bash
# 替换 <token> 为登录返回的 token
curl http://localhost:7001/api/auth/me \
  -H "Authorization: Bearer <token>"
```

---

## ⚠️ 注意事项

1. **验证码有效期**：5分钟
2. **Token 有效期**：7天（可通过 `JWT_EXPIRES_IN` 环境变量配置）
3. **Refresh Token 有效期**：30天（可通过 `REFRESH_TOKEN_EXPIRES_IN` 环境变量配置）
4. **密码加密**：使用 bcrypt，salt rounds = 10
5. **会话存储**：当前使用内存 Map（生产环境建议使用 Redis）

---

## 🔧 环境变量配置

在 `env.dev` 或生产环境中设置：

```bash
# JWT 密钥（生产环境必须修改！）
JWT_SECRET=your-secret-key-change-in-production

# Token 过期时间
JWT_EXPIRES_IN=7d

# Refresh Token 过期时间
REFRESH_TOKEN_EXPIRES_IN=30d
```

---

## ✅ 已完成功能

- ✅ 图形验证码生成
- ✅ 用户注册（用户名/邮箱/密码验证）
- ✅ 用户登录（支持用户名或邮箱）
- ✅ JWT Token 生成和验证
- ✅ Refresh Token 机制
- ✅ 用户会话管理
- ✅ 密码加密存储
- ✅ 认证中间件
- ✅ 获取当前用户信息
- ✅ 用户登出

---

**下一步：实现前端注册/登录页面**

