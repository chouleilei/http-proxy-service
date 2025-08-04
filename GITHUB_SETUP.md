# GitHub 仓库设置指南

## 1. 创建 GitHub 仓库

1. 登录 GitHub (https://github.com)
2. 点击右上角的 "+" 按钮，选择 "New repository"
3. 设置仓库信息：
   - Repository name: `http-proxy-service`
   - Description: `HTTP proxy service with Docker support`
   - 选择 "Public" (公开仓库)
   - 不要勾选 "Initialize this repository with a README"
   - 点击 "Create repository"

## 2. 推送代码到 GitHub

在创建仓库后，GitHub 会显示推送命令。在本地执行：

```bash
# 添加远程仓库（将 YOUR-USERNAME 替换为您的 GitHub 用户名）
git remote add origin https://github.com/YOUR-USERNAME/http-proxy-service.git

# 推送代码
git branch -M main
git push -u origin main
```

## 3. 配置 GitHub Container Registry

1. 在 GitHub 仓库页面，点击 "Settings"
2. 在左侧菜单找到 "Actions" -> "General"
3. 在 "Workflow permissions" 部分，选择 "Read and write permissions"
4. 点击 "Save"

## 4. 触发自动构建

推送代码后，GitHub Actions 会自动开始构建 Docker 镜像：

1. 点击仓库页面的 "Actions" 标签
2. 您会看到 "Docker Build and Publish" 工作流正在运行
3. 等待构建完成（通常需要几分钟）

## 5. 使用发布的镜像

构建成功后，镜像会发布到：
```
ghcr.io/YOUR-USERNAME/http-proxy-service:latest
```

## 6. 更新文档中的用户名

请更新以下文件中的 `YOUR-USERNAME` 为您的实际 GitHub 用户名：

1. `README.md`
2. `docker-compose-standalone.yml`
3. `docker/README-docker.md`

可以使用以下命令批量替换：
```bash
# macOS/Linux
find . -type f -name "*.md" -o -name "*.yml" | xargs sed -i '' 's/YOUR-USERNAME/your-actual-username/g'

# 或手动编辑文件
```

## 7. 提交更新

```bash
git add .
git commit -m "Update GitHub username in documentation"
git push
```

## 完成！

现在其他用户可以通过以下方式使用您的服务：

```bash
# 下载 docker-compose 文件
wget https://raw.githubusercontent.com/YOUR-USERNAME/http-proxy-service/main/docker-compose-standalone.yml

# 修改环境变量后运行
docker-compose -f docker-compose-standalone.yml up -d