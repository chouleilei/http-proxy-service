# 版本策略和镜像标签管理

## 🚨 重要提醒

您之前已经有 `http-proxy-service:latest` 镜像，新的v2.0版本会覆盖现有的 `latest` 标签。

## 📋 解决方案选择

### 方案一：保持v1.0为latest，v2.0使用专门标签（推荐）

**优势**: 不影响现有用户，平滑升级路径

**修改GitHub Actions配置**:
```yaml
# 修改 .github/workflows/docker-build.yml 中的标签策略
tags: |
  type=ref,event=branch
  type=ref,event=pr
  type=semver,pattern={{version}}
  type=semver,pattern={{major}}.{{minor}}
  type=semver,pattern={{major}}
  type=raw,value=v2.0,enable={{is_default_branch}}
  type=raw,value=enterprise,enable={{is_default_branch}}
  type=raw,value=v2-latest,enable={{is_default_branch}}
  # 注意：移除了 latest 标签
```

**生成的镜像标签**:
- `ghcr.io/chouleilei/http-proxy-service:v2.0`
- `ghcr.io/chouleilei/http-proxy-service:enterprise`
- `ghcr.io/chouleilei/http-proxy-service:v2-latest`
- `ghcr.io/chouleilei/http-proxy-service:v2.0.0`

**用户使用方式**:
```bash
# v1.0用户继续使用
docker pull ghcr.io/chouleilei/http-proxy-service:latest

# v2.0用户使用新标签
docker pull ghcr.io/chouleilei/http-proxy-service:v2-latest
# 或
docker pull ghcr.io/chouleilei/http-proxy-service:enterprise
```

### 方案二：v2.0成为新的latest（升级策略）

**优势**: v2.0成为主推版本，功能更强大

**保持当前配置不变**，但需要：

1. **在README中明确说明版本变化**
2. **提供v1.0的固定标签供老用户使用**

**版本映射**:
- `latest` → v2.0企业版（新）
- `v1.0` → 原来的简化版
- `slim` → 原来的简化版别名

### 方案三：使用不同的仓库名

**创建新仓库**: `http-proxy-service-enterprise`

**优势**: 完全独立，不影响现有用户

**镜像路径**:
- 原版本: `ghcr.io/chouleilei/http-proxy-service:latest`
- 企业版: `ghcr.io/chouleilei/http-proxy-service-enterprise:latest`

## 🎯 推荐方案：方案一（保守升级）

考虑到您已有用户在使用v1.0版本，建议采用方案一：

### 立即修改的文件

1. **修改GitHub Actions配置**
2. **更新docker-compose文件中的镜像标签**
3. **更新README中的使用说明**

### 版本策略说明

```
v1.0 (slim)     ← 保持 latest 标签，现有用户不受影响
v2.0 (enterprise) ← 使用 v2-latest, enterprise 标签
```

### 用户迁移路径

```bash
# 现有v1.0用户（不变）
docker pull ghcr.io/chouleilei/http-proxy-service:latest

# 升级到v2.0的用户
docker pull ghcr.io/chouleilei/http-proxy-service:v2-latest

# 明确使用企业版的用户
docker pull ghcr.io/chouleilei/http-proxy-service:enterprise
```

## 🔄 如何实施

### 选择方案一的话，需要修改：

1. **GitHub Actions配置** - 移除latest标签
2. **docker-compose文件** - 改为v2-latest标签
3. **README文档** - 更新镜像拉取命令
4. **版本说明** - 添加版本对比和迁移指南

### 选择方案二的话：

1. **保持当前配置**
2. **添加版本变更说明**
3. **为v1.0创建固定标签**

## 💡 建议

**推荐选择方案一**，原因：
- ✅ 不破坏现有用户的使用
- ✅ 提供清晰的版本区分
- ✅ 给用户选择权
- ✅ 避免意外的功能变化

您希望采用哪个方案？我可以立即为您修改相应的配置文件。