// 语音识别封装：默认浏览器内置 Web Speech API，预留云端 ASR 配置入口
export function createRecognizer({ lang = 'zh-CN', onResult, onError, onEnd } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    return { supported: false, start() {}, stop() {} };
  }
  const rec = new SR();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e) => {
    let interim = '';
    let finalText = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onResult && onResult(finalText, interim);
  };
  rec.onerror = (e) => onError && onError(e.error);
  rec.onend = () => onEnd && onEnd();

  return {
    supported: true,
    start() { try { rec.start(); } catch (_) {} },
    stop() { try { rec.stop(); } catch (_) {} },
  };
}

// 云端 ASR 调用接口（预留）：后续可接入 Whisper / 讯飞流式等服务
export async function cloudASR(audioBlob, config) {
  throw new Error('云端 ASR 实时流式尚未实现，请使用浏览器内置识别，或在 config 中对接你的服务。');
}
