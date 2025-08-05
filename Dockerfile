# 使用 Node.js 18 Alpine 版本作为基础镜像（体积更小）
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production && npm cache clean --force

# 复制应用代码
COPY src/ ./src/
COPY public/ ./public/

# 创建必要的目录
RUN mkdir -p logs tmp backups && \
    chmod 755 logs tmp backups

# 创建非root用户（安全最佳实践）
RUN addgroup -g 1001 -S nodejs && \
    adduser -S proxyuser -u 1001 -G nodejs && \
    chown -R proxyuser:nodejs /app

# 切换到非root用户
USER proxyuser

# 暴露端口
EXPOSE 5237 5238 5239 5240 5241

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "const http=require('http');http.get('http://localhost:5237/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# 设置默认环境变量
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV MONITORING_ENABLED=true

# 启动应用
CMD ["node", "src/app.js"]