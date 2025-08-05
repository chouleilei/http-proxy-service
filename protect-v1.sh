#!/bin/bash

# 保护现有v1.0版本的脚本
# 在推送v2.0之前运行此脚本

echo "🛡️ 保护现有的v1.0版本..."

# 拉取现有的latest镜像
echo "📥 拉取现有的latest镜像..."
docker pull ghcr.io/chouleilei/http-proxy-service:latest

# 为现有latest创建v1.0标签
echo "🏷️ 创建v1.0标签..."
docker tag ghcr.io/chouleilei/http-proxy-service:latest ghcr.io/chouleilei/http-proxy-service:v1.0

# 创建slim别名
echo "🏷️ 创建slim标签..."
docker tag ghcr.io/chouleilei/http-proxy-service:latest ghcr.io/chouleilei/http-proxy-service:slim

# 推送v1.0标签
echo "📤 推送v1.0标签..."
docker push ghcr.io/chouleilei/http-proxy-service:v1.0

# 推送slim标签
echo "📤 推送slim标签..."
docker push ghcr.io/chouleilei/http-proxy-service:slim

echo "✅ v1.0版本保护完成！"
echo ""
echo "现在可以安全地推送v2.0版本，它将成为新的latest"
echo "用户仍然可以通过以下标签访问v1.0版本："
echo "  - ghcr.io/chouleilei/http-proxy-service:v1.0"
echo "  - ghcr.io/chouleilei/http-proxy-service:slim"