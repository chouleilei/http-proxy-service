# HTTP Proxy Service - Docker 部署指南

## 快速开始

### 1. 使用 Docker Compose（推荐）

```bash
# 克隆项目
git clone https://github.com/chouleilei/http-proxy-service.git
cd http-proxy-service

# 创建环境变量文件
cp .env.example .env

# 编辑 .env 文件，设置必需的环境变量：
# - UPSTREAM_PROXY_URL: 您的上游代理获取地址
# - PROXY_USERNAME: 代理认证用户名
# - PROXY_PASSWORD: 代理认证密码

# 使用 docker-compose 启动服务
docker-compose -f docker-compose-standalone.yml up -d

# 查看日志
docker-compose -f docker-compose-standalone.yml logs -f

# 停止服务
docker-compose -f docker-compose-standalone.yml down
```

### 2. 使用 Docker 命令

```bash
# 拉取镜像
docker pull ghcr.io/chouleilei/http-proxy-service:latest

# 运行容器（请替换环境变量值）
docker run -d \
  --name http-proxy-service \
  -p 5237:5237 \
  -p 5238:5238 \
  -e UPSTREAM_PROXY_URL="your_upstream_proxy_url" \
  -e PROXY_USERNAME="your_username" \
  -e PROXY_PASSWORD="your_password" \
  -e MAX_POOL_SIZE=10 \
  ghcr.io/chouleilei/http-proxy-service:latest

# 查看日志
docker logs -f http-proxy-service

# 停止容器
docker stop http-proxy-service

# 删除容器
docker rm http-proxy-service
```

## 环境变量说明

### 必需的环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| UPSTREAM_PROXY_URL | 上游代理获取地址 | https://api.proxy-provider.com/get |
| PROXY_USERNAME | 代理认证用户名 | myusername |
| PROXY_PASSWORD | 代理认证密码 | mypassword |

### 可选的环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| API_PORT | 5237 | API 和 Web 界面端口 |
| PROXY_PORT | 5238 | 代理服务端口 |
| MAX_POOL_SIZE | 10 | 代理池最大数量 |
| NODE_ENV | production | Node.js 环境 |

## 服务访问

启动成功后，您可以通过以下方式访问服务：

### Web 管理界面
- 地址：http://localhost:5237
- 功能：查看代理池状态、手动刷新、健康检查

### API 接口
- 获取代理状态：GET http://localhost:5237/api/proxies
- 刷新代理池：POST http://localhost:5237/api/refresh
- 健康检查：POST http://localhost:5237/api/health-check

### 代理服务
- 地址：http://localhost:5238
- 认证：使用您设置的 PROXY_USERNAME 和 PROXY_PASSWORD
- 示例：`http://username:password@localhost:5238`

## 构建自己的镜像

如果您想自行构建 Docker 镜像：

```bash
# 进入项目目录
cd http-proxy-service

# 构建镜像
docker build -f docker/Dockerfile -t my-proxy-service:latest .

# 运行自己构建的镜像
docker run -d \
  --name my-proxy-service \
  -p 5237:5237 \
  -p 5238:5238 \
  --env-file .env \
  my-proxy-service:latest
```

## 生产环境建议

1. **使用 .env 文件**
   - 不要在命令行中直接输入敏感信息
   - 使用 `--env-file .env` 参数加载环境变量

2. **日志持久化**
   ```bash
   docker run -d \
     --name http-proxy-service \
     -v ./logs:/app/logs \
     ...
   ```

3. **使用 Docker Compose**
   - 更容易管理配置
   - 支持自动重启
   - 便于升级和回滚

4. **资源限制**
   - 在 docker-compose.yml 中已配置资源限制
   - CPU: 最大 1 核心
   - 内存: 最大 512MB

5. **健康检查**
   - 容器内置健康检查
   - 每 30 秒检查一次 API 端点

## 故障排除

### 容器无法启动
1. 检查是否设置了所有必需的环境变量
2. 查看容器日志：`docker logs http-proxy-service`
3. 确保端口没有被占用

### 代理无法连接
1. 检查上游代理 URL 是否正确
2. 验证网络连接
3. 查看 Web 界面中的代理状态

### 性能问题
1. 调整 MAX_POOL_SIZE 参数
2. 检查上游代理的响应速度
3. 查看容器资源使用情况：`docker stats http-proxy-service`

## 更新服务

```bash
# 拉取最新镜像
docker pull ghcr.io/chouleilei/http-proxy-service:latest

# 停止并删除旧容器
docker stop http-proxy-service
docker rm http-proxy-service

# 使用新镜像启动
docker run -d ... (同上)
```

## 安全建议

1. 定期更新镜像以获取安全补丁
2. 使用强密码
3. 限制容器网络访问
4. 不要在公网暴露管理界面
5. 使用 HTTPS 反向代理（如 Nginx）

## 支持

如有问题，请查看：
- [项目主页](https://github.com/chouleilei/http-proxy-service)
- [问题追踪](https://github.com/chouleilei/http-proxy-service/issues)