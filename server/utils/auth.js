/**
 * 用户认证工具函数
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const svgCaptcha = require('svg-captcha');

// JWT 密钥（从环境变量读取，默认用于开发）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7天
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d'; // 30天

/**
 * 生成 JWT Token
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 生成 Refresh Token
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

/**
 * 验证 JWT Token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * 密码加密
 */
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * 验证密码
 */
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * 生成图形验证码
 */
function generateCaptcha() {
  const captcha = svgCaptcha.create({
    size: 4, // 验证码长度
    ignoreChars: '0o1il', // 排除容易混淆的字符
    noise: 2, // 干扰线条数
    color: true, // 彩色
    background: '#f0f0f0' // 背景色
  });
  
  return {
    text: captcha.text.toLowerCase(), // 验证码文本（小写）
    data: captcha.data // SVG 图片数据
  };
}

/**
 * 验证用户名格式（3-20个字符，字母、数字、下划线）
 */
function validateUsername(username) {
  const regex = /^[a-zA-Z0-9_]{3,20}$/;
  return regex.test(username);
}

/**
 * 验证邮箱格式
 */
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * 验证密码强度（至少6位，包含字母和数字）
 */
function validatePassword(password) {
  if (password.length < 6 || password.length > 50) {
    return { valid: false, message: '密码长度必须在6-50个字符之间' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: '密码必须包含至少一个字母' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: '密码必须包含至少一个数字' };
  }
  return { valid: true };
}

/**
 * 从请求中提取 Token
 */
function extractTokenFromRequest(req) {
  // 优先从 Authorization header 获取
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // 其次从 cookie 获取
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  
  // 最后从 query 参数获取（不推荐，仅用于兼容）
  if (req.query && req.query.token) {
    return req.query.token;
  }
  
  return null;
}

/**
 * 中间件：验证用户身份
 */
function authenticateUser(req, res, next) {
  const token = extractTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: '未提供认证令牌，请先登录' 
    });
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ 
      success: false, 
      message: '认证令牌无效或已过期，请重新登录' 
    });
  }
  
  // 将用户信息附加到请求对象
  req.user = decoded;
  next();
}

/**
 * 中间件：验证用户角色
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: '请先登录' 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: '权限不足' 
      });
    }
    
    next();
  };
}

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  hashPassword,
  comparePassword,
  generateCaptcha,
  validateUsername,
  validateEmail,
  validatePassword,
  extractTokenFromRequest,
  authenticateUser,
  requireRole
};

