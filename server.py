#!/usr/bin/env python3
"""Serve the IELTS studio and optionally run local whisper.cpp transcription."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import wave
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
MOBILE_DATA = {"updated": None, "sets": []}
MAX_AUDIO_BYTES = 50 * 1024 * 1024
MAX_MOBILE_SYNC_BYTES = 5 * 1024 * 1024
WHISPER_BIN = os.environ.get("WHISPER_BIN") or shutil.which("whisper-cli") or ""
FFMPEG_BIN = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg") or ""
WHISPER_MODEL = Path(
    os.environ.get(
        "WHISPER_MODEL",
        str(Path.home() / ".cache/hyperframes/whisper/models/ggml-small.en.bin"),
    )
).expanduser()


def audio_duration_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / max(1, audio.getframerate())


def pace_score(words_per_minute: float) -> float:
    if 115 <= words_per_minute <= 180:
        return 8.5
    if 100 <= words_per_minute < 115 or 180 < words_per_minute <= 195:
        return 7.5
    if 85 <= words_per_minute < 100 or 195 < words_per_minute <= 215:
        return 6.5
    if 70 <= words_per_minute < 85 or 215 < words_per_minute <= 235:
        return 5.5
    return 4.5


def half_step(value: float) -> float:
    return round(value * 2) / 2


def analyze_fluency(whisper_result: dict, duration_seconds: float) -> tuple[float | None, dict, list[str]]:
    segments = whisper_result.get("transcription") or []
    transcript = " ".join(str(item.get("text") or "").strip() for item in segments).strip()
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", transcript)
    tokens = []
    for segment in segments:
        for token in segment.get("tokens") or []:
            text = str(token.get("text") or "")
            offsets = token.get("offsets") or {}
            if re.search(r"[A-Za-z]", text) and not text.startswith("["):
                tokens.append((int(offsets.get("from") or 0), int(offsets.get("to") or 0)))

    pauses = []
    for previous, current in zip(tokens, tokens[1:]):
        gap_ms = current[0] - previous[1]
        if gap_ms >= 800:
            pauses.append(gap_ms)

    fillers = len(re.findall(r"\b(?:um+|uh+|erm+|er+)\b", transcript, flags=re.IGNORECASE))
    minutes = max(duration_seconds / 60, 1 / 60)
    wpm = len(words) / minutes
    pause_rate = len(pauses) / minutes
    filler_rate = fillers / minutes
    metrics = {
        "durationSeconds": round(duration_seconds, 1),
        "wordCount": len(words),
        "wordsPerMinute": round(wpm),
        "longPauses": len(pauses),
        "fillers": fillers,
    }

    if duration_seconds < 3 or len(words) < 5:
        return None, metrics, [
            "录音内容太短，暂不计算流利度参考分。",
            f"Whisper 识别到 {len(words)} 个英文单词。",
        ]

    score = pace_score(wpm)
    score -= min(2.5, max(0, pause_rate - 3) * 0.16)
    score -= min(1.5, max(0, filler_rate - 2) * 0.12)
    score = half_step(max(1.0, min(9.0, score)))
    comments = [
        f"语速约 {round(wpm)} 词/分钟，检测到 {len(pauses)} 次超过 0.8 秒的停顿。",
        f"检测到 {fillers} 个填充词。" if fillers else "没有检测到明显的 um / uh / erm 填充词。",
        "流利度是基于 Whisper 转写、语速和停顿的练习参考，不是官方雅思评分。",
    ]
    return score, metrics, comments


def run_whisper(raw_audio: bytes, mime_type: str) -> dict:
    if not WHISPER_BIN or not Path(WHISPER_BIN).exists():
        raise RuntimeError("没有找到 whisper-cli")
    if not FFMPEG_BIN or not Path(FFMPEG_BIN).exists():
        raise RuntimeError("没有找到 ffmpeg")
    if not WHISPER_MODEL.exists():
        raise RuntimeError(f"没有找到 Whisper 模型：{WHISPER_MODEL}")

    suffixes = {
        "audio/webm": ".webm",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
    }
    suffix = suffixes.get(mime_type.split(";", 1)[0].lower(), ".audio")
    with tempfile.TemporaryDirectory(prefix="ielts-whisper-") as temp_name:
        temp_dir = Path(temp_name)
        source_path = temp_dir / f"source{suffix}"
        wav_path = temp_dir / "recording.wav"
        output_path = temp_dir / "result"
        source_path.write_bytes(raw_audio)

        conversion = subprocess.run(
            [FFMPEG_BIN, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source_path), "-ar", "16000", "-ac", "1", str(wav_path)],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if conversion.returncode != 0:
            detail = (conversion.stderr or conversion.stdout or "未知格式错误").strip().splitlines()[-1]
            raise RuntimeError(f"无法读取这段录音：{detail}")

        inference = subprocess.run(
            [WHISPER_BIN, "-m", str(WHISPER_MODEL), "-f", str(wav_path), "-l", "en", "-ojf", "-of", str(output_path), "-np"],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        if inference.returncode != 0:
            detail = (inference.stderr or inference.stdout or "Whisper 推理失败").strip().splitlines()[-1]
            raise RuntimeError(detail)

        result_file = output_path.with_suffix(".json")
        whisper_result = json.loads(result_file.read_text(encoding="utf-8"))
        duration = audio_duration_seconds(wav_path)
        fluency, metrics, comments = analyze_fluency(whisper_result, duration)
        transcript = " ".join(
            str(item.get("text") or "").strip()
            for item in whisper_result.get("transcription") or []
        ).strip()
        return {
            "provider": "local-whisper.cpp",
            "overall": None,
            "dimensions": {"fluency": fluency},
            "comments": comments,
            "transcript": transcript,
            "metrics": metrics,
        }



MOBILE_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>口语复习</title>
<style>
  :root { --bg:#f4f1ec; --card:#fff; --text:#2b3340; --muted:#6b7585; --mint:#4aa89d; --line:#e6e1d8; --hl:#ffe082; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; background:var(--bg); color:var(--text); line-height:1.55; }
  .top { padding:16px 16px 10px; background:#fff; border-bottom:1px solid var(--line); position:sticky; top:0; z-index:20; }
  .top h1 { margin:0; font-size:22px; font-weight:600; }
  .top .sub { color:var(--muted); font-size:13px; margin-top:2px; }
  .search { margin:10px 16px 6px; }
  .search input { width:100%; padding:12px 14px; border:1px solid var(--line); border-radius:14px; font-size:16px; background:#fff; outline:none; }
  .search input:focus { border-color:var(--mint); }
  .list { padding:0 12px 48px; }
  .card { background:var(--card); border-radius:18px; margin:10px 0; border:1px solid var(--line); overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.03); }
  .card header { padding:14px 16px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; }
  .card .title { font-weight:600; font-size:16px; }
  .card .meta { font-size:12px; color:var(--muted); margin-top:2px; }
  .card .chev { color:var(--muted); font-size:18px; transition:transform .2s; }
  .card.open .chev { transform:rotate(90deg); }
  .card .body { display:none; padding:0 16px 16px; border-top:1px solid var(--line); }
  .card.open .body { display:block; }
  .qblock { font-size:14px; color:#444; margin:12px 0; }
  .qblock .cue { font-weight:500; margin-bottom:6px; }
  .qblock ul, .qblock ol { margin:6px 0 6px 18px; padding:0; }
  .qblock li { margin:5px 0; }
  .kicker { font-size:11px; letter-spacing:.1em; color:var(--mint); font-weight:700; margin:10px 0 6px; }
  .answer { white-space:pre-wrap; font-size:15.5px; line-height:1.75; background:#faf8f5; padding:12px 14px; border-radius:12px; border:1px solid var(--line); }
  mark { background:var(--hl); padding:1px 3px; border-radius:3px; }
  .tabs { display:flex; gap:8px; margin:8px 0; }
  .tabs button { border:1px solid var(--line); background:#fff; border-radius:999px; padding:7px 16px; font-size:13px; }
  .tabs button.on { background:var(--mint); color:#fff; border-color:var(--mint); }
  .empty, .loading { text-align:center; color:var(--muted); padding:60px 20px; font-size:15px; }
  .hint { font-size:12px; color:var(--muted); text-align:center; margin:8px 16px 0; }
</style>
</head>
<body>
<div class="top">
  <h1>口语复习</h1>
  <div class="sub" id="sub">加载中…</div>
</div>
<div class="search"><input id="q" placeholder="搜索题目" oninput="render()"></div>
<div class="hint">点击卡片展开答案 · 支持高亮</div>
<div class="list" id="list"><div class="loading">正在加载复习内容…</div></div>
<script>
let DATA = [];
async function load() {
  try {
    const r = await fetch("/api/mobile-data");
    const j = await r.json();
    DATA = j.sets || [];
    document.getElementById("sub").textContent = DATA.length
      ? `已练 ${DATA.length} 题 · ${j.updated || ""}`
      : "还没有同步数据，请在电脑上点「同步到手机」";
    render();
  } catch (e) {
    document.getElementById("list").innerHTML = '<div class="empty">加载失败，请确认电脑上的服务还在运行</div>';
  }
}
function render() {
  const q = (document.getElementById("q").value || "").trim().toLowerCase();
  const list = document.getElementById("list");
  const filtered = DATA.filter(s => !q || ((s.topicZh||"") + " " + (s.topic||"")).toLowerCase().includes(q));
  if (!filtered.length) {
    list.innerHTML = '<div class="empty">' + (DATA.length ? "没有匹配的题目" : "暂无已练题目") + '</div>';
    return;
  }
  list.innerHTML = filtered.map(s => {
    const p2 = sanitise(s.part2, ["BR", "MARK"]);
    const p3 = sanitise(s.part3, ["BR", "MARK"]);
    const p1 = sanitise(s.answer, ["BR", "MARK"]);
    const cue = sanitise(s.cueHtml, ["DIV", "UL", "OL", "LI", "STRONG", "BR", "MARK"]);
    const ans = s.part === 1
      ? `<div class="answer">${p1 || "<span style=color:#999>暂无</span>"}</div>`
      : `<div class="tabs">
           <button class="on" onclick="switchTab(this,'p2')">Part 2</button>
           <button onclick="switchTab(this,'p3')">Part 3</button>
         </div>
         <div class="answer p2">${p2 || "<span style=color:#999>暂无</span>"}</div>
         <div class="answer p3" style="display:none">${p3 || "<span style=color:#999>暂无</span>"}</div>`;
    return `<article class="card">
      <header onclick="this.parentElement.classList.toggle('open')">
        <div>
          <div class="title">${escape(s.topicZh || s.topic)}</div>
          <div class="meta">Part ${s.part} · 练过 ${s.practiceCount||0} 次${s.lastPracticed?" · "+s.lastPracticed:""}</div>
        </div>
        <div class="chev">›</div>
      </header>
      <div class="body">
        <div class="qblock">${cue}</div>
        <div class="kicker">我的答案</div>
        ${ans}
      </div>
    </article>`;
  }).join("");
}
function switchTab(btn, which) {
  const card = btn.closest(".body");
  card.querySelectorAll(".tabs button").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
  card.querySelector(".p2").style.display = which === "p2" ? "block" : "none";
  card.querySelector(".p3").style.display = which === "p3" ? "block" : "none";
}
function escape(s){ return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function sanitise(html, allowedTags) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  template.content.querySelectorAll("*").forEach(el => {
    if (!allowedTags.includes(el.tagName)) {
      el.replaceWith(...el.childNodes);
      return;
    }
    [...el.attributes].forEach(attr => el.removeAttribute(attr.name));
  });
  return template.innerHTML;
}
load();
</script>
</body>
</html>"""

class StudioHandler(SimpleHTTPRequestHandler):
    server_version = "IELTSSpeakingStudio/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        if urlparse(self.path).path.startswith("/api/"):
            origin = self.headers.get("Origin")
            port = self.server.server_address[1]
            allowed_origins = {
                "null",
                f"http://127.0.0.1:{port}",
                f"http://localhost:{port}",
            }
            if origin in allowed_origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Audio-Duration-Ms")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        origin = self.headers.get("Origin")
        port = self.server.server_address[1]
        allowed_origins = {
            "null",
            f"http://127.0.0.1:{port}",
            f"http://localhost:{port}",
        }
        if origin not in allowed_origins:
            self.send_response(HTTPStatus.FORBIDDEN)
            self.end_headers()
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            ready = bool(WHISPER_BIN and FFMPEG_BIN and WHISPER_MODEL.exists())
            self.send_json(
                HTTPStatus.OK if ready else HTTPStatus.SERVICE_UNAVAILABLE,
                {
                    "ready": ready,
                    "whisper": bool(WHISPER_BIN and Path(WHISPER_BIN).exists()),
                    "ffmpeg": bool(FFMPEG_BIN and Path(FFMPEG_BIN).exists()),
                    "model": WHISPER_MODEL.exists(),
                },
            )
            return
        if path == "/api/mobile-data":
            self.send_json(HTTPStatus.OK, MOBILE_DATA)
            return
        if path == "/mobile":
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(MOBILE_HTML.encode("utf-8"))
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/mobile-sync":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_MOBILE_SYNC_BYTES:
                    self.send_json(HTTPStatus.BAD_REQUEST, {"error": "同步数据为空或超过 5 MB"})
                    return
                body = self.rfile.read(length)
                data = json.loads(body.decode("utf-8"))
                MOBILE_DATA["updated"] = data.get("updated")
                MOBILE_DATA["sets"] = data.get("sets") or []
                self.send_json(HTTPStatus.OK, {"ok": True, "count": len(MOBILE_DATA["sets"])})
            except Exception as e:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(e)})
            return
        if path != "/api/transcribe":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "接口不存在"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_AUDIO_BYTES:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "录音为空或超过 50 MB"})
            return
        try:
            result = run_whisper(self.rfile.read(length), self.headers.get_content_type())
            self.send_json(HTTPStatus.OK, result)
        except subprocess.TimeoutExpired:
            self.send_json(HTTPStatus.GATEWAY_TIMEOUT, {"error": "Whisper 转写超时"})
        except Exception as exc:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="在本机启动雅思口语练习台")
    parser.add_argument(
        "--host",
        default=os.environ.get("IELTS_STUDIO_HOST", "127.0.0.1"),
        help="监听地址，默认仅本机可访问",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("IELTS_STUDIO_PORT", "8765")),
        help="服务端口，默认 8765",
    )
    parser.add_argument(
        "--share-lan",
        action="store_true",
        help="允许同一局域网中的手机访问 /mobile",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="启动后不自动打开浏览器",
    )
    args = parser.parse_args()
    if args.share_lan:
        args.host = "0.0.0.0"
    return args


def main() -> None:
    args = parse_args()
    try:
        server = ThreadingHTTPServer((args.host, args.port), StudioHandler)
    except OSError as exc:
        raise SystemExit(
            f"启动失败：无法使用端口 {args.port}。\n"
            f"请关闭已经运行的口语练习台，或改用 python3 server.py --port 8766。\n"
            f"系统信息：{exc}"
        ) from exc

    browser_host = "127.0.0.1" if args.host == "0.0.0.0" else args.host
    browser_url = f"http://{browser_host}:{args.port}"
    print(f"口语练习台：{browser_url}")
    if args.share_lan:
        print(
            f"局域网模式已开启：手机请访问 "
            f"http://<电脑的局域网 IP>:{args.port}/mobile"
        )
    whisper_ready = bool(WHISPER_BIN and FFMPEG_BIN and WHISPER_MODEL.exists())
    print("Whisper 本地评分：" + ("已就绪" if whisper_ready else "未配置（其他功能不受影响）"))

    if not args.no_browser:
        opener = threading.Timer(0.8, lambda: webbrowser.open(browser_url))
        opener.daemon = True
        opener.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
