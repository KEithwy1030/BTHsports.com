/**
 * 用户资料管理路由
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { authenticateUser } = require('../utils/auth');

// 配置 multer 用于文件上传
const uploadDir = path.join(__dirname, '../../public/uploads/avatars');

// 确保上传目录存在
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 文件名格式: userId_timestamp.扩展名
    const userId = req.user.id;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${userId}_${timestamp}${ext}`);
  }
});

// 文件过滤器：只允许图片
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件（jpeg, jpg, png, gif, webp）'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  },
  fileFilter: fileFilter
});

/**
 * 获取用户资料
 * GET /api/user/profile
 */
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, username, email, nickname, avatar, role, created_at, last_login_at 
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    const user = users[0];
    
    // 处理头像 URL
    let avatarUrl = user.avatar;
    if (avatarUrl && !avatarUrl.startsWith('http')) {
      avatarUrl = `/uploads/avatars/${path.basename(avatarUrl)}`;
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          nickname: user.nickname || user.username,
          avatar: avatarUrl,
          role: user.role,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at
        }
      }
    });
  } catch (error) {
    console.error('获取用户资料失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户资料失败'
    });
  }
});

/**
 * 更新用户资料
 * PUT /api/user/profile
 * Body: { nickname, bio }
 */
router.put('/profile', authenticateUser, async (req, res) => {
  try {
    const { nickname, bio } = req.body;
    const updates = {};
    const values = [];

    // 验证昵称
    if (nickname !== undefined) {
      if (nickname.length < 1 || nickname.length > 50) {
        return res.status(400).json({
          success: false,
          message: '昵称长度必须在1-50个字符之间'
        });
      }
      updates.nickname = nickname;
      values.push(nickname);
    }

    // 验证个人简介（可选）
    if (bio !== undefined) {
      if (bio.length > 200) {
        return res.status(400).json({
          success: false,
          message: '个人简介不能超过200个字符'
        });
      }
      // 注意：bio 字段需要在 users 表中添加，这里先不处理
      // updates.bio = bio;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有需要更新的字段'
      });
    }

    // 构建更新 SQL
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    values.push(req.user.id);

    await pool.query(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      values
    );

    // 返回更新后的用户信息
    const [users] = await pool.query(
      `SELECT id, username, email, nickname, avatar, role, created_at, last_login_at 
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    const user = users[0];
    let avatarUrl = user.avatar;
    if (avatarUrl && !avatarUrl.startsWith('http')) {
      avatarUrl = `/uploads/avatars/${path.basename(avatarUrl)}`;
    }

    res.json({
      success: true,
      message: '资料更新成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          nickname: user.nickname || user.username,
          avatar: avatarUrl,
          role: user.role,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at
        }
      }
    });
  } catch (error) {
    console.error('更新用户资料失败:', error);
    res.status(500).json({
      success: false,
      message: '更新用户资料失败'
    });
  }
});

/**
 * 上传头像
 * POST /api/user/avatar
 * FormData: { avatar: File }
 */
router.post('/avatar', authenticateUser, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请选择要上传的图片'
      });
    }

    const filename = req.file.filename;
    const avatarPath = `/uploads/avatars/${filename}`;

    // 删除旧头像（如果存在）
    const [users] = await pool.query(
      'SELECT avatar FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length > 0 && users[0].avatar) {
      const oldAvatarPath = users[0].avatar;
      // 如果旧头像是本地文件，删除它
      if (!oldAvatarPath.startsWith('http')) {
        const oldFilePath = path.join(uploadDir, path.basename(oldAvatarPath));
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
    }

    // 更新数据库
    await pool.query(
      'UPDATE users SET avatar = ?, updated_at = NOW() WHERE id = ?',
      [avatarPath, req.user.id]
    );

    res.json({
      success: true,
      message: '头像上传成功',
      data: {
        avatar: avatarPath
      }
    });
  } catch (error) {
    console.error('上传头像失败:', error);
    
    // 如果上传失败，删除已保存的文件
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('删除上传文件失败:', e);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || '上传头像失败'
    });
  }
});

/**
 * 修改密码
 * POST /api/user/password
 * Body: { oldPassword, newPassword }
 */
router.post('/password', authenticateUser, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请填写旧密码和新密码'
      });
    }

    // 验证新密码强度
    const { validatePassword } = require('../utils/auth');
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // 获取用户当前密码
    const [users] = await pool.query(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 验证旧密码
    const { comparePassword, hashPassword } = require('../utils/auth');
    const isOldPasswordValid = await comparePassword(oldPassword, users[0].password_hash);
    
    if (!isOldPasswordValid) {
      return res.status(400).json({
        success: false,
        message: '旧密码错误'
      });
    }

    // 加密新密码
    const newPasswordHash = await hashPassword(newPassword);

    // 更新密码
    await pool.query(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [newPasswordHash, req.user.id]
    );

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码失败:', error);
    res.status(500).json({
      success: false,
      message: '修改密码失败'
    });
  }
});

module.exports = router;

