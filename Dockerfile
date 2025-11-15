# 生产环境 Dockerfile（模拟 Zeabur 环境）
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY client/package*.json ./client/

# 安装所有依赖（构建前端需要 devDependencies）
RUN npm ci && \
    cd client && npm ci && cd ..

# 复制源代码
COPY . .

# 构建前端（需要 devDependencies）
RUN cd client && npm run build && cd ..

# 清理 devDependencies（可选，减小镜像大小）
RUN npm prune --production && \
    cd client && npm prune --production && cd ..

# 暴露端口（Zeabur 会自动注入 PORT 环境变量）
EXPOSE 7001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 设置环境变量跳过 prestart（前端已在构建阶段完成）
ENV SKIP_PREBUILD=true

# 启动应用（直接启动，跳过 prestart）
CMD ["node", "server/index.js"]

