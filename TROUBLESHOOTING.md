# 故障排除指南

## 🚨 容器重启问题诊断

### 问题现象
容器不停重启，状态显示为 `Restarting`

### 根本原因分析

通过日志分析发现主要问题：

```bash
error 未捕获的异常 {"type":"uncaught_exception","error":"EACCES: permission denied, open 'logs/proxy-2025-08-05.log'"}
```

**问题根源：文件权限错误**
- 容器内的Node.js应用无法在挂载的 `./logs` 目录中创建日志文件
- Docker挂载的目录权限与容器内用户权限不匹配
- 应用启动成功但在写入日志时崩溃，触发重启循环

## 🔧 解决方案

### 方案1：使用修复版配置文件（推荐）

1. **停止当前容器**
   ```bash
   docker-compose down
   ```

2. **下载修复版配置**
   ```bash
   wget https://raw.githubusercontent.com/chouleilei/http-proxy-service/master/vps-deploy-fixed.yml -O docker-compose.yml
   ```

3. **创建目录并设置权限**
   ```bash
   mkdir -p logs backups
   sudo chown -R 1000:1000 logs backups
   chmod -R 755 logs backups
   ```

4. **重新启动**
   ```bash
   docker-compose up -d
   ```

### 方案2：手动修复权限

如果您想继续使用当前配置文件：

1. **停止容器**
   ```bash
   docker-compose down
   ```

2. **修复目录权限**
   ```bash
   # 创建目录
   mkdir -p logs backups
   
   # 设置正确的所有者和权限
   sudo chown -R 1000:1000 logs backups
   chmod -R 755 logs backups
   
   # 或者使用更宽松的权限
   chmod -R 777 logs backups
   ```

3. **修改docker-compose.yml**
   在服务配置中添加用户权限：
   ```yaml
   services:
     http-proxy-service:
       # ... 其他配置
       user: "1000:1000"  # 添加这一行
       volumes:
         - ./logs:/app/logs:rw      # 确保有读写权限
         - ./backups:/app/backups:rw
   ```

4. **重新启动**
   ```bash
   docker-compose up -d
   ```

### 方案3：使用容器内部目录（临时解决）

如果权限问题仍然存在，可以暂时不挂载外部目录：

1. **修改docker-compose.yml**
   ```yaml
   services:
     http-proxy-service:
       # ... 其他配置
       # volumes:  # 注释掉挂载配置
       #   - ./logs:/app/logs
       #   - ./backups:/app/backups
   ```

2. **重新启动**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

   > 注意：这种方式日志将存储在容器内部，容器删除后日志会丢失

## 🔍 验证修复效果

### 检查容器状态
```bash
# 查看容器状态
docker-compose ps

# 应该显示 "Up" 状态而不是 "Restarting"
```

### 查看日志
```bash
# 查看最新日志
docker-compose logs --tail=20

# 应该看到类似这样的成功日志：
# info 应用程序启动成功 {"uptime":96,"servers":3,"httpsServers":0,"proxyPool":"0/10"}
```

### 测试服务
```bash
# 测试API服务
curl http://localhost:5237/health

# 应该返回健康状态信息
```

### 检查健康状态
```bash
# 查看健康检查状态
docker inspect http-proxy-service-v2 | grep -A 5 Health

# Status应该显示为 "healthy"
```

## 📋 常见问题

### Q1: 权限修复后仍然重启
**A:** 检查SELinux状态，如果启用需要设置正确的上下文：
```bash
# 检查SELinux状态
sestatus

# 如果启用，设置正确的上下文
sudo setsebool -P container_manage_cgroup on
sudo chcon -Rt svirt_sandbox_file_t logs/ backups/
```

### Q2: 端口冲突
**A:** 修改端口映射：
```yaml
ports:
  - "8237:5237"  # 改为其他端口
  - "8238:5238"
  - "8239:5239"
```

### Q3: 内存不足
**A:** 降低资源限制：
```yaml
deploy:
  resources:
    limits:
      memory: 256M  # 降低内存限制
```

### Q4: 代理获取失败（429错误）
**A:** 这是正常现象，表示代理源限制了请求频率。可以：
- 增加刷新间隔：`REFRESH_INTERVAL=600000` (10分钟)
- 减少代理池大小：`MAX_POOL_SIZE=5`

## 🎯 预防措施

### 部署前检查清单
- [ ] 确保Docker和Docker Compose已正确安装
- [ ] 检查端口是否被占用：`netstat -tlnp | grep :5237`
- [ ] 确保有足够的磁盘空间：`df -h`
- [ ] 检查内存使用情况：`free -h`
- [ ] 预创建目录并设置权限：`mkdir -p logs backups && chmod 755 logs backups`

### 监控建议
```bash
# 定期检查容器状态
docker-compose ps

# 监控资源使用
docker stats http-proxy-service-v2

# 查看日志文件大小
du -sh logs/
```

## 📞 获取帮助

如果问题仍然存在，请提供以下信息：

1. **系统信息**
   ```bash
   uname -a
   docker --version
   docker-compose --version
   ```

2. **详细日志**
   ```bash
   docker-compose logs --tail=100 > debug.log
   ```

3. **容器状态**
   ```bash
   docker-compose ps
   docker inspect http-proxy-service-v2
   ```

4. **目录权限**
   ```bash
   ls -la logs/ backups/
   ```

将这些信息一起提供，可以更快地定位和解决问题。