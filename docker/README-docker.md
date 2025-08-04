# HTTP代理服务 - Docker 版本

这是一个 Docker 化的 HTTP 代理服务项目，能够接收上游代理并对外提供标准的 HTTP/HTTPS 代理服务。

## 功能特性

1. 自动从上游获取代理并维护代理池
2. 自动检测和剔除无效代理
3. 提供标准 HTTP/HTTPS 代理服务（端口 5238）
4. 提供 Web 管理界面和 API（端口 5237）
5. 支持环境变量配置
6. 支持 Docker 和 Docker Compose 部署
7. 自动构建并发布到 GitHub Container Registry

## 快速开始

### 使用预构建镜像（推荐）

从 GitHub Container Registry 拉取镜像：

```bash
# 拉取最新版本
docker pull ghcr.io/[your-username]/http-proxy-service:latest

# 运行容器（需要提供必需的环境变量）
docker run -d \
  --name http-proxy-service \
  -p 5237:5237 \
  -p 5238:5238 \
  -e UPSTREAM_PROXY_URL="your_upstream_proxy_url" \
  -e PROXY_USERNAME="your_username" \
  -e PROXY_PASSWORD="your_password" \
  ghcr.io/[your-username]/http-proxy-service:latest
```

### 使用 Docker Compose（推荐）

1. 克隆项目并进入目录：
```bash
git clone <repository-url>
cd http-proxy-service
```

2. 修改 docker-compose.yml 文件：
```bash
# 编辑 docker/docker-compose.yml 文件
# 将以下环境变量修改为您的实际值：
# - UPSTREAM_PROXY_URL=YOUR_UPSTREAM_PROXY_URL_HERE
# - PROXY_USERNAME=YOUR_USERNAME_HERE
# - PROXY_PASSWORD=YOUR_PASSWORD_HERE
```

3. 启动服务：
```bash
cd docker
docker-compose up -d
```

4. 查看日志：
```bash
docker-compose logs -f
```

5. 停止服务：
```bash
docker-compose down
```

### 使用 Docker 命令

1. 构建镜像：
```bash
docker build -t http-proxy-service -f docker/Dockerfile .
```

2. 运行容器：
```bash
docker run -d \
  --name http-proxy-service \
  -p 5237:5237 \
  -p 5238:5238 \
  -e UPSTREAM_PROXY_URL="your_upstream_proxy_url" \
  -e PROXY_USERNAME="your_username" \
  -e PROXY_PASSWORD="your_password" \
  http-proxy-service
```

## 使用方法

### Web 管理界面

访问 `http://localhost:5237` 查看代理池状态和管理界面。

### 使用代理

在浏览器或应用程序中设置 HTTP 代理：

- 代理地址: `localhost` 或服务器 IP
- 代理端口: `5238`
- 用户名: 您设置的 PROXY_USERNAME
- 密码: 您设置的 PROXY_PASSWORD

示例：`http://username:password@localhost:5238`

### API 接口

- `GET /api/proxies` - 获取所有代理信息
- `POST /api/refresh` - 手动刷新代理池
- `POST /api/health-check` - 手动执行健康检查

## 环境变量配置

### 必需的环境变量

| 变量名 | 说明 |
|--------|------|
| UPSTREAM_PROXY_URL | 上游代理获取地址 |
| PROXY_USERNAME | 代理认证用户名 |
| PROXY_PASSWORD | 代理认证密码 |

### 可选的环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| API_PORT | API 服务端口 | 5237 |
| PROXY_PORT | 代理服务端口 | 5238 |
| MAX_POOL_SIZE | 代理池最大数量 | 10 |

## 高级配置

### 修改资源限制

编辑 `docker-compose.yml` 中的 `deploy.resources` 部分：

```yaml
deploy:
  resources:
    limits:
      cpus: '2'      # 最大 CPU 核心数
      memory: 1G     # 最大内存
    reservations:
      cpus: '1'      # 保留 CPU 核心数
      memory: 512M   # 保留内存
```

### 持久化日志

日志文件会自动保存到 `./logs` 目录，可以通过修改 `docker-compose.yml` 中的 volumes 配置来改变日志位置。

### 生产环境部署

1. 使用强密码和安全的认证信息
2. 考虑使用 Docker Swarm 或 Kubernetes 进行集群部署
3. 配置反向代理（如 Nginx）提供 HTTPS 支持
4. 设置日志轮转避免磁盘空间耗尽

## 故障排除

### 容器无法启动

1. 检查是否设置了必需的环境变量
2. 检查端口是否被占用：
```bash
netstat -tlnp | grep -E '5237|5238'
```

### 代理无法连接

1. 检查容器日志：
```bash
docker-compose logs http-proxy-service
```

2. 验证上游代理是否可用

3. 检查防火墙设置

### 性能优化

1. 增加 `MAX_POOL_SIZE` 提高并发能力
2. 调整 Docker 资源限制
3. 使用多个容器实例进行负载均衡

## 开发说明

### 本地开发

1. 安装依赖：
```bash
npm install
```

2. 设置环境变量后运行：
```bash
export UPSTREAM_PROXY_URL="your_url"
export PROXY_USERNAME="your_username"
export PROXY_PASSWORD="your_password"
node app-simplified.js
```

### 构建新镜像

```bash
docker build -t http-proxy-service:v1.0.0 .
docker tag http-proxy-service:v1.0.0 your-registry/http-proxy-service:v1.0.0
docker push your-registry/http-proxy-service:v1.0.0
```

## GitHub Actions 自动构建

本项目配置了 GitHub Actions，会在以下情况自动构建并推送镜像到 GitHub Container Registry：

1. 推送到 main/master 分支时
2. 创建新的标签时（如 v1.0.0）
3. 提交 Pull Request 时

镜像会自动发布到：`ghcr.io/[your-username]/http-proxy-service`

### 使用不同版本

```bash
# 使用特定版本
docker pull ghcr.io/[your-username]/http-proxy-service:v1.0.0

# 使用主分支最新版本
docker pull ghcr.io/[your-username]/http-proxy-service:main

# 使用最新稳定版本
docker pull ghcr.io/[your-username]/http-proxy-service:latest
```

## 项目文件说明

- `docker/app-simplified.js` - 简化版的应用主文件（只保留 5237 和 5238 端口）
- `docker/Dockerfile` - Docker 镜像构建配置
- `docker/docker-compose.yml` - Docker Compose 配置文件（包含环境变量配置）
- `docker/.dockerignore` - Docker 构建时忽略的文件
- `.github/workflows/docker-publish.yml` - GitHub Actions 自动构建配置

## 许可证

MIT License