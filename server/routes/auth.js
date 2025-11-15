/**
 * 用户认证路由
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const {
  generateToken,
  generateRefreshToken,
  hashPassword,
  comparePassword,
  generateCaptcha,
  validateUsername,
  validateEmail,
  validatePassword,
  authenticateUser
} = require('../utils/auth');

// 存储验证码（生产环境应使用 Redis）
const captchaStore = new Map();

/**
 * 获取图形验证码
 * GET /api/auth/captcha
 */
router.get('/captcha', (req, res) => {
  try {
    console.log('收到验证码请求，Origin:', req.headers.origin);
    const captcha = generateCaptcha();
    const captchaId = Math.random().toString(36).substring(2, 15);
    
    // 存储验证码（5分钟过期）
    captchaStore.set(captchaId, {
      text: captcha.text,
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    
    // 清理过期验证码
    for (const [id, data] of captchaStore.entries()) {
      if (data.expiresAt < Date.now()) {
        captchaStore.delete(id);
      }
    }
    
    console.log('验证码生成成功，captchaId:', captchaId);
    console.log('验证码文本:', captcha.text);
    console.log('当前验证码存储:', Array.from(captchaStore.entries()).map(([id, data]) => ({ id, text: data.text, expiresAt: new Date(data.expiresAt).toISOString() })));
    res.json({
      success: true,
      data: {
        captchaId,
        captchaImage: captcha.data
      }
    });
  } catch (error) {
    console.error('生成验证码失败:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      success: false,
      message: '生成验证码失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 用户注册
 * POST /api/auth/register
 * Body: { username, email, password, captchaId, captchaText }
 */
router.post('/register', async (req, res) => {
  console.log('========== 注册请求开始 ==========');
  console.log('请求时间:', new Date().toISOString());
  console.log('请求路径:', req.path);
  console.log('请求方法:', req.method);
  console.log('请求头:', JSON.stringify(req.headers).substring(0, 200));
  
  try {
    console.log('收到注册请求，请求体:', req.body);
    const { username, email, password, captchaId, captchaText } = req.body;
    
    console.log('解析后的字段:');
    console.log('  username:', username);
    console.log('  email:', email);
    console.log('  password:', password ? '***' : undefined);
    console.log('  captchaId:', captchaId);
    console.log('  captchaText:', captchaText);
    console.log('当前验证码存储中的ID:', Array.from(captchaStore.keys()));
    
    // 验证必填字段
    if (!username || !email || !password || !captchaId || !captchaText) {
      console.log('❌ 缺少必填字段');
      console.log('  缺失字段:', {
        username: !username,
        email: !email,
        password: !password,
        captchaId: !captchaId,
        captchaText: !captchaText
      });
      return res.status(400).json({
        success: false,
        message: '请填写所有必填字段'
      });
    }
    
    console.log('✅ 字段验证通过，开始验证验证码...');
    
    // 验证验证码
    const captchaData = captchaStore.get(captchaId);
    if (!captchaData) {
      console.log('❌ 验证码不存在:', captchaId);
      console.log('当前存储的验证码ID列表:', Array.from(captchaStore.keys()));
      return res.status(400).json({
        success: false,
        message: '验证码已过期，请重新获取'
      });
    }
    
    if (captchaData.expiresAt < Date.now()) {
      captchaStore.delete(captchaId);
      console.log('❌ 验证码已过期');
      return res.status(400).json({
        success: false,
        message: '验证码已过期，请重新获取'
      });
    }
    
    const normalizedInput = captchaText.toLowerCase().trim();
    console.log('验证码比较:');
    console.log('  存储的验证码文本:', captchaData.text);
    console.log('  用户输入的验证码:', captchaText);
    console.log('  标准化后的输入:', normalizedInput);
    console.log('  是否匹配:', captchaData.text === normalizedInput);
    
    if (captchaData.text !== normalizedInput) {
      console.log('❌ 验证码错误，期望:', captchaData.text, '实际:', captchaText, '标准化后:', normalizedInput);
      return res.status(400).json({
        success: false,
        message: '验证码错误'
      });
    }
    
    console.log('✅ 验证码验证通过');
    
    // 验证码使用后删除
    captchaStore.delete(captchaId);
    
    // 验证用户名格式
    if (!validateUsername(username)) {
      console.log('❌ 用户名格式错误');
      return res.status(400).json({
        success: false,
        message: '用户名格式不正确（3-20个字符，只能包含字母、数字、下划线）'
      });
    }
    
    // 验证邮箱格式
    if (!validateEmail(email)) {
      console.log('❌ 邮箱格式错误');
      return res.status(400).json({
        success: false,
        message: '邮箱格式不正确'
      });
    }
    
    // 验证密码强度
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      console.log('❌ 密码强度不足');
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }
    
    console.log('✅ 格式验证通过，检查用户名是否已存在...');
    
    // 检查用户名是否已存在
    const [existingUsers] = await pool.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    
    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      if (existingUser.username === username) {
        console.log('❌ 用户名已存在');
        return res.status(400).json({
          success: false,
          message: '用户名已存在'
        });
      }
      if (existingUser.email === email) {
        console.log('❌ 邮箱已被注册');
        return res.status(400).json({
          success: false,
          message: '邮箱已被注册'
        });
      }
    }
    
    console.log('✅ 用户名检查通过，开始加密密码...');
    
    // 加密密码
    const passwordHash = await hashPassword(password);
    console.log('✅ 密码加密完成');
    
    // 创建用户（默认昵称为用户名）
    console.log('开始插入用户到数据库...');
    const [result] = await pool.query(
      `INSERT INTO users (username, email, password_hash, nickname, role, created_at) 
       VALUES (?, ?, ?, ?, 'user', NOW())`,
      [username, email, passwordHash, username]
    );
    
    const userId = result.insertId;
    console.log('✅ 用户创建成功，ID:', userId);
    
    // 生成 Token
    const token = generateToken({ id: userId, username, role: 'user' });
    const refreshToken = generateRefreshToken({ id: userId, username, role: 'user' });
    console.log('✅ Token 生成完成');
    
    // 保存会话
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7天后过期
    
    console.log('开始保存会话...');
    console.log('会话数据:', {
      userId,
      tokenLength: token.length,
      refreshTokenLength: refreshToken.length,
      deviceInfo: req.headers['user-agent']?.substring(0, 50) || 'Unknown',
      ipAddress: req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'Unknown'
    });
    
    try {
      await pool.query(
        `INSERT INTO user_sessions (user_id, token, refresh_token, device_info, ip_address, expires_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          token,
          refreshToken,
          req.headers['user-agent'] || 'Unknown',
          req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'Unknown',
          expiresAt
        ]
      );
      console.log('✅ 会话保存完成');
    } catch (sessionError) {
      console.error('❌ 会话保存失败:', sessionError.message);
      console.error('会话错误堆栈:', sessionError.stack);
      // 即使会话保存失败，也返回成功（用户已创建）
      // 但记录错误以便后续排查
    }
    
    console.log('✅ 注册成功，返回响应');
    res.json({
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: userId,
          username,
          nickname: username,
          email,
          role: 'user'
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('========== 注册失败 ==========');
    console.error('错误类型:', error.constructor.name);
    console.error('错误消息:', error.message);
    console.error('错误堆栈:', error.stack);
    console.error('请求体:', req.body);
    console.error('错误代码:', error.code);
    console.error('错误SQL状态:', error.sqlState);
    console.error('========== 错误结束 ==========');
    
    // 根据错误类型提供更详细的错误消息
    let errorMessage = '注册失败，请稍后重试';
    
    if (error.code === 'ER_DUP_ENTRY') {
      // 数据库唯一约束冲突
      if (error.message.includes('username')) {
        errorMessage = '用户名已存在，请使用其他用户名';
      } else if (error.message.includes('email')) {
        errorMessage = '邮箱已被注册，请使用其他邮箱';
      } else {
        errorMessage = '用户名或邮箱已被使用';
      }
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      errorMessage = '数据库连接失败，请稍后重试';
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      errorMessage = '数据库表不存在，请联系管理员';
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      errorMessage = '数据库访问被拒绝，请联系管理员';
    } else if (error.message) {
      // 开发环境显示详细错误，生产环境显示通用错误
      if (process.env.NODE_ENV === 'development') {
        errorMessage = `注册失败: ${error.message}`;
      }
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * 用户登录
 * POST /api/auth/login
 * Body: { username, password, captchaId, captchaText }
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password, captchaId, captchaText } = req.body;
    
    // 验证必填字段
    if (!username || !password || !captchaId || !captchaText) {
      return res.status(400).json({
        success: false,
        message: '请填写所有必填字段'
      });
    }
    
    // 验证验证码
    const captchaData = captchaStore.get(captchaId);
    if (!captchaData || captchaData.expiresAt < Date.now()) {
      if (captchaData) captchaStore.delete(captchaId);
      return res.status(400).json({
        success: false,
        message: '验证码已过期，请重新获取'
      });
    }
    
    if (captchaData.text !== captchaText.toLowerCase().trim()) {
      return res.status(400).json({
        success: false,
        message: '验证码错误'
      });
    }
    
    // 验证码使用后删除
    captchaStore.delete(captchaId);
    
    // 查找用户（支持用户名或邮箱登录）
    const [users] = await pool.query(
      'SELECT id, username, email, password_hash, nickname, role FROM users WHERE username = ? OR email = ?',
      [username, username]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }
    
    const user = users[0];
    
    // 验证密码
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }
    
    // 更新最后登录时间
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = ?',
      [user.id]
    );
    
    // 生成 Token
    const token = generateToken({ id: user.id, username: user.username, role: user.role });
    const refreshToken = generateRefreshToken({ id: user.id, username: user.username, role: user.role });
    
    // 保存会话
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7天后过期
    
    await pool.query(
      `INSERT INTO user_sessions (user_id, token, refresh_token, device_info, ip_address, expires_at) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        token,
        refreshToken,
        req.headers['user-agent'] || 'Unknown',
        req.ip || req.connection.remoteAddress || 'Unknown',
        expiresAt
      ]
    );
    
    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname || user.username,
          email: user.email,
          role: user.role
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({
      success: false,
      message: '登录失败，请稍后重试'
    });
  }
});

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, nickname, avatar, role, created_at, last_login_at FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const user = users[0];
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname || user.username,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at
        }
      }
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败'
    });
  }
});

/**
 * 刷新 Token
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: '请提供 refreshToken'
      });
    }
    
    const { verifyToken } = require('../utils/auth');
    const decoded = verifyToken(refreshToken);
    
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Refresh Token 无效或已过期'
      });
    }
    
    // 验证会话是否存在
    const [sessions] = await pool.query(
      'SELECT user_id FROM user_sessions WHERE refresh_token = ? AND expires_at > NOW()',
      [refreshToken]
    );
    
    if (sessions.length === 0) {
      return res.status(401).json({
        success: false,
        message: '会话已过期，请重新登录'
      });
    }
    
    // 获取用户信息
    const [users] = await pool.query(
      'SELECT id, username, role FROM users WHERE id = ?',
      [decoded.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const user = users[0];
    
    // 生成新的 Token
    const newToken = generateToken({ id: user.id, username: user.username, role: user.role });
    const newRefreshToken = generateRefreshToken({ id: user.id, username: user.username, role: user.role });
    
    // 更新会话
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    await pool.query(
      'UPDATE user_sessions SET token = ?, refresh_token = ?, expires_at = ? WHERE refresh_token = ?',
      [newToken, newRefreshToken, expiresAt, refreshToken]
    );
    
    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    console.error('刷新 Token 失败:', error);
    res.status(500).json({
      success: false,
      message: '刷新 Token 失败'
    });
  }
});

/**
 * 用户登出
 * POST /api/auth/logout
 */
router.post('/logout', authenticateUser, async (req, res) => {
  try {
    const token = req.headers.authorization?.substring(7);
    
    if (token) {
      // 删除会话
      await pool.query(
        'DELETE FROM user_sessions WHERE token = ?',
        [token]
      );
    }
    
    res.json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    console.error('登出失败:', error);
    res.status(500).json({
      success: false,
      message: '登出失败'
    });
  }
});

module.exports = router;

