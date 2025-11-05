#!/bin/bash

# Git 前端界面启动脚本

echo "🚀 Starting Git Frontend UI..."
echo ""

# 检查 Node.js 是否已安装
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# 检查是否在 Git 仓库中
if [ ! -d .git ]; then
    echo "⚠️  Warning: Current directory is not a Git repository"
    echo "The UI will still work, but some features may not function properly"
    echo ""
fi

# 检查依赖是否已安装
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# 启动服务器
echo "🌐 Starting server..."
echo "📁 Git repository: $(pwd)"
echo ""
echo "👉 Open http://localhost:3000 in your browser"
echo ""

npm start
