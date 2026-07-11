import {
  getAllMemory, addMemory, delMemory, getAllCorpus, addCorpus, delCorpus,
  getEngines, saveEngine, delEngine, getAsr, saveAsr, delAsr,
  getSetting, setSetting, uid,
} from './store.js';
import { ENGINE_TYPES, translate, preset, setLocalProgressHandler } from './engines.js';
import { findFuzzy } from './match.js';
import { toTMX, parseTMX, toCSV, parseCSV, download } from './tmx.js';
import { createRecognizer } from './speech.js';
import { initFile, refreshFileEngineSelect } from './file.js';

const $ = (id) => document.getElementById(id);
const LANGS = [['zh-CN', '中文'], ['en-US', '英文']];
const state = { engines: [], asr: [], memory: [], corpus: [], fuzzy: [] };
let recognizer = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function setStatus(t) { $('statusText').textContent = t; }
function toast(m) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = m;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
function openModal(html) { $('modal').innerHTML = html; $('modalMask').hidden = false; }
function closeModal() { $('modalMask').hidden = true; $('modal').innerHTML = ''; }

// ---------------- 初始化 ----------------
async function init() {
  $('modalMask').addEventListener('click', (e) => { if (e.target === $('modalMask')) closeModal(); });
  setLocalProgressHandler((p) => {
    if (!p) return;
    if (p.status === 'progress' && p.progress != null) setStatus('下载本地模型 ' + Math.round(p.progress * 100) + '%');
    else if (p.status === 'done') setStatus('本地模型就绪');
    else if (p.text) setStatus(p.text);
  });
  initTabs();
  fillLang($('srcLang')); fillLang($('tgtLang'));

  bindSettings();
  bindTranslate();
  bindMemory();
  bindCorpus();
  bindSubtitle();
  bindIO();
  initFile();

  await loadEngines();
  await loadAsr();
  await loadMemory();
  await loadCorpus();
  setStatus('就绪');
}

function initTabs() {
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    b.classList.add('active');
    $('view-' + b.dataset.view).classList.add('active');
    if (b.dataset.view === 'memory') loadMemory();
    if (b.dataset.view === 'corpus') loadCorpus();
  });
}
function fillLang(sel) {
  sel.innerHTML = LANGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
}

// ---------------- API 设置 ----------------
function bindSettings() {
  $('addEngineBtn').onclick = () => openEngineModal(null);
  $('addAsrBtn').onclick = () => openAsrModal(null);
  $('engineList').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit-engine]');
    const dl = e.target.closest('[data-del-engine]');
    if (ed) { const en = state.engines.find((x) => x.id === ed.dataset.editEngine); openEngineModal(en); }
    if (dl) { delEngine(dl.dataset.delEngine).then(loadEngines).then(() => toast('已删除')); }
  });
  $('asrList').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit-asr]');
    const dl = e.target.closest('[data-del-asr]');
    if (ed) { const a = state.asr.find((x) => x.id === ed.dataset.editAsr); openAsrModal(a); }
    if (dl) { delAsr(dl.dataset.delAsr).then(loadAsr).then(() => toast('已删除')); }
  });
}

function engineMeta(e) {
  if (e.type === 'local') return '本地 · 离线 · 无需网络';
  if (e.type === 'google') return 'Google 免费端点';
  if (e.type === 'openai') return `${esc(e.baseUrl || '')} · ${esc(e.model || '')}`;
  if (e.type === 'deepl') return esc(e.baseUrl || '');
  if (e.type === 'baidu' || e.type === 'youdao') return 'AppID: ' + esc(e.appId || '');
  if (e.type === 'xunfei') return 'AppID: ' + esc(e.appId || '');
  return e.type;
}

function renderEngines() {
  const list = $('engineList');
  if (!state.engines.length) { list.innerHTML = '<div class="empty">还没有引擎，点击「+ 添加引擎」。</div>'; return; }
  list.innerHTML = state.engines.map((e) => `
    <div class="engine-card">
      <div class="ec-main">
        <div class="ec-name">${esc(e.name)}</div>
        <div class="ec-meta">${engineMeta(e)}</div>
      </div>
      <div class="ec-actions">
        <button class="btn mini" data-edit-engine="${e.id}">编辑</button>
        <button class="btn mini danger" data-del-engine="${e.id}">删除</button>
      </div>
    </div>`).join('');
}

function openEngineModal(engine) {
  const e = engine ? { ...engine } : preset('openai');
  const isEdit = !!engine;
  const typeOpts = Object.entries(ENGINE_TYPES)
    .map(([k, v]) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${v}</option>`).join('');
  openModal(`<h3>${isEdit ? '编辑' : '添加'}翻译引擎</h3>
    <div class="form-row"><label>名称</label><input id="f_name" value="${esc(e.name || '')}"></div>
    <div class="form-row"><label>类型</label><select id="f_type">${typeOpts}</select></div>
    <div id="f_fields"></div>
    <div class="form-actions"><button class="btn" id="f_cancel">取消</button><button class="btn primary" id="f_save">保存</button></div>`);
  renderEngineFields(e);
  $('f_type').addEventListener('change', () => { e.type = $('f_type').value; renderEngineFields(e); });
  $('f_cancel').onclick = closeModal;
  $('f_save').onclick = () => saveEngineFromModal(e);
}

function renderEngineFields(e) {
  const box = $('f_fields');
  let html = '';
  if (e.type === 'local') {
    html = '<p class="hint">浏览器内本地翻译，无需 Key、可离线。首次使用会自动下载模型（约几十 MB，建议联网 / VPN 一次），之后完全离线、国内直连。</p>';
  } else if (e.type === 'google') {
    html = '<p class="hint">Google 免费端点无需任何配置即可使用（国内需 VPN）。</p>';
  } else if (e.type === 'openai' || e.type === 'deepl') {
    html = `
      <div class="form-row"><label>Base URL</label><input id="f_base" value="${esc(e.baseUrl || '')}" placeholder="https://api.deepseek.com/v1"></div>
      <div class="form-row"><label>模型名${e.type === 'openai' ? '' : '（DeepL 可留空）'}</label><input id="f_model" value="${esc(e.model || '')}" placeholder="deepseek-chat / gpt-4o-mini"></div>
      <div class="form-row"><label>API Key${e.type === 'openai' ? '' : '（DeepL 必填）'}</label><input id="f_key" type="password" value="${esc(e.apiKey || '')}"></div>`;
  } else if (e.type === 'baidu' || e.type === 'youdao') {
    html = `
      <div class="form-row"><label>App ID / App Key</label><input id="f_appid" value="${esc(e.appId || '')}"></div>
      <div class="form-row"><label>API Key / Secret</label><input id="f_key" type="password" value="${esc(e.apiKey || '')}"></div>`;
  } else if (e.type === 'xunfei') {
    html = `
      <div class="form-row"><label>Base URL</label><input id="f_base" value="${esc(e.baseUrl || '')}" placeholder="https://itrans.xfyun.cn/v2/translate"></div>
      <div class="form-row"><label>App ID</label><input id="f_appid" value="${esc(e.appId || '')}"></div>
      <div class="form-row"><label>API Key</label><input id="f_key" type="password" value="${esc(e.apiKey || '')}"></div>
      <div class="form-row"><label>API Secret</label><input id="f_secret" type="password" value="${esc(e.apiSecret || '')}"></div>`;
  }
  box.innerHTML = html;
}

async function saveEngineFromModal(e) {
  e.name = $('f_name').value.trim() || ENGINE_TYPES[e.type];
  e.type = $('f_type').value;
  if (e.type === 'google') { /* no fields */ }
  else if (e.type === 'openai' || e.type === 'deepl') {
    e.baseUrl = $('f_base').value.trim(); e.model = $('f_model') ? $('f_model').value.trim() : '';
    e.apiKey = $('f_key').value.trim();
  } else if (e.type === 'baidu' || e.type === 'youdao') {
    e.appId = $('f_appid').value.trim(); e.apiKey = $('f_key').value.trim();
  } else if (e.type === 'xunfei') {
    e.baseUrl = $('f_base').value.trim(); e.appId = $('f_appid').value.trim();
    e.apiKey = $('f_key').value.trim(); e.apiSecret = $('f_secret').value.trim();
  }
  e.id = e.id || uid();
  await saveEngine(e);
  closeModal();
  await loadEngines();
  toast('已保存：' + e.name);
}

// ---------------- ASR ----------------
function renderAsr() {
  const list = $('asrList');
  list.innerHTML = `<div class="engine-card"><div class="ec-main"><div class="ec-name">浏览器内置 (Web Speech)</div><div class="ec-meta">免费 · 无需配置 · 推荐</div></div></div>`;
  if (state.asr.length) {
    list.innerHTML += state.asr.map((a) => `
      <div class="engine-card">
        <div class="ec-main"><div class="ec-name">${esc(a.name)} <span class="ec-meta">（云端·预留）</span></div>
        <div class="ec-meta">${esc(a.baseUrl || '')}</div></div>
        <div class="ec-actions">
          <button class="btn mini" data-edit-asr="${a.id}">编辑</button>
          <button class="btn mini danger" data-del-asr="${a.id}">删除</button>
        </div>
      </div>`).join('');
  }
}
function openAsrModal(asr) {
  const a = asr ? { ...asr } : { name: '', baseUrl: '', apiKey: '' };
  openModal(`<h3>${asr ? '编辑' : '添加'}云端 ASR 引擎</h3>
    <p class="hint">配置将保留，实时字幕主路径仍用浏览器内置识别；可在后端对接 Whisper / 讯飞后启用。</p>
    <div class="form-row"><label>名称</label><input id="a_name" value="${esc(a.name)}"></div>
    <div class="form-row"><label>Endpoint</label><input id="a_base" value="${esc(a.baseUrl || '')}" placeholder="https://your-asr.example.com"></div>
    <div class="form-row"><label>API Key</label><input id="a_key" type="password" value="${esc(a.apiKey || '')}"></div>
    <div class="form-actions"><button class="btn" id="a_cancel">取消</button><button class="btn primary" id="a_save">保存</button></div>`);
  $('a_cancel').onclick = closeModal;
  $('a_save').onclick = async () => {
    a.name = $('a_name').value.trim() || '云端 ASR';
    a.baseUrl = $('a_base').value.trim(); a.apiKey = $('a_key').value.trim();
    a.id = a.id || uid();
    await saveAsr(a); closeModal(); await loadAsr(); toast('已保存');
  };
}

// ---------------- 翻译 ----------------
function bindTranslate() {
  $('doTranslate').onclick = doTranslate;
  $('srcText').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doTranslate(); }
  });
  $('swapLang').onclick = () => {
    const s = $('srcLang').value; $('srcLang').value = $('tgtLang').value; $('tgtLang').value = s;
  };
  $('copyTgt').onclick = () => { navigator.clipboard.writeText($('tgtText').value); toast('已复制'); };
  $('savePair').onclick = savePair;
  $('fuzzyHint').addEventListener('click', (e) => {
    const u = e.target.closest('[data-use]');
    if (u) { $('tgtText').value = state.fuzzy[+u.dataset.use].m.target; toast('已采用记忆库译文'); }
  });
}

async function doTranslate() {
  const text = $('srcText').value.trim();
  if (!text) { toast('请输入原文'); return; }
  const engine = state.engines.find((x) => x.id === $('translateEngine').value);
  if (!engine) { toast('请先选择/添加翻译引擎'); return; }
  const src = $('srcLang').value, tgt = $('tgtLang').value;
  setStatus('翻译中…');
  try {
    const out = await translate(text, engine, src, tgt);
    $('tgtText').value = out;
    setStatus('完成');
    showFuzzy(text);
  } catch (err) { setStatus('失败'); toast('翻译失败：' + err.message); }
}

function showFuzzy(text) {
  const hits = findFuzzy(text, state.memory, 0.6, 3);
  state.fuzzy = hits;
  const box = $('fuzzyHint');
  if (!hits.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<b>记忆库匹配：</b>' + hits.map((h, i) =>
    `<div style="margin-top:4px"><a href="#" data-use="${i}" style="color:var(--accent)">采用</a> (${Math.round(h.score * 100)}%) ${esc(h.m.target)}</div>`).join('');
}

async function savePair() {
  const source = $('srcText').value.trim(), target = $('tgtText').value.trim();
  if (!source || !target) { toast('原文译文都不能为空'); return; }
  await addMemory({ source, target, srcLang: $('srcLang').value, tgtLang: $('tgtLang').value });
  await loadMemory();
  toast('已存入记忆库');
}

// ---------------- 记忆库 ----------------
function bindMemory() {
  $('refreshMemory').onclick = loadMemory;
  $('memorySearch').addEventListener('input', loadMemory);
}
function fmtTime(ts) { return ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : ''; }

async function loadMemory() {
  state.memory = await getAllMemory();
  const q = $('memorySearch').value.trim().toLowerCase();
  const rows = q ? state.memory.filter((m) => (m.source + m.target).toLowerCase().includes(q)) : state.memory;
  const body = $('memoryBody');
  $('memoryEmpty').style.display = state.memory.length ? 'none' : 'block';
  body.innerHTML = rows.slice().sort((a, b) => b.createdAt - a.createdAt).map((m) => `
    <tr>
      <td>${esc(m.source)}</td><td>${esc(m.target)}</td>
      <td>${m.srcLang || ''}→${m.tgtLang || ''}</td><td>${fmtTime(m.createdAt)}</td>
      <td><button class="btn mini danger" data-del-mem="${m.id}">删除</button></td>
    </tr>`).join('');
  body.querySelectorAll('[data-del-mem]').forEach((b) => {
    b.onclick = () => delMemory(b.dataset.delMem).then(loadMemory).then(() => toast('已删除'));
  });
}

// ---------------- 语料库 ----------------
function bindCorpus() { $('addCorpusBtn').onclick = openCorpusModal; }
function renderCorpus() {
  const body = $('corpusBody');
  $('corpusEmpty').style.display = state.corpus.length ? 'none' : 'block';
  body.innerHTML = state.corpus.slice().sort((a, b) => b.createdAt - a.createdAt).map((c) => `
    <tr>
      <td>${esc(c.text)}</td><td>${esc(c.lang || '')}</td><td>${esc(c.tag || '')}</td>
      <td>${fmtTime(c.createdAt)}</td>
      <td><button class="btn mini danger" data-del-corpus="${c.id}">删除</button></td>
    </tr>`).join('');
  body.querySelectorAll('[data-del-corpus]').forEach((b) => {
    b.onclick = () => delCorpus(b.dataset.delCorpus).then(loadCorpus).then(() => toast('已删除'));
  });
}
function openCorpusModal() {
  openModal(`<h3>添加语料条目</h3>
    <div class="form-row"><label>文本</label><textarea id="c_text" rows="4"></textarea></div>
    <div class="form-row"><label>语言</label><select id="c_lang">${LANGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
    <div class="form-row"><label>标签（可选）</label><input id="c_tag" placeholder="如：医学 / 合同"></div>
    <div class="form-actions"><button class="btn" id="c_cancel">取消</button><button class="btn primary" id="c_save">保存</button></div>`);
  $('c_cancel').onclick = closeModal;
  $('c_save').onclick = async () => {
    const text = $('c_text').value.trim();
    if (!text) { toast('文本不能为空'); return; }
    await addCorpus({ text, lang: $('c_lang').value, tag: $('c_tag').value.trim() });
    closeModal(); await loadCorpus(); toast('已添加');
  };
}

// ---------------- 实时字幕 ----------------
function bindSubtitle() {
  $('startSub').onclick = startSub;
  $('stopSub').onclick = stopSub;
}
function startSub() {
  const asrId = $('asrSelect').value;
  if (asrId !== 'browser') toast('已选择云端 ASR（配置预留），实时识别使用浏览器内置引擎');
  const engine = state.engines.find((x) => x.id === $('subtitleEngine').value);
  if (!engine) { toast('请先选择翻译引擎'); return; }
  const lang = $('srcLang').value;
  const tgtLang = lang === 'zh-CN' ? 'en-US' : 'zh-CN';
  const subSrc = $('subSource').querySelector('.sub-text');
  const subTgt = $('subTarget').querySelector('.sub-text');
  subSrc.textContent = '聆听中…'; subTgt.textContent = '';
  const rec = createRecognizer({
    lang,
    onResult: (final, interim) => {
      subSrc.textContent = final + (interim ? ' ' + interim : '');
      if (final.trim()) {
        translate(final, engine, lang, tgtLang)
          .then((t) => { subTgt.textContent = t; })
          .catch(() => {});
      }
    },
    onError: (err) => toast('识别错误：' + err),
    onEnd: () => { $('startSub').disabled = false; $('stopSub').disabled = true; },
  });
  if (!rec.supported) { toast('当前浏览器不支持语音识别，请用 Chrome / Edge'); return; }
  recognizer = rec; rec.start();
  $('startSub').disabled = true; $('stopSub').disabled = false;
  setStatus('聆听中');
}
function stopSub() {
  if (recognizer) { recognizer.stop(); recognizer = null; }
  $('startSub').disabled = false; $('stopSub').disabled = true;
  setStatus('就绪');
}

// ---------------- 导入 / 导出 ----------------
function bindIO() {
  $('exportTmx').onclick = async () => {
    const m = await getAllMemory();
    download('linguadesk-memory.tmx', toTMX(m), 'application/xml');
  };
  $('exportCsv').onclick = async () => {
    const m = await getAllMemory();
    download('linguadesk-memory.csv', toCSV(m, ['source', 'target', 'srcLang', 'tgtLang']), 'text/csv');
  };
  $('importFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const text = await f.text();
    let recs = [];
    try { recs = f.name.endsWith('.tmx') ? parseTMX(text) : fromCsv(text); }
    catch (err) { toast('导入失败：' + err.message); return; }
    for (const r of recs) await addMemory({ source: r.source, target: r.target, srcLang: r.srcLang, tgtLang: r.tgtLang });
    toast(`已导入 ${recs.length} 条`);
    await loadMemory();
  };
  $('exportCorpus').onclick = async () => {
    const c = await getAllCorpus();
    download('linguadesk-corpus.csv', toCSV(c, ['text', 'lang', 'tag']), 'text/csv');
  };
  $('importCorpus').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rows = parseCSV(await f.text());
    const header = rows[0].map((h) => h.trim());
    for (let i = 1; i < rows.length; i++) {
      const o = {}; header.forEach((h, j) => o[h] = rows[i][j]);
      if (o.text) await addCorpus({ text: o.text, lang: o.lang, tag: o.tag });
    }
    toast('语料库已导入'); await loadCorpus();
  };
  $('exportAllJson').onclick = async () => {
    const data = JSON.stringify({
      version: 1,
      memory: await getAllMemory(),
      corpus: await getAllCorpus(),
      engines: await getEngines(),
      asr: await getAsr(),
    }, null, 2);
    download('linguadesk-backup.json', data, 'application/json');
  };
  $('importAll').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const data = JSON.parse(await f.text());
    for (const m of data.memory || []) await addMemory(m);
    for (const c of data.corpus || []) await addCorpus(c);
    for (const en of data.engines || []) await saveEngine(en);
    for (const a of data.asr || []) await saveAsr(a);
    toast('备份已恢复');
    await loadEngines(); await loadAsr(); await loadMemory(); await loadCorpus();
  };
}
function fromCsv(text) {
  const rows = parseCSV(text);
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {}; header.forEach((h, j) => o[h] = r[j]);
    return { source: o.source, target: o.target, srcLang: o.srcLang, tgtLang: o.tgtLang };
  }).filter((r) => r.source && r.target);
}

// ---------------- 数据加载 ----------------
async function loadEngines() {
  state.engines = await getEngines();
  // 保证本地离线引擎存在（开箱即用，免 Key）
  if (!state.engines.some((x) => x.type === 'local')) {
    await saveEngine({ id: uid(), ...preset('local') });
    state.engines = await getEngines();
  }
  // 保证 Google 免费翻译存在（默认引擎，免 Key）
  if (!state.engines.some((x) => x.type === 'google')) {
    await saveEngine({ id: uid(), ...preset('google') });
    state.engines = await getEngines();
  }
  if (!state.engines.length) {
    const seeded = await getSetting('seeded');
    if (!seeded) {
      await saveEngine({ id: uid(), ...preset('google') });
      await setSetting('seeded', '1');
      state.engines = await getEngines();
    }
  }
  renderEngines();
  const opts = state.engines.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  $('translateEngine').innerHTML = opts || '<option value="">（请先在 API 设置添加引擎）</option>';
  $('subtitleEngine').innerHTML = opts || '<option value="">（无引擎）</option>';
  refreshFileEngineSelect();
  // 默认选中 Google 免费翻译（免 Key，需 VPN）；其次本地离线引擎
  const defaultEngine = state.engines.find((x) => x.type === 'google')
    || state.engines.find((x) => x.type === 'local')
    || state.engines[0];
  if (defaultEngine) {
    $('translateEngine').value = defaultEngine.id;
    $('subtitleEngine').value = defaultEngine.id;
    const fe = $('fileEngine'); if (fe) fe.value = defaultEngine.id;
  }
}
async function loadAsr() { state.asr = await getAsr(); renderAsr(); fillAsr(); }
function fillAsr() {
  let opts = '<option value="browser">浏览器内置 (Web Speech)</option>';
  opts += state.asr.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  $('asrSelect').innerHTML = opts;
}
async function loadCorpus() { state.corpus = await getAllCorpus(); renderCorpus(); }

init();
