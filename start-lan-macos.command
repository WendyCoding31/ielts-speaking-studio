#!/bin/bash

cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "未找到 Python 3。"
  echo "请先从 https://www.python.org/downloads/ 安装，然后重新双击本文件。"
  read -r -p "按回车键关闭窗口…"
  exit 1
fi

echo "即将允许同一局域网内的设备访问手机复习页。"
echo "请只在可信的家庭或个人网络中使用。"
python3 server.py --share-lan
status=$?
echo
echo "口语练习台已停止（状态码：$status）。"
read -r -p "按回车键关闭窗口…"
exit "$status"
