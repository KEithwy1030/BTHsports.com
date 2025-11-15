# 📊 用户系统数据库设置指南

## 📋 数据库表结构

已创建两个 SQL 文件：

1. **`server/config/user_system_schema.sql`** - 完整版（使用存储过程检查字段是否存在）
2. **`server/config/user_system_schema_simple.sql`** - 简化版（兼容所有 MySQL 版本，推荐使用）

## 🚀 执行步骤

### 方式 1：使用 MySQL 命令行（推荐）

```bash
# 连接到 MySQL
mysql -h localhost -u root -p

# 执行 SQL 文件
source server/config/user_system_schema_simple.sql

# 或者直接执行
mysql -h localhost -u root -p live_sports < server/config/user_system_schema_simple.sql
```

### 方式 2：使用 MySQL 客户端工具

1. 打开 MySQL 客户端（如 phpMyAdmin、Navicat、MySQL Workbench）
2. 选择数据库 `live_sports`
3. 执行 `server/config/user_system_schema_simple.sql` 文件内容

### 方式 3：在 Zeabur 上执行

1. 在 Zeabur 项目页面找到 MySQL 服务
2. 进入数据库管理界面
3. 执行 `server/config/user_system_schema_simple.sql` 文件内容

## ⚠️ 注意事项

### 1. 字段已存在的情况

如果 `users` 表的字段已存在，执行 `ALTER TABLE` 会报错，可以：
- **忽略错误**：继续执行后续 SQL
- **手动检查**：先检查字段是否存在，再决定是否执行

### 2. 表已存在的情况

使用 `CREATE TABLE IF NOT EXISTS`，如果表已存在不会报错。

### 3. 外键约束

确保以下表已存在：
- `users` 表（已有）
- `matches` 表（已有）

## ✅ 验证表结构

执行完成后，可以运行以下 SQL 验证：

```sql
-- 检查 users 表扩展字段
DESCRIBE users;

-- 检查新创建的表
SHOW TABLES LIKE 'user_%';
SHOW TABLES LIKE 'expert_%';

-- 检查索引
SHOW INDEX FROM users;
SHOW INDEX FROM user_follows;
```

## 📊 创建的表清单

1. ✅ **users** - 扩展字段（nickname, avatar, role, last_login_at）
2. ✅ **user_sessions** - 用户会话表
3. ✅ **user_follows** - 关注专家表
4. ✅ **expert_applications** - 专家申请表
5. ✅ **user_chat_messages** - 比赛聊天消息表
6. ✅ **user_comments** - 用户评论表
7. ✅ **user_notifications** - 用户通知表
8. ✅ **user_settings** - 用户设置表
9. ✅ **user_chat_rate_limit** - 发言频率限制表

## 🔍 下一步

数据库表结构创建完成后，可以开始实现：
1. 用户认证系统（注册/登录）
2. 用户资料管理
3. 关注专家功能
4. 比赛聊天区

---

**请先执行数据库表结构创建，然后告诉我结果，我们继续下一步开发！**

