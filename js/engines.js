// 翻译引擎适配器：统一入口 translate(text, engine, srcLang, tgtLang)
import { md5, sha256Hex, b64encodeUtf8, hmacSha1Base64 } from './crypto.js';

export const ENGINE_TYPES = {
  openai: 'OpenAI 兼容 (ChatGPT / DeepSeek / Kimi / 本地 Ollama / Gemini)',
  google: 'Google 翻译 (免费端点，无需 Key)',
  deepl: 'DeepL',
  baidu: '百度翻译',
  youdao: '有道智云',
  xunfei: '讯飞开放平台 (机器翻译 WebAPI)',
  local: '本地离线翻译 (浏览器内，免 Key、可离线)',
};

// 各引擎语言代码映射（界面用 zh-CN / en-US）
const LANG = {
  'zh-CN': { openai: 'zh', google: 'zh-CN', deepl: 'ZH', baidu: 'zh', youdao: 'zh-CHS', xunfei: 'cn' },
  'en-US': { openai: 'en', google: 'en', deepl: 'EN', baidu: 'en', youdao: 'en', xunfei: 'en' },
};
function lc(type, lang) {
  return (LANG[lang] && LANG[lang][type]) || lang;
}
const LANG_NAME = { 'zh-CN': '中文', 'en-US': '英文' };

// ---------- 各引擎实现 ----------
const IMPL = {
  async openai(text, e, srcLang, tgtLang) {
    const base = (e.baseUrl || '').replace(/\/$/, '');
    const url = base + '/chat/completions';
    const sys = `你是一名专业翻译。请将用户输入从${LANG_NAME[srcLang]}翻译成${LANG_NAME[tgtLang]}，只输出译文本身，不要解释、不要引号包裹。`;
    const body = {
      model: e.model || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: text },
      ],
    };
    const headers = { 'Content-Type': 'application/json' };
    if (e.apiKey) headers['Authorization'] = 'Bearer ' + e.apiKey;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('HTTP ' + res.status + '：' + (await res.text()).slice(0, 200));
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  },

  async google(text, e, srcLang, tgtLang) {
    const sl = lc('google', srcLang), tl = lc('google', tgtLang);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return (data[0] || []).map((x) => x[0]).join('');
  },

  async deepl(text, e, srcLang, tgtLang) {
    const sl = lc('deepl', srcLang), tl = lc('deepl', tgtLang);
    const base = (e.baseUrl || 'https://api-free.deepl.com').replace(/\/$/, '');
    const url = base + '/v2/translate';
    const body = new URLSearchParams({ auth_key: e.apiKey, text, source_lang: sl, target_lang: tl });
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) throw new Error('HTTP ' + res.status + '：' + (await res.text()).slice(0, 200));
    const data = await res.json();
    return data.translations?.[0]?.text || '';
  },

  async baidu(text, e, srcLang, tgtLang) {
    const appid = e.appId, key = e.apiKey;
    if (!appid || !key) throw new Error('百度翻译需要 appId 与 apiKey');
    const salt = String(Date.now());
    const sign = md5(appid + text + salt + key);
    const body = new URLSearchParams({
      q: text, from: lc('baidu', srcLang), to: lc('baidu', tgtLang), appid, salt, sign,
    });
    const res = await fetch('https://fanyi-api.baidu.com/api/trans/vip/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const data = await res.json();
    if (data.error_code) throw new Error('百度错误 ' + data.error_code + '：' + data.error_msg);
    return data.trans_result?.[0]?.dst || '';
  },

  async youdao(text, e, srcLang, tgtLang) {
    const appKey = e.appId, key = e.apiKey;
    if (!appKey || !key) throw new Error('有道智云需要 appKey 与 apiKey');
    const salt = String(Date.now());
    const curtime = String(Math.floor(Date.now() / 1000));
    const sign = await sha256Hex(appKey + truncate(text) + salt + curtime + key);
    const body = new URLSearchParams({
      q: text, from: lc('youdao', srcLang), to: lc('youdao', tgtLang), appKey, salt, sign, curtime,
    });
    const res = await fetch('https://openapi.youdao.com/api', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const data = await res.json();
    if (data.errorCode && data.errorCode !== '0') throw new Error('有道错误码 ' + data.errorCode);
    return (data.translation || []).join('\n');
  },

  async xunfei(text, e, srcLang, tgtLang) {
    const appId = e.appId, apiKey = e.apiKey, apiSecret = e.apiSecret;
    if (!appId || !apiKey || !apiSecret) throw new Error('讯飞需要 appId / apiKey / apiSecret');
    const url = e.baseUrl || 'https://itrans.xfyun.cn/v2/translate';
    const host = new URL(url).host;
    const date = new Date().toUTCString();
    const requestLine = 'POST /v2/translate HTTP/1.1';
    const signature = await hmacSha1Base64(apiSecret, `host: ${host}\ndate: ${date}\n${requestLine}`);
    const auth = `api_key="${appId}", algorithm="hmac-sha1", headers="host date request-line", signature="${signature}"`;
    const payload = {
      common: { app_id: appId },
      business: { from: lc('xunfei', srcLang), to: lc('xunfei', tgtLang) },
      data: { text: b64encodeUtf8(text) },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: host, Date: date, Authorization: auth },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.header?.code !== 0) throw new Error('讯飞错误 ' + (data.header?.code) + '：' + (data.header?.message || ''));
    return b64decodeSafe(data.payload?.result?.text);
  },
};

// ---------- 本地离线翻译（Transformers.js + Opus-MT，浏览器内运行）----------
let _tf = null;
let _localModel = null;
let _localProgress = null;
const LOCAL_MODELS = { 'en-US': 'Xenova/opus-mt-en-zh', 'zh-CN': 'Xenova/opus-mt-zh-en' };

export function setLocalProgressHandler(fn) { _localProgress = fn; }

async function loadTransformers() {
  if (_tf) return _tf;
  const urls = [
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3',
    'https://esm.run/@huggingface/transformers@3',
    'https://unpkg.com/@huggingface/transformers@3',
  ];
  for (const u of urls) {
    try { _tf = await import(u); break; } catch (e) { /* try next */ }
  }
  if (!_tf) throw new Error('本地翻译库加载失败（请保持联网，或挂 VPN 后重试一次）');
  try { _tf.env.allowRemoteModels = true; _tf.env.allowLocalModels = false; _tf.env.remoteHost = 'https://hf-mirror.com'; } catch (_) {}
  return _tf;
}

async function getLocalTranslator(srcLang) {
  const tf = await loadTransformers();
  const modelId = LOCAL_MODELS[srcLang] || LOCAL_MODELS['en-US'];
  if (_localModel && _localModel.modelId === modelId) return _localModel.translator;
  if (_localProgress) _localProgress({ status: 'init', text: '正在准备本地翻译模型…' });
  const translator = await tf.pipeline('translation', modelId, {
    device: 'wasm',
    progress_callback: (p) => { if (_localProgress) _localProgress(p); },
  });
  _localModel = { modelId, translator };
  if (_localProgress) _localProgress({ status: 'done', text: '本地模型就绪' });
  return translator;
}

IMPL.local = async function (text, e, srcLang, tgtLang) {
  const translator = await getLocalTranslator(srcLang);
  const out = await translator(text, { max_new_tokens: 256 });
  return (out && out[0] && out[0].translation_text) || '';
};

function truncate(q) {
  const len = [...q].length;
  return len <= 20 ? q : q.slice(0, 10) + len + q.slice(-10);
}
function b64decodeSafe(b64) {
  try { return decodeURIComponent(escape(atob(b64))); } catch { return atob(b64); }
}

// 统一入口
export async function translate(text, engine, srcLang, tgtLang) {
  const fn = IMPL[engine.type];
  if (!fn) throw new Error('不支持的引擎类型：' + engine.type);
  return fn(text, engine, srcLang, tgtLang);
}

// 引擎预设模板
export function preset(type) {
  const map = {
    openai: { type, name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: '' },
    google: { type, name: 'Google 翻译', baseUrl: '', apiKey: '' },
    deepl: { type, name: 'DeepL', baseUrl: 'https://api-free.deepl.com', apiKey: '' },
    baidu: { type, name: '百度翻译', appId: '', apiKey: '' },
    youdao: { type, name: '有道智云', appId: '', apiKey: '' },
    xunfei: { type, name: '讯飞翻译', appId: '', apiKey: '', apiSecret: '' },
    local: { type, name: '本地离线翻译' },
  };
  return { id: '', ...map[type] };
}
