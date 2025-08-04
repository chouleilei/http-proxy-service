# HTTP 代理服务 - 快速部署指南

## 项目概述

本项目已完成 Docker 化改造，支持以下功能：
- API 服务（端口 5237）：Web 管理界面和 REST API
- 代理服务（端口 5238）：标准 HTTP/HTTPS 代理

## 部署前准备

### 必需的环境变量

在部署前，您需要准备以下信息：
- `UPSTREAM_PROXY_URL`: 上游代理获取地址
- `PROXY_USERNAME`: 代理认证用户名
- `PROXY_PASSWORD`: 代理认证密码

## 部署步骤

### 1. 使用 Docker Compose（本地部署）

```bash
# 克隆项目
git clone <your-repository-url>
cd http-proxy-service

# 编辑 docker-compose.yml 文件
# 修改以下环境变量为您的实际值：
# - UPSTREAM_PROXY_URL=YOUR_UPSTREAM_PROXY_URL_HERE
# - PROXY_USERNAME=YOUR_USERNAME_HERE
# - PROXY_PASSWORD=YOUR_PASSWORD_HERE

# 进入 docker 目录并启动服务
cd docker
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 2. 使用 GitHub Container Registry（生产部署）

当代码推送到 GitHub 后，会自动构建并发布镜像。

```bash
# 拉取镜像
docker pull ghcr.io/<your-username>/http-proxy-service:latest

# 运行容器
docker run -d \
  --name http-proxy-service \
  -p 5237:5237 \
  -p 5238:5238 \
  -e UPSTREAM_PROXY_URL="your_upstream_proxy_url" \
  -e PROXY_USERNAME="your_username" \
  -e PROXY_PASSWORD="your_password" \
  ghcr.io/<your-username>/http-proxy-service:latest
```

## 访问服务

- **Web 管理界面**: http://localhost:5237
- **代理服务**: http://[your_username]:[your_password]@localhost:5238

## 环境变量配置

### 必需的环境变量

| 变量名 | 说明 |
|--------|------|
| UPSTREAM_PROXY_URL | 上游代理地址 |
| PROXY_USERNAME | 代理认证用户名 |
| PROXY_PASSWORD | 代理认证密码 |

### 可选的环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| API_PORT | 5237 | API 端口 |
| PROXY_PORT | 5238 | 代理端口 |
| MAX_POOL_SIZE | 10 | 代理池大小 |

## 文件清单

- `docker/` - Docker 相关文件目录
  - `app-simplified.js` - 简化版应用代码（仅保留必要功能）
  - `Dockerfile` - Docker 镜像构建配置
  - `docker-compose.yml` - Docker Compose 配置（包含环境变量）
  - `.dockerignore` - Docker 构建忽略文件
  - `README-docker.md` - 详细使用文档
  - `DEPLOY.md` - 本部署指南
- `.github/workflows/docker-publish.yml` - GitHub Actions 自动构建配置

## 注意事项

1. **必须在 docker-compose.yml 中设置所有必需的环境变量，否则容器无法启动**
2. **生产环境请使用强密码**
3. 日志文件会保存在 `./logs` 目录
4. 确保防火墙开放 5237 和 5238 端口
5. 建议使用反向代理（如 Nginx）提供 HTTPS 支持

## 下一步

1. 将代码推送到 GitHub
2. 等待 GitHub Actions 自动构建镜像
3. 在目标服务器上拉取并运行镜像
4. 配置反向代理和域名（可选）

## 故障排除

### 容器启动失败

最常见的原因是未设置必需的环境变量。请检查：
- 是否在 docker-compose.yml 中修改了必需的环境变量
- 是否在 docker run 命令中提供了所有必需的 -e 参数

### 查看错误信息

```bash
# 使用 docker-compose
docker-compose logs

# 使用 docker
docker logs http-proxy-service