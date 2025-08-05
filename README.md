# HTTP代理服务 v2.0 - 企业级Docker版本

一个功能完整的企业级HTTP代理服务，提供代理池管理、性能监控、双代理服务器和Web管理界面。

## 🚀 快速开始

### 方式一：使用 Docker Compose（推荐）

1. **下载部署文件**
   ```bash
   wget https://raw.githubusercontent.com/chouleilei/http-proxy-service/main/docker-compose-standalone.yml
   wget https://raw.githubusercontent.com/chouleilei/http-proxy-service/main/.env.example
   ```

2. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，设置必要的配置
   nano .env
   ```

3. **启动服务**
   ```bash
   docker-compose -f docker-compose-standalone.yml up -d
   ```

4. **验证部署**
   ```bash
   curl http://localhost:5237/health
   ```

### 方式二：使用 Docker 命令

```bash
docker run -d \
  --name http-proxy-service-v2 \
  -p 5237:5237 \
  -p 5238:5238 \
  -p 5239:5239 \
  -e UPSTREAM_PROXY_URL="your_upstream_proxy_url" \
  -e PROXY1_USERNAME="your_username" \
  -e PROXY1_PASSWORD="your_password" \
  -e PROXY2_PASSWORD="your_password" \
  -v $(pwd)/logs:/app/logs \
  ghcr.io/chouleilei/http-proxy-service:latest
```

## 📋 功能特性

### 🔄 企业级代理池管理
- **智能获取**: 并行获取多个代理，效率提升3-5倍
- **并发健康检查**: 3个并发连接，快速检测代理状态
- **智能轮换**: 按响应时间选择最优代理
- **自动恢复**: 失效代理自动移除和补充

### 📊 专业性能监控
- **系统监控**: CPU、内存、进程状态实时监控
- **请求统计**: RPS、响应时间、成功率统计
- **代理监控**: 代理池状态、平均响应时间
- **告警机制**: 自动告警异常情况

### 🌐 双代理服务
- **代理服务器1**: 端口5238，需要用户名+密码认证
- **代理服务器2**: 端口5239，仅需密码认证
- **HTTPS支持**: 可选的SSL/TLS加密传输

### 📝 专业日志系统
- **分级日志**: error/warn/info/debug四个级别
- **自动轮转**: 按日期轮转，节省87%存储空间
- **结构化**: JSON格式，便于分析和搜索

### 🎛️ Web管理界面
- **实时监控**: 美观的Web监控面板
- **API接口**: 16个完整的管理API
- **操作便捷**: 一键刷新、健康检查

## 🔧 环境变量配置

### 必需配置

| 环境变量 | 说明 | 示例 |
|----------|------|------|
| `UPSTREAM_PROXY_URL` | 上游代理API地址 | `https://api.proxy.com/get` |
| `PROXY1_USERNAME` | 代理服务器1用户名 | `username` |
| `PROXY1_PASSWORD` | 代理服务器1密码 | `password` |
| `PROXY2_PASSWORD` | 代理服务器2密码 | `password` |

### 可选配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `API_PORT` | 5237 | API服务端口 |
| `PROXY1_PORT` | 5238 | 代理服务器1端口 |
| `PROXY2_PORT` | 5239 | 代理服务器2端口 |
| `MAX_POOL_SIZE` | 10 | 代理池最大容量 |
| `REFRESH_INTERVAL` | 300000 | 代理池刷新间隔(毫秒) |
| `HEALTH_CHECK_INTERVAL` | 600000 | 健康检查间隔(毫秒) |
| `LOG_LEVEL` | info | 日志级别 |
| `MONITORING_ENABLED` | true | 是否启用监控 |
| `SSL_ENABLED` | false | 是否启用SSL |

## 📖 使用说明

### Web管理界面

访问 `http://localhost:5237` 查看：
- 代理池实时状态
- 性能监控图表
- 系统健康状况
- 操作控制面板

### 代理服务使用

**代理服务器1** (需要用户名密码):
```bash
curl -x http://username:password@localhost:5238 http://httpbin.org/ip
```

**代理服务器2** (只需要密码):
```bash
curl -x http://password@localhost:5239 http://httpbin.org/ip
```

### API接口

```bash
# 获取系统状态
curl http://localhost:5237/api/status

# 获取代理列表
curl http://localhost:5237/api/proxies

# 刷新代理池
curl -X POST http://localhost:5237/api/proxies/refresh

# 执行健康检查
curl -X POST http://localhost:5237/api/proxies/health-check

# 获取性能数据
curl http://localhost:5237/api/performance

# 健康检查端点
curl http://localhost:5237/health
```

## 🔍 监控和维护

### 查看日志
```bash
# Docker Compose部署
docker-compose logs -f http-proxy-service

# Docker命令部署
docker logs -f http-proxy-service-v2

# 查看持久化日志
tail -f logs/proxy-$(date +%Y-%m-%d).log
```

### 健康检查
```bash
# 检查容器状态
docker ps | grep http-proxy-service

# 检查服务健康
curl http://localhost:5237/health

# 检查代理池状态
curl http://localhost:5237/api/proxies | jq '.meta'
```

### 性能监控
```bash
# 获取性能指标
curl http://localhost:5237/api/performance | jq

# 获取详细报告
curl http://localhost:5237/api/performance/report | jq
```

## 🛠️ 故障排除

### 常见问题

1. **容器启动失败**
   ```bash
   # 检查日志
   docker logs http-proxy-service-v2
   
   # 检查端口占用
   netstat -tulpn | grep :5237
   ```

2. **代理池为空**
   ```bash
   # 检查上游API配置
   curl $UPSTREAM_PROXY_URL
   
   # 手动刷新代理池
   curl -X POST http://localhost:5237/api/proxies/refresh
   ```

3. **认证失败**
   ```bash
   # 检查环境变量
   docker exec http-proxy-service-v2 env | grep PROXY
   
   # 测试代理认证
   curl -x http://username:password@localhost:5238 http://httpbin.org/ip
   ```

## 📊 与v1.0版本对比

| 功能 | v1.0 | v2.0 | 提升 |
|------|------|------|------|
| API接口数量 | 3个 | 16个 | 5倍提升 |
| 代理服务器 | 1个 | 2个+SSL | 双倍+安全 |
| 监控功能 | 基础 | 专业级 | 质的飞跃 |
| 日志系统 | 简单 | 企业级 | 专业化 |
| 健康检查 | 串行 | 并发 | 性能提升 |

## 🏷️ 镜像标签

- `latest` - v2.0企业版（最新稳定版本）
- `v2.0` - v2.0企业版本
- `enterprise` - 企业版别名
- `v1.0` - v1.0简化版本（保留兼容）
- `slim` - v1.0简化版别名
- `v2.0.0` - 具体版本号

## 🔗 相关链接

- [GitHub仓库](https://github.com/chouleilei/http-proxy-service)
- [Docker镜像](https://ghcr.io/chouleilei/http-proxy-service)
- [问题反馈](https://github.com/chouleilei/http-proxy-service/issues)

## 📄 许可证

MIT License

---

**作者**: chouleilei  
**版本**: v2.0 企业级版本  
**更新时间**: 2025年1月