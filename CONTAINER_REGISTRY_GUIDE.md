# GitHub Container Registry 使用指南

## 什么是 GitHub Container Registry？

GitHub Container Registry (ghcr.io) 是 GitHub 提供的容器镜像托管服务，具有以下优势：

1. **与代码仓库集成**：镜像和代码在同一平台管理
2. **自动构建**：通过 GitHub Actions 自动构建和发布
3. **免费额度**：公开镜像完全免费，无限存储和带宽
4. **全球 CDN**：GitHub 的全球网络确保快速下载
5. **权限管理**：与 GitHub 仓库权限一致

## 工作流程

```
代码推送 → GitHub Actions 自动构建 → 发布到 ghcr.io → 用户拉取使用
```

## 镜像地址格式

```
ghcr.io/[GitHub用户名]/[仓库名]:[标签]
```

例如：
- `ghcr.io/tanglei/http-proxy-service:latest`
- `ghcr.io/tanglei/http-proxy-service:v1.0.0`

## 使用步骤

### 1. 对于镜像发布者（您）

1. 将代码推送到 GitHub
2. GitHub Actions 自动构建并发布镜像
3. 在仓库的 "Packages" 部分查看已发布的镜像

### 2. 对于镜像使用者

无需 GitHub 账号，直接使用 Docker 命令：

```bash
# 方式一：直接运行
docker run -d \
  --name http-proxy-service \
  -p 5237:5237 \
  -p 5238:5238 \
  -e UPSTREAM_PROXY_URL="your_proxy_url" \
  -e PROXY_USERNAME="your_username" \
  -e PROXY_PASSWORD="your_password" \
  ghcr.io/YOUR-GITHUB-USERNAME/http-proxy-service:latest

# 方式二：使用 docker-compose
# 1. 下载配置文件
wget https://raw.githubusercontent.com/YOUR-GITHUB-USERNAME/http-proxy-service/main/docker-compose-standalone.yml

# 2. 修改环境变量
vim docker-compose-standalone.yml

# 3. 启动服务
docker-compose -f docker-compose-standalone.yml up -d
```

## 镜像更新

当您推送新代码时：
1. GitHub Actions 自动构建新镜像
2. 用户执行 `docker pull` 获取最新版本
3. 重启容器使用新版本

## 查看镜像信息

镜像发布后，可以在以下位置查看：
1. GitHub 仓库页面右侧的 "Packages" 部分
2. 直接访问：`https://github.com/YOUR-USERNAME/http-proxy-service/pkgs/container/http-proxy-service`

## 故障排除

### 如果镜像拉取失败

1. 检查镜像地址是否正确
2. 确认 GitHub Actions 构建成功
3. 尝试使用代理或镜像加速器

### 如果需要使用特定版本

```bash
# 查看所有可用标签
docker pull ghcr.io/YOUR-USERNAME/http-proxy-service:main
docker pull ghcr.io/YOUR-USERNAME/http-proxy-service:v1.0.0
```

## 总结

GitHub Container Registry 提供了一个完整的容器镜像解决方案：
- ✅ 免费托管公开镜像
- ✅ 自动化构建和发布
- ✅ 全球可访问
- ✅ 与源代码紧密集成
- ✅ 用户使用简单方便

这正是您需要的"用户只需一个 docker-compose 文件就能部署"的解决方案！