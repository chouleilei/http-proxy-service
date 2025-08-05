# VPS一键部署指南

## 🚀 快速部署

只需要一个Docker Compose文件即可在新VPS上完成完整部署！

### 1. 准备工作

确保VPS已安装Docker和Docker Compose：

```bash
# 安装Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

### 2. 下载部署文件

```bash
# 创建部署目录
mkdir -p ~/http-proxy-service && cd ~/http-proxy-service

# 下载Docker Compose文件
wget https://raw.githubusercontent.com/chouleilei/http-proxy-service/master/vps-deploy.yml

# 或者使用curl
curl -O https://raw.githubusercontent.com/chouleilei/http-proxy-service/master/vps-deploy.yml
```

### 3. 一键启动

```bash
# 启动服务
docker-compose -f vps-deploy.yml up -d

# 查看运行状态
docker-compose -f vps-deploy.yml ps

# 查看日志
docker-compose -f vps-deploy.yml logs -f
```

## 📋 服务端口说明

部署完成后，以下端口将可用：

| 端口 | 服务 | 说明 |
|------|------|------|
| 5237 | API服务器 | 管理接口和监控面板 |
| 5238 | 代理服务器1 | HTTP代理服务 |
| 5239 | 代理服务器2 | HTTP代理服务 |
| 5240 | HTTPS代理2 | HTTPS代理服务(可选) |
| 5241 | HTTPS API | HTTPS管理接口(可选) |

## 🔧 配置说明

### 环境变量配置

如需自定义配置，可以修改 `vps-deploy.yml` 文件中的环境变量：

```yaml
environment:
  # 上游代理配置 (可选)
  - UPSTREAM_PROXY_URL=http://your-upstream-proxy:port
  
  # 代理认证 (可选)
  - PROXY1_USERNAME=user1
  - PROXY1_PASSWORD=pass1
  - PROXY2_PASSWORD=pass2
  
  # 代理池配置
  - MAX_POOL_SIZE=10                    # 最大代理池大小
  - REFRESH_INTERVAL=300000             # 代理刷新间隔(5分钟)
  - HEALTH_CHECK_INTERVAL=600000        # 健康检查间隔(10分钟)
  
  # 日志级别
  - LOG_LEVEL=info                      # debug, info, warn, error
```

### 资源限制调整

根据VPS配置调整资源限制：

```yaml
deploy:
  resources:
    limits:
      cpus: '2'           # 根据VPS CPU核心数调整
      memory: 512M        # 根据VPS内存大小调整
    reservations:
      cpus: '0.5'
      memory: 256M
```

## 🌐 访问服务

### 管理面板
```
http://your-vps-ip:5237
```

### API接口示例
```bash
# 健康检查
curl http://your-vps-ip:5237/health

# 获取代理池状态
curl http://your-vps-ip:5237/api/proxy-pool/status

# 获取性能监控数据
curl http://your-vps-ip:5237/api/monitor/stats
```

### 代理使用
```bash
# 使用代理服务器1
curl -x http://your-vps-ip:5238 http://httpbin.org/ip

# 使用代理服务器2
curl -x http://your-vps-ip:5239 http://httpbin.org/ip
```

## 📊 监控和日志

### 查看实时日志
```bash
# 查看所有日志
docker-compose -f vps-deploy.yml logs -f

# 查看最近100行日志
docker-compose -f vps-deploy.yml logs --tail=100

# 查看错误日志
docker-compose -f vps-deploy.yml logs | grep ERROR
```

### 持久化数据

服务会自动创建以下目录来持久化数据：
- `./logs/` - 日志文件
- `./backups/` - 备份文件

## 🔄 服务管理

### 常用命令
```bash
# 启动服务
docker-compose -f vps-deploy.yml up -d

# 停止服务
docker-compose -f vps-deploy.yml down

# 重启服务
docker-compose -f vps-deploy.yml restart

# 更新到最新版本
docker-compose -f vps-deploy.yml pull
docker-compose -f vps-deploy.yml up -d

# 查看服务状态
docker-compose -f vps-deploy.yml ps

# 查看资源使用情况
docker stats http-proxy-service-v2
```

### 健康检查
服务内置健康检查，每30秒检查一次服务状态：
```bash
# 查看健康状态
docker inspect http-proxy-service-v2 | grep Health -A 10
```

## 🛡️ 安全建议

### 防火墙配置
```bash
# 只开放必要端口
sudo ufw allow 5237/tcp  # API端口
sudo ufw allow 5238/tcp  # 代理端口1
sudo ufw allow 5239/tcp  # 代理端口2
sudo ufw enable
```

### SSL配置 (可选)
如需启用HTTPS，设置环境变量：
```yaml
- SSL_ENABLED=true
- HTTPS_PROXY2_PORT=5240
- HTTPS_API_PORT=5241
```

## 🔧 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 检查端口占用
   sudo netstat -tlnp | grep :5237
   
   # 修改vps-deploy.yml中的端口映射
   ports:
     - "8237:5237"  # 改为其他端口
   ```

2. **内存不足**
   ```bash
   # 降低资源限制
   deploy:
     resources:
       limits:
         memory: 256M  # 降低内存限制
   ```

3. **服务无法启动**
   ```bash
   # 查看详细错误日志
   docker-compose -f vps-deploy.yml logs http-proxy-service
   
   # 检查Docker镜像
   docker images | grep http-proxy-service
   ```

## 📈 性能优化

### 针对不同VPS配置的建议

**1GB内存VPS:**
```yaml
deploy:
  resources:
    limits:
      memory: 256M
    reservations:
      memory: 128M
environment:
  - MAX_POOL_SIZE=5
```

**2GB内存VPS:**
```yaml
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M
environment:
  - MAX_POOL_SIZE=10
```

**4GB+内存VPS:**
```yaml
deploy:
  resources:
    limits:
      memory: 1G
    reservations:
      memory: 512M
environment:
  - MAX_POOL_SIZE=20
```

## 🎯 总结

使用 `vps-deploy.yml` 文件，您可以：
- ✅ 一键部署完整的HTTP代理服务
- ✅ 自动拉取最新的Docker镜像
- ✅ 自动创建持久化存储目录
- ✅ 内置健康检查和自动重启
- ✅ 完整的监控和日志系统
- ✅ 灵活的配置选项

只需要一个文件，即可在任何支持Docker的VPS上快速部署企业级HTTP代理服务！