# 快速提交 Sitemap 指南

## 📋 你的 Sitemap 地址

部署后，你的 sitemap 地址是：
```
https://your-domain.com/api/seo/sitemap.xml
```

**重要**：将 `your-domain.com` 替换为你的实际域名！

---

## 🔵 Google Search Console

### 步骤 1：访问并登录
1. 打开：https://search.google.com/search-console
2. 使用 Google 账号登录

### 步骤 2：添加属性（如果还没有）
1. 点击"添加属性"
2. 选择"网址前缀"
3. 输入你的域名：`https://your-domain.com`
4. 点击"继续"
5. 按提示验证网站所有权（通常有几种方法，选择最简单的）

### 步骤 3：提交 Sitemap
1. 验证成功后，在左侧菜单找到"Sitemaps"
2. 在"添加新的 sitemap"输入框输入：
   ```
   api/seo/sitemap.xml
   ```
   （不需要完整 URL，只需要路径）
3. 点击"提交"
4. 等待几分钟，应该显示"成功"

### 步骤 4：查看状态
- 提交后，状态会显示"已提交"
- 通常 1-2 周后，会显示"已成功"和索引的页面数量

---

## 🔴 百度站长平台

### 步骤 1：访问并登录
1. 打开：https://ziyuan.baidu.com/
2. 使用百度账号登录（如果没有，需要先注册）

### 步骤 2：添加网站（如果还没有）
1. 点击"用户中心" → "站点管理"
2. 点击"添加网站"
3. 输入你的域名：`https://your-domain.com`
4. 选择网站类型和验证方式
5. 按提示验证网站所有权

### 步骤 3：提交 Sitemap
1. 验证成功后，在左侧菜单找到"数据引入" → "Sitemap"
2. 点击"添加新数据"
3. 输入完整的 sitemap 地址：
   ```
   https://your-domain.com/api/seo/sitemap.xml
   ```
4. 点击"提交"
5. 等待几分钟，应该显示"提交成功"

### 步骤 4：查看状态
- 提交后，可以在"Sitemap"页面查看提交状态
- 通常 2-4 周后，会显示索引的页面数量

---

## ⚡ 快速检查清单

提交前，确保：
- [ ] 网站已部署并可访问
- [ ] 环境变量 `SITE_URL` 已设置为实际域名
- [ ] 可以访问 `https://your-domain.com/robots.txt`
- [ ] 可以访问 `https://your-domain.com/api/seo/sitemap.xml`
- [ ] sitemap.xml 中的链接使用的是实际域名（不是 `your-domain.com`）

提交后：
- [ ] Google Search Console 显示"已提交"
- [ ] 百度站长平台显示"提交成功"
- [ ] 等待 1-2 周后查看收录情况

---

## 🆘 常见问题

### Q: sitemap 提交失败？
**A:** 检查：
1. sitemap URL 是否正确
2. 网站是否可以正常访问
3. sitemap.xml 是否可以正常访问
4. 环境变量 `SITE_URL` 是否设置正确

### Q: 提交后没有反应？
**A:** 正常现象：
- Google 通常需要 1-2 周开始索引
- 百度通常需要 2-4 周开始索引
- 耐心等待，不要频繁重复提交

### Q: 如何查看是否被收录？
**A:** 在搜索引擎搜索：
- Google: `site:your-domain.com`
- 百度: `site:your-domain.com`

---

## 📝 注意事项

1. **不要重复提交**：每个 sitemap 只需要提交一次
2. **定期更新**：sitemap 会自动更新，不需要重新提交
3. **耐心等待**：SEO 是长期过程，不要期望立即见效
4. **持续优化**：定期检查收录情况，持续优化内容

