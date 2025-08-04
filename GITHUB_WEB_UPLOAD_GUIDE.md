# GitHub 网页上传操作指南

## 步骤 1：创建 GitHub 仓库

1. 打开浏览器，访问 https://github.com
2. 登录您的 GitHub 账号
3. 点击右上角的 **"+"** 按钮，选择 **"New repository"**
4. 填写仓库信息：
   - **Repository name**: `http-proxy-service`
   - **Description**: `HTTP proxy service with Docker support`
   - **选择 Public**（公开仓库）
   - ⚠️ **不要勾选** "Add a README file"
   - ⚠️ **不要选择** .gitignore 或 license
5. 点击 **"Create repository"**

## 步骤 2：上传文件

### 方法 A：拖拽上传（推荐）

1. 创建仓库后，您会看到一个空仓库页面
2. 找到 **"uploading an existing file"** 链接，点击它
3. 或者直接点击 **"Upload files"** 按钮
4. 打开文件管理器，找到项目文件夹
5. **选择所有文件和文件夹**（除了 node_modules 和 .git）：
   - `.github` 文件夹
   - `docker` 文件夹  
   - `public` 文件夹
   - `.gitignore`
   - `app.js`
   - `docker-compose-standalone.yml`
   - `package.json`
   - `package-lock.json`
   - `README.md`
   - 其他 .md 文件
6. **拖拽到 GitHub 网页的上传区域**
7. 等待文件上传完成（可能需要几分钟）
8. 在下方的 **"Commit changes"** 部分：
   - 输入提交信息：`Initial commit: HTTP proxy service with Docker support`
   - 点击 **"Commit changes"**

### 方法 B：ZIP 压缩包上传

如果拖拽不方便，可以：

1. 在本地压缩整个项目文件夹（排除 node_modules 和 .git）
2. 在 GitHub 仓库页面点击 **"Upload files"**
3. 上传 ZIP 文件
4. GitHub 会自动解压
5. 提交更改

## 步骤 3：检查 GitHub Actions

文件上传成功后：

1. 点击仓库页面的 **"Actions"** 标签
2. 您应该看到 **"Docker Build and Publish"** 工作流
3. 如果显示黄色圆圈，表示正在构建
4. 等待变成绿色勾号（通常需要 3-5 分钟）
5. 如果变成红色叉号，点击查看错误信息

## 步骤 4：配置仓库权限（重要！）

为了让 GitHub Actions 能够发布镜像：

1. 在仓库页面，点击 **"Settings"**（设置）
2. 在左侧菜单找到 **"Actions"** → **"General"**
3. 滚动到 **"Workflow permissions"** 部分
4. 选择 **"Read and write permissions"**
5. 勾选 **"Allow GitHub Actions to create and approve pull requests"**
6. 点击 **"Save"**

## 步骤 5：查看发布的镜像

构建成功后：

1. 回到仓库主页
2. 在右侧找到 **"Packages"** 部分
3. 点击 **"http-proxy-service"**
4. 您会看到镜像信息和拉取命令

## 步骤 6：更新文档中的用户名

在 GitHub 网页上直接编辑文件：

1. 点击 `README.md` 文件
2. 点击右上角的 ✏️ 编辑按钮
3. 将所有 `YOUR-USERNAME` 替换为您的 GitHub 用户名
4. 点击 **"Commit changes"**
5. 对以下文件重复此操作：
   - `docker-compose-standalone.yml`
   - `docker/README-docker.md`

## 完成！

现在您的 Docker 镜像已经发布到 GitHub Container Registry，其他用户可以使用了：

```bash
# 镜像地址
ghcr.io/您的用户名/http-proxy-service:latest

# 使用方式
docker run -d -p 5237:5237 -p 5238:5238 \
  -e UPSTREAM_PROXY_URL="..." \
  -e PROXY_USERNAME="..." \
  -e PROXY_PASSWORD="..." \
  ghcr.io/您的用户名/http-proxy-service:latest
```

## 常见问题

### Q: Actions 构建失败怎么办？
A: 点击失败的工作流查看详细日志，通常是权限问题，确保已按步骤 4 设置权限。

### Q: 找不到 Packages？
A: 需要等 Actions 构建成功后才会出现 Packages。

### Q: 上传文件时提示错误？
A: 确保没有上传 node_modules 文件夹，它太大了。