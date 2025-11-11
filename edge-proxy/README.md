# Edge Proxy Service

用于在 **Zeabur** 等边缘平台部署的轻量级 JRKAN 播放代理，负责补齐 Referer / Cookie 并改写 m3u8 清单，同时通过短时缓存减少回源次数，从而在不中转主站流量的情况下保持播放兼容性。

## 功能概览

- `GET /proxy-m3u8`：转发并改写上游 m3u8 清单，将分片指向同域代理；
- `GET /proxy-segment`：转发 m3u8 子清单 / TS 分片，并缓存常见片段；
- `POST /sessions`（可选）：上游服务可推送最新的播放链接 / Cookie；
- `POST /prewarm`：手动预热热门比赛的 m3u8 缓存；
- 统一的 CORS 处理，默认允许所有来源测试；
- 通过环境变量调整 Referer、Cookie、超时时间、允许域名等。

## 快速部署（Zeabur）

1. 在 Zeabur 创建 **Node.js** 服务，连接当前仓库或上传本目录；
2. 设置环境变量（示例）：

   | Key | Value |
   | --- | --- |
   | `DEFAULT_REFERER` | `http://play.jgdhds.com/` |
   | `ALLOWED_ORIGINS` | `*` |
   | `REQUEST_TIMEOUT_MS` | `15000` |
   | `SESSION_TTL_SECONDS` | `900` |
   | `MANIFEST_CACHE_TTL_MS` | `5000` |
   | `SEGMENT_CACHE_TTL_MS` | `15000` |

3. 保持默认启动命令 `npm start`；
4. 部署完成后记下分配的域名，例如 `https://your-proxy.zeabur.app`；
5. 前端配置 `VITE_STREAM_PROXY_ORIGIN=https://your-proxy.zeabur.app`；
6. 重新构建前端并验证直连失败时能自动 fallback。

## 本地开发

```bash
cd edge-proxy
npm install
npm run dev
# 默认端口 8787，可通过 PORT 环境变量覆盖
```

## 关键环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 服务监听端口 |
| `DEFAULT_REFERER` | `http://play.jgdhds.com/` | 代理请求的 Referer |
| `DEFAULT_USER_AGENT` | 浏览器 UA | 代理请求的 User-Agent |
| `ALLOWED_ORIGINS` | `*` | CORS 允许的来源，逗号分隔 |
| `REQUEST_TIMEOUT_MS` | `15000` | 上游请求超时时间（毫秒） |
| `SESSION_TTL_SECONDS` | `900` | 会话缓存过期时间（秒） |
| `MANIFEST_CACHE_TTL_MS` | `5000` | m3u8 清单缓存时间（毫秒），设为 `0` 关闭 |
| `SEGMENT_CACHE_TTL_MS` | `15000` | TS/子清单缓存时间（毫秒），设为 `0` 关闭 |
| `MANIFEST_CACHE_MAX` | `500` | 清单缓存的最大条目数 |
| `SEGMENT_CACHE_MAX` | `200` | 片段缓存的最大条目（按条目/大小自动淘汰） |

## 与主站的协作方式

- 主站 `/api/jrkan/extract-stream` 返回的 `streamUrl`、`sessionCookies`、`sourceUrl` 仍由前端携带；
- 播放器会优先直连上游，失败时改用 `VITE_STREAM_PROXY_ORIGIN` 对应域名的 `/proxy-m3u8`；
- 如需共享刷新后的播放链接，可通过 `POST /sessions` 将信息写入边缘缓存。
- 对热门比赛，可在开赛前调用 `POST /prewarm` 批量预热，命中率更高。

## 注意事项

- 建议在边缘服务侧开启基础流量监控，确保成本可控；
- 若上游域名列表变动，需要同步更新代理允许访问的域名白名单；
- 若遇到 403，可在前端触发重新提取流地址或调用 `/sessions` 更新缓存。

