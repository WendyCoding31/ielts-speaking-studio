# 贡献指南

感谢你帮助改进口语练习台。

## 报告问题

请在 Issue 中说明：

- 操作系统和浏览器版本
- 你采用的启动方式（直接打开 `index.html` 或运行 `server.py`）
- 可以重现问题的最少步骤
- 预期结果和实际结果

请勿上传包含个人答案、姓名、声音或其他隐私信息的截图、JSON 备份和录音。

## 提交代码前

```bash
node --check app.js
node --check groups.js
node --check data.js
python3 -m py_compile server.py
```

请保持项目的「本地优先」原则：基础功能不应强制使用者注册云端账号，也不应默认上传个人答案或录音。
