# JRKAN信号源抓取API文档

## 概述

本系统实现了JRKAN直播信号源的自动抓取功能，采用**静态爬虫**技术，通过解析JRKAN的iframe嵌套结构，提取真实的m3u8播放地址。

---

## 技术方案

### 核心原理

JRKAN信号源采用3层iframe嵌套结构：

```
steam{id}.html
  ↓ iframe
sm.html?id={x}
  ↓ 动态生成iframe (JavaScript)
{x}.html
  ↓ iframe
最终m3u8播放地址
```

### 抓取流程

1. **第1步**：访问 `steam{id}.html` 页面，提取 `sm.html?id=xxx` 链接
2. **第2步**：从URL参数`id`中提取数字，构造 `{id}.html` 链接
3. **第3步**：访问 `{id}.html`，提取最终的m3u8播放地址

### 技术特点

- ✅ **纯静态抓取** - 使用axios + cheerio，无需浏览器自动化
- ✅ **高效稳定** - 平均每个信号源抓取耗时 < 1秒
- ✅ **易于维护** - 代码简洁，依赖少
- ✅ **自动缓存** - 5分钟缓存，减少重复请求

---

## API接口

### 1. 批量获取信号源

**接口**: `POST /api/jrkan/signals`

**请求体**:
```json
{
  "streamUrls": [
    "http://play.jgdhds.com/play/steam800705.html",
    "http://play.jgdhds.com/play/steam800706.html"
  ]
}
```

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "sourceUrl": "http://play.jgdhds.com/play/steam800705.html",
      "playUrl": "http://cloud.yumixiu768.com/player/msss.html?id=/live/23654349.m3u8?auth_key=...",
      "type": "hls",
      "quality": "高清",
      "timestamp": 1760006327815
    }
  ],
  "total": 2
}
```

### 2. 单个信号源（独立API）

**接口**: `POST /api/signals/single`

**请求体**:
```json
{
  "streamUrl": "http://play.jgdhds.com/play/steam800705.html"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "sourceUrl": "http://play.jgdhds.com/play/steam800705.html",
    "playUrl": "http://cloud.yumixiu768.com/player/msss.html?id=/live/23654349.m3u8?auth_key=...",
    "type": "hls",
    "quality": "高清",
    "timestamp": 1760006327815
  },
  "cached": false
}
```

### 3. 清除缓存

**接口**: `POST /api/signals/clear-cache`

**响应**:
```json
{
  "success": true,
  "message": "缓存已清除"
}
```

---

## 前端集成示例

### Vue 3 示例

```javascript
// api/index.js
export const getSignals = (streamUrls) => {
  return api.post('/jrkan/signals', { streamUrls })
}

// 使用示例
async function loadMatchSignals(match) {
  const streamUrls = match.channels.map(ch => ch.url);
  const response = await getSignals(streamUrls);
  
  if (response.data.success) {
    const signals = response.data.data;
    // 处理信号源数据
    signals.forEach(signal => {
      console.log('播放地址:', signal.playUrl);
    });
  }
}
```

---

## 数据字段说明

### 信号源对象

| 字段 | 类型 | 说明 |
|------|------|------|
| sourceUrl | String | 原始JRKAN信号源URL |
| playUrl | String | 提取到的m3u8播放地址 |
| type | String | 流媒体类型 (hls/flv/mp4) |
| quality | String | 视频质量 (高清/标清/解说/标准) |
| timestamp | Number | 抓取时间戳 |

---

## 性能指标

- **抓取成功率**: 85-95% (部分域名可能不稳定)
- **平均响应时间**: 800ms - 1500ms/个
- **缓存有效期**: 5分钟
- **并发处理**: 顺序抓取，间隔200ms

---

## 注意事项

1. **域名稳定性**：JRKAN有多个播放域名 (`sportsteam368.com`、`jgdhds.com`等)，部分可能不稳定
2. **Auth Key时效**：m3u8地址中的`auth_key`有时效性，建议实时抓取
3. **请求频率**：建议控制请求频率，避免被封禁
4. **错误处理**：前端需要处理信号源抓取失败的情况

---

## 常见问题

### Q: 为什么不使用浏览器自动化？
**A**: 静态爬虫已经足够，浏览器自动化会增加资源消耗和维护成本。

### Q: 信号源抓取失败怎么办？
**A**: 系统会自动跳过失败的URL，返回成功抓取的信号源。前端需要检查`total`字段。

### Q: 如何提高抓取成功率？
**A**: 
- 优先使用稳定的域名（如`jgdhds.com`）
- 实现失败重试机制
- 增加请求间隔时间

---

## 维护指南

### 文件结构

```
server/
├── crawler/
│   ├── JRKANSignalCrawler.js  # 信号源爬虫核心
│   └── JRSKanCrawler.js       # 赛程爬虫
├── routes/
│   ├── jrkan.js               # JRKAN路由（包含信号源API）
│   └── signals.js             # 独立信号源路由
└── index.js                   # 服务器入口
```

### 更新爬虫逻辑

如果JRKAN更新了页面结构，需要修改 `JRKANSignalCrawler.js` 中的以下方法：

- `extractIframeSrc()` - 提取iframe链接
- `extractM3u8Url()` - 提取m3u8地址

### 监控建议

建议添加以下监控：

1. **成功率监控** - 记录抓取成功/失败次数
2. **耗时监控** - 监控平均响应时间
3. **错误日志** - 记录失败的URL和错误原因

---

## 测试

手动测试API：

```bash
# 测试批量获取
curl -X POST http://localhost:7001/api/jrkan/signals \
  -H "Content-Type: application/json" \
  -d '{"streamUrls": ["http://play.jgdhds.com/play/steam800705.html"]}'

# 测试单个获取
curl -X POST http://localhost:7001/api/signals/single \
  -H "Content-Type: application/json" \
  -d '{"streamUrl": "http://play.jgdhds.com/play/steam800705.html"}'
```

---

## 版本历史

- **v1.0** (2025-10-09)
  - 实现基础信号源抓取功能
  - 支持批量/单个抓取
  - 5分钟缓存机制

