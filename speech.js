/**
 * 本机 Whisper 接入点
 *
 * 录音会发送到本机 server.py，由 whisper.cpp 完成英文转写，
 * 并根据 Whisper 的时间戳计算流利度参考。
 *
 * payload = {
 *   blob: Blob,              // 录音音频
 *   mime: string,
 *   durationMs: number,
 *   set: object,             // 当前话题整包（题干、cue、Part3、参考答案）
 *   question: string,        // 当前主要题干
 *   answerDraft: string,     // 用户正在迭代的文字稿
 *   part: 1 | 2
 * }
 *
 * 约定返回：
 * {
 *   provider?: string,
 *   overall?: number | null,          // 综合 0–9
 *   dimensions?: {
 *     fluency?: number | null,
 *     lexical?: number | null,
 *     grammar?: number | null,
 *     pronunciation?: number | null
 *   },
 *   comments?: string[],
 *   transcript?: string
 * }
 */
window.OralStudio = window.OralStudio || {};

window.OralStudio.scoreSpeech = window.OralStudio.scoreSpeech || async function scoreSpeechLocal(payload) {
  const endpoint = window.location.protocol === "file:"
    ? "http://127.0.0.1:8765/api/transcribe"
    : "/api/transcribe";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": payload.mime || "application/octet-stream",
        "X-Audio-Duration-Ms": String(payload.durationMs || 0)
      },
      body: payload.blob,
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `本地 Whisper 服务返回 ${response.status}`);
    }
    return result;
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("Whisper 转写超时，请缩短录音后重试");
    }
    if (err instanceof TypeError) {
      throw new Error("未连接本地 Whisper 服务，请通过 server.py 打开练习台");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
};
