@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 即将允许同一局域网内的设备访问手机复习页。
echo 请只在可信的家庭或个人网络中使用。

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py --share-lan
  goto finished
)

where python >nul 2>nul
if %errorlevel%==0 (
  python server.py --share-lan
  goto finished
)

echo 未找到 Python 3。
echo 请先从 https://www.python.org/downloads/ 安装，安装时勾选 "Add Python to PATH"。

:finished
echo.
echo 口语练习台已停止。
pause
