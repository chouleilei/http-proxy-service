# HTTP Proxy Service

一个基于 Node.js 的 HTTP 代理服务，支持代理池管理、自动健康检查和 Web 管理界面。

## 功能特性

- 🔄 自动从上游获取代理并维护代理池
- 🏥 自动健康检查，剔除无效代理
- 🌐 标准 HTTP/HTTPS 代理服务（端口 5238）
- 📊 Web 管理界面和 REST API（端口 5237）
- 🐳 完整的 Docker 支持
- 🔧 灵活的环境变量配置
- 🔒 所有敏感信息通过环境变量配置，安全可靠

## 快速开始

### 方式一：使用 Docker Compose（推荐）

1. 下载 `docker-compose-standalone.yml` 文件
2. 修改环境变量
3. 运行服务

```bash
# 下载 docker-compose 文件
wget https://raw.githubusercontent.com/chouleilei/http-proxy-service/main/docker-compose-standalone.yml

# 创建 .env 文件并设置环境变量
cp .env.example .env
# 编辑 .env 文件，设置以下必需的环境变量：
# - UPSTREAM_PROXY_URL
# - PROXY_USERNAME
# - PROXY_PASSWORD

# 启动服务
docker-compose -f docker-compose-standalone.yml up -d
```

### 方式二：使用 Docker 命令

```bash
docker run -d \
  --name http-proxy-service \
  -p 5237:5237 \
  -p 5238:5238 \
  -e UPSTREAM_PROXY_URL="your_upstream_proxy_url" \
  -e PROXY_USERNAME="your_username" \
  -e PROXY_PASSWORD="your_password" \
  ghcr.io/chouleilei/http-proxy-service:latest
```

## 使用说明

### Web 管理界面

访问 `http://localhost:5237` 查看代理池状态。

### 配置代理

在浏览器或应用程序中配置：
- 代理地址：`localhost` 或服务器 IP
- 代理端口：`5238`
- 认证方式：Basic Auth
- 用户名/密码：您在环境变量中设置的值

### API 接口

- `GET /api/proxies` - 获取代理池状态
- `POST /api/refresh` - 刷新代理池
- `POST /api/health-check` - 执行健康检查

## 环境变量

| 变量名 | 必需 | 说明 | 默认值 |
|--------|------|------|--------|
| UPSTREAM_PROXY_URL | ✅ | 上游代理获取地址 | - |
| PROXY_USERNAME | ✅ | 代理认证用户名 | - |
| PROXY_PASSWORD | ✅ | 代理认证密码 | - |
| API_PORT | ❌ | API 服务端口 | 5237 |
| PROXY_PORT | ❌ | 代理服务端口 | 5238 |
| MAX_POOL_SIZE | ❌ | 代理池最大数量 | 10 |

## 开发指南

如果您想自行构建或修改代码：

```bash
# 克隆仓库
git clone https://github.com/chouleilei/http-proxy-service.git
cd http-proxy-service

# 本地开发
npm install
# 创建并配置环境变量
cp .env.example .env
# 编辑 .env 文件设置必需的环境变量
node app.js

# 构建 Docker 镜像
cd docker
docker-compose build
```

详细的 Docker 使用说明请查看 [docker/README-docker.md](docker/README-docker.md)

## 项目结构

```
├── docker/                 # Docker 相关文件
│   ├── app-simplified.js  # 简化版应用
│   ├── Dockerfile         # 镜像构建配置
│   └── docker-compose.yml # 本地构建配置
├── public/                # Web 界面
├── app.js                 # 完整版应用
└── package.json           # 项目依赖
```

## License

MIT
