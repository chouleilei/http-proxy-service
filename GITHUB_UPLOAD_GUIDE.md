# GitHub上传和Docker镜像构建指南

## 📋 准备工作

您现在有一个完整的 `http-proxy-service-v2-docker` 文件夹，包含以下文件：

```
http-proxy-service-v2-docker/
├── .github/
│   └── workflows/
│       └── docker-build.yml          # GitHub Actions自动构建配置
├── src/                              # 完整的源代码
│   ├── app.js                        # 主应用程序
│   ├── config/
│   ├── servers/
│   ├── services/
│   └── utils/
├── public/                           # Web管理界面
│   └── index.html
├── Dockerfile                        # Docker镜像构建文件
├── docker-compose-standalone.yml     # 用户部署文件
├── .dockerignore                     # Docker构建忽略文件
├── .env.example                      # 环境变量示例
├── package.json                      # Node.js依赖配置
├── package-lock.json                 # 依赖锁定文件
├── README.md                         # 项目说明文档
└── GITHUB_UPLOAD_GUIDE.md           # 本指南文件
```

## 🚀 上传到GitHub步骤

### 第一步：创建GitHub仓库

1. **登录GitHub**
   - 访问 https://github.com
   - 使用您的账号 `chouleilei` 登录

2. **创建新仓库**
   - 点击右上角的 "+" 按钮
   - 选择 "New repository"
   - 仓库名称：`http-proxy-service`
   - 描述：`HTTP代理服务 v2.0 - 企业级Docker版本`
   - 设置为 Public（这样GitHub Actions可以免费使用）
   - 不要初始化README（我们已经有了）
   - 点击 "Create repository"

### 第二步：保护现有v1.0版本

**重要：在推送v2.0之前，先保护现有的v1.0版本**

```bash
# 运行保护脚本
chmod +x protect-v1.sh
./protect-v1.sh
```

### 第三步：上传代码

在 `http-proxy-service-v2-docker` 文件夹中执行以下命令：

```bash
# 初始化Git仓库
git init

# 添加所有文件
git add .

# 提交代码
git commit -m "Initial commit: HTTP代理服务 v2.0 企业级Docker版本"

# 添加远程仓库
git remote add origin https://github.com/chouleilei/http-proxy-service.git

# 推送到GitHub
git push -u origin main
```

### 第四步：触发Docker镜像构建

1. **创建版本标签**
   ```bash
   # 创建v2.0.0标签
   git tag v2.0.0
   git push origin v2.0.0
   ```

2. **GitHub Actions将自动构建**
   - 推送标签后，GitHub Actions会自动触发
   - 构建过程大约需要5-10分钟
   - 支持 linux/amd64 和 linux/arm64 两种架构
   - v2.0将成为新的latest标签

### 第四步：验证构建结果

1. **检查Actions状态**
   - 访问 https://github.com/chouleilei/http-proxy-service/actions
   - 查看构建状态是否成功

2. **检查Docker镜像**
   - 访问 https://github.com/chouleilei/http-proxy-service/pkgs/container/http-proxy-service
   - 确认镜像已成功推送

## 🏷️ 生成的镜像标签

构建成功后，将生成以下Docker镜像：

- `ghcr.io/chouleilei/http-proxy-service:latest`
- `ghcr.io/chouleilei/http-proxy-service:v2.0`
- `ghcr.io/chouleilei/http-proxy-service:enterprise`
- `ghcr.io/chouleilei/http-proxy-service:v2.0.0`

## 📖 用户使用方式

### 快速启动
```bash
# 下载配置文件
wget https://raw.githubusercontent.com/chouleilei/http-proxy-service/main/docker-compose-standalone.yml
wget https://raw.githubusercontent.com/chouleilei/http-proxy-service/main/.env.example

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件设置必要参数

# 启动服务
docker-compose -f docker-compose-standalone.yml up -d
```

### 直接Docker运行
```bash
docker run -d \
  --name http-proxy-service-v2 \
  -p 5237:5237 -p 5238:5238 -p 5239:5239 \
  -e UPSTREAM_PROXY_URL="your_api_url" \
  -e PROXY1_USERNAME="username" \
  -e PROXY1_PASSWORD="password" \
  -e PROXY2_PASSWORD="password" \
  ghcr.io/chouleilei/http-proxy-service:latest
```

## 🔧 后续维护

### 更新版本
```bash
# 修改代码后
git add .
git commit -m "Update: 描述更新内容"
git push

# 发布新版本
git tag v2.0.1
git push origin v2.0.1
```

### 查看构建日志
- 访问 GitHub Actions 页面查看详细构建日志
- 如果构建失败，检查错误信息并修复

## 🎯 成功标志

当以下条件都满足时，说明上传成功：

✅ GitHub仓库创建成功  
✅ 代码推送完成  
✅ GitHub Actions构建成功  
✅ Docker镜像推送成功  
✅ 用户可以拉取和使用镜像  

## 🔗 重要链接

- **GitHub仓库**: https://github.com/chouleilei/http-proxy-service
- **Docker镜像**: https://ghcr.io/chouleilei/http-proxy-service
- **Actions页面**: https://github.com/chouleilei/http-proxy-service/actions
- **Packages页面**: https://github.com/chouleilei/http-proxy-service/pkgs/container/http-proxy-service

## 📞 技术支持

如果在上传过程中遇到问题：

1. 检查GitHub Actions构建日志
2. 确认仓库权限设置正确
3. 验证Docker文件语法
4. 检查网络连接

---

**准备就绪！** 现在您可以按照上述步骤将企业版HTTP代理服务上传到GitHub并构建Docker镜像了。