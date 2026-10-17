# 口语练习台 · IELTS Speaking Studio

一款面向雅思口语备考者的本地工作台。它把当季题库、参考答案、计时开口、录音回放、间隔复习和数据备份放在一个本地网页里。

> 适合不懂编程的使用者：下载后不需注册账号，不需配置数据库，基础功能可直接打开使用。你的答案和录音默认只保存在当前浏览器。

## 内置内容

- 2026 年 9–12 月雅思口语示例题库
- 37 组 Part 1，共 156 道短问
- 47 组 Part 2 & 3，共 47 道 Cue Card 和 220 道 Part 3 问题
- 每道题的默认参考答案
- 18 个素材分组，方便识别可复用和应单独准备的题目

仓库不包含任何使用者修改后的真实答案、录音、练习记录或备份文件。

## 你可以做什么

- 按 Part、新旧题、关键词和到期状态筛选题库
- 在练习台查看题面和参考答案，编辑并保存多个答案版本
- 使用 1 分钟准备 / 2 分钟陈述计时器
- 在浏览器内录音、回放和下载 MP3 / WAV
- 按「生疏 / 磕绊 / 顺畅 / 很稳」生成后续复习日程
- 导出 / 导入 JSON 备份，或导出手机离线复习页
- 可选接入本机 `whisper.cpp` 做英文转写和流利度趋势参考

## 最简单的使用方法（不安装任何东西）

1. 点击 GitHub 页面右上方绿色的 **Code** 按钮。
2. 点击 **Download ZIP**。
3. 下载完成后，双击 ZIP 解压。
4. 打开解压后的文件夹，双击 `index.html`。
5. 建议使用 Chrome、Edge 或 Safari。

这种方式可使用题库、答案、复习记录和备份等基础功能。如果浏览器限制本地文件的麦克风权限，请改用下面的「推荐启动方式」。

## 推荐启动方式（双击启动）

这种方式会启动一个只在你电脑上运行的小型服务，然后自动打开浏览器。需要先安装 [Python 3](https://www.python.org/downloads/)，其他依赖都不需要安装。

### macOS

1. 双击 `start-macos.command`。
2. 如果系统提示无法打开：右键点击该文件 → **打开** → 再次选择 **打开**。
3. 终端窗口需保持打开；用完后回到终端按 `Control + C` 即可停止。

### Windows

1. 双击 `start-windows.bat`。
2. 如果 Windows 弹出防火墙询问，仅本机使用时可以点「取消」，不影响使用。
3. 命令窗口需保持打开；用完后直接关闭即可。

### Linux

在项目目录中运行：

```bash
./start-linux.sh
```

启动后的默认地址是 <http://127.0.0.1:8765>。

## 日常练习流程

1. 在「题库墙」选一道题。
2. 先不看参考答案，直接计时开口。
3. 录音回放，找出停顿、重复和卡顿位置。
4. 把默认答案加载到编辑区，修改成适合自己的表达，并保存为新版本。
5. 根据实际表现选择「生疏 / 磕绊 / 顺畅 / 很稳」。
6. 后续只需在「今日口述台」复习到期题目。

## 数据保存和隐私

| 数据 | 保存位置 | 会上传吗 |
| --- | --- | --- |
| 修改后的答案、练习次数、复习日期 | 当前浏览器 `localStorage` | 不会 |
| 录音历史 | 当前浏览器 `IndexedDB` | 不会 |
| 导出的 JSON / HTML / MP3 / WAV | 你选择的本机下载位置 | 不会 |
| 可选 Whisper 转写 | 本机 `whisper.cpp` | 不会 |

请注意：

- 清理浏览器网站数据可能同时清除答案和录音，请定期在「设置与数据」中导出 JSON 备份。
- JSON 备份和手机复习页可能包含你的真实答案，不要上传到公开 GitHub 仓库。
- 这是本地学习工具，不会自动为你创建云端账号或同步数据。

## 在手机上复习

### 方法 A：导出离线 HTML（最省心）

1. 在「设置与数据」中点击「导出手机复习页」。
2. 把下载的 HTML 文件通过 AirDrop、微信文件、邮件或网盘发到手机。
3. 用手机浏览器打开，不需保持电脑开机。

### 方法 B：同一 Wi-Fi 实时查看

1. 保证电脑和手机连接同一 Wi-Fi。
2. macOS 双击 `start-lan-macos.command`，Windows 双击 `start-lan-windows.bat`。也可以在项目目录运行：

   ```bash
   python3 server.py --share-lan
   ```

   Windows 也可以运行 `py -3 server.py --share-lan`。

3. 在电脑端「设置与数据」点击「同步到手机」。
4. 查看电脑的局域网 IP，然后在手机访问 `http://电脑IP:8765/mobile`。

局域网模式只建议在可信的家庭或个人网络中使用。手机同步内容只保存在当前 Python 进程的内存中，关闭服务后即消失。

## 可选：本地 Whisper 转写与流利度参考

不配置 Whisper 也不影响题库、答案、计时、录音回放和复习日程。

如果你已经安装 `ffmpeg`、`whisper.cpp` 的 `whisper-cli` 和英文模型，可以在启动前设置：

```bash
export WHISPER_BIN=/path/to/whisper-cli
export FFMPEG_BIN=/path/to/ffmpeg
export WHISPER_MODEL=/path/to/ggml-small.en.bin
python3 server.py
```

评分仅基于本地 Whisper 转写、语速、长停顿和填充词，用于比较自己的练习趋势。它不是官方雅思评分，也不代表发音、词汇或语法分数。

## 常见问题

### 双击启动脚本后一闪而过

通常是未安装 Python 3。请先从 [python.org](https://www.python.org/downloads/) 安装，然后重新双击启动脚本。

### 页面打不开，提示端口被占用

先关闭之前打开的启动窗口。如果仍有冲突，运行：

```bash
python3 server.py --port 8766
```

然后打开 <http://127.0.0.1:8766>。

### 换了浏览器后看不到以前的答案

每个浏览器的本地数据相互独立。请在旧浏览器中导出 JSON，然后在新浏览器中导入。

### 录音不工作

请确认浏览器已获得麦克风权限，并优先通过 `http://127.0.0.1:8765` 打开，而不是直接双击 `index.html`。

## 开发者说明

项目没有 npm 或 Python 第三方依赖。核心是原生 HTML / CSS / JavaScript，本地服务使用 Python 标准库。

```bash
# 语法检查
node --check app.js
node --check groups.js
node --check data.js
node scripts/validate-data.js
python3 -m py_compile server.py

# 启动（不自动打开浏览器）
python3 server.py --no-browser
```

文件职责：

- `data.js`：2026 年 9–12 月示例题库和默认答案
- `groups.js`：题库素材分组
- `app.js`：界面、本地数据、复习算法和录音逻辑
- `server.py`：本地服务、手机页和可选 Whisper 接口
- `speech.js`：语音评分请求封装

## 开源与内容声明

- 原创应用代码使用 [MIT License](LICENSE)。
- `lame.min.js` 来自 `lamejs` 项目，遵循 LGPL-3.0，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 题库、参考答案、商标和其他内容素材不当然随应用代码一起授予 MIT 许可，详见 [CONTENT_NOTICE.md](CONTENT_NOTICE.md)。
- 本项目是非官方独立学习工具，与 IELTS 官方机构无隶属或合作关系。相关商标归其权利人所有。

## 参与贡献

欢迎提交 Issue 报告问题或建议。提交截图、JSON 备份或录音前，请先删除其中的个人答案和隐私信息。
