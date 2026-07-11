#!/usr/bin/env bash
# 启动 LinguaDesk 本地服务器
cd "$(dirname "$0")"
PORT="${1:-8765}"
echo "LinguaDesk 已启动 → http://localhost:${PORT}"
echo "按 Ctrl+C 停止"
python3 -m http.server "$PORT"
