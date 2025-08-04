# 使用 Node.js 18 Alpine 版本作为基础镜像（体积更小）
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production

# 复制应用代码
COPY app.js ./
COPY public ./public

# 创建日志文件
RUN touch proxy.log

# 暴露端口
EXPOSE 5237 5238

# 设置默认环境变量
ENV NODE_ENV=production

# 启动应用
CMD ["node", "app.js"]