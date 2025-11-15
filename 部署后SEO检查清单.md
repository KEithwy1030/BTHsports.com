# 部署后 SEO 检查清单

## ✅ 我可以帮你做的（已自动完成）

1. ✅ **robots.txt** - 已创建，部署后自动可用
2. ✅ **sitemap.xml 生成器** - 已创建，部署后自动生成
3. ✅ **Meta 标签** - 已添加到首页
4. ✅ **代码逻辑** - 已修改，保留历史比赛用于 SEO

## 🔧 需要你手动做的（部署后）

### 1. 设置环境变量

**位置**：部署平台（Zeabur/Docker）的环境变量设置

**需要设置的变量**：
```
SITE_URL=https://your-actual-domain.com
```

或者：
```
DOMAIN=https://your-actual-domain.com
```

**如何设置**：
- **Zeabur**：项目设置 → Environment Variables → 添加 `SITE_URL`
- **Docker**：在 `docker-compose.prod.yml` 的 `environment` 部分添加
- **其他平台**：在平台的环境变量设置中添加

**重要**：将 `your-actual-domain.com` 替换为你的实际域名！

---

### 2. 提交到搜索引擎

#### Google Search Console

**步骤**：
1. 访问：https://search.google.com/search-console
2. 添加属性（你的网站域名）
3. 验证网站所有权（按提示操作）
4. 提交 sitemap：
   - 左侧菜单 → Sitemaps
   - 输入：`https://your-domain.com/api/seo/sitemap.xml`
   - 点击"提交"

**时间**：通常 1-2 周后开始看到数据

#### 百度站长平台

**步骤**：
1. 访问：https://ziyuan.baidu.com/
2. 登录/注册账号
3. 添加网站（你的域名）
4. 验证网站所有权（按提示操作）
5. 提交 sitemap：
   - 左侧菜单 → 数据引入 → Sitemap
   - 输入：`https://your-domain.com/api/seo/sitemap.xml`
   - 点击"提交"

**时间**：通常 2-4 周后开始看到数据

---

### 3. 验证 SEO 配置

部署后，访问以下 URL 验证：

#### ✅ 验证 robots.txt
```
https://your-domain.com/robots.txt
```
应该看到 robots.txt 的内容

#### ✅ 验证 sitemap.xml
```
https://your-domain.com/api/seo/sitemap.xml
```
应该看到 XML 格式的网站地图

#### ✅ 验证首页 Meta 标签
```
https://your-domain.com/
```
右键 → 查看网页源代码，应该看到：
- `<title>百体汇 - 免费看体育直播...</title>`
- `<meta name="description" ...>`
- 其他 Meta 标签

---

## 📋 快速检查清单

部署后，按以下顺序检查：

- [ ] 设置环境变量 `SITE_URL` 或 `DOMAIN`
- [ ] 访问 `/robots.txt` 验证可访问
- [ ] 访问 `/api/seo/sitemap.xml` 验证可访问
- [ ] 检查首页源代码，确认 Meta 标签存在
- [ ] 在 Google Search Console 提交 sitemap
- [ ] 在百度站长平台提交 sitemap
- [ ] 等待 1-2 周，查看搜索引擎收录情况

---

## ⚠️ 注意事项

1. **域名替换**：所有 `your-domain.com` 都要替换为你的实际域名
2. **HTTPS**：确保网站使用 HTTPS（搜索引擎偏好）
3. **等待时间**：SEO 需要时间，不要期望立即见效
4. **持续优化**：定期检查搜索引擎收录情况，持续优化内容

---

## 🆘 如果遇到问题

### robots.txt 无法访问
- 检查服务器路由配置
- 确认 `/api/seo/robots.txt` 路由正常

### sitemap.xml 无法访问
- 检查环境变量是否设置
- 确认爬虫数据是否正常获取
- 查看服务器日志

### 搜索引擎不收录
- 确认已提交 sitemap
- 检查 robots.txt 是否允许抓取
- 等待更长时间（可能需要 1-3 个月）

