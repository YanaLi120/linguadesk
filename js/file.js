// 文件翻译：PDF / TXT / MD / DOCX 提取 → 分段 → 调用引擎翻译 → 导出
import { getEngines, addMemory } from './store.js';
import { translate } from './engines.js';
import { download } from './tmx.js';

const $ = (id) => document.getElementById(id);
const LANGS = [['zh-CN', '中文'], ['en-US', '英文']];
let fstate = { paras: [], srcLang: 'en-US', tgtLang: 'zh-CN', translating: false };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fillLang(sel) {
  sel.innerHTML = LANGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
}

export function initFile() {
  fillLang($('fileSrcLang')); fillLang($('fileTgtLang'));
  $('fileSrcLang').value = fstate.srcLang;
  $('fileTgtLang').value = fstate.tgtLang;

  $('fileInput').addEventListener('change', onFile);
  $('fileSwap').onclick = () => {
    const s = $('fileSrcLang').value;
    $('fileSrcLang').value = $('fileTgtLang').value;
    $('fileTgtLang').value = s;
    fstate.srcLang = $('fileSrcLang').value;
    fstate.tgtLang = $('fileTgtLang').value;
  };
  $('fileSrcLang').onchange = () => { fstate.srcLang = $('fileSrcLang').value; };
  $('fileTgtLang').onchange = () => { fstate.tgtLang = $('fileTgtLang').value; };
  $('fileTranslateAll').onclick = translateAll;
  $('fileExportHtml').onclick = exportHtml;
  $('fileExportTxt').onclick = exportTxt;
  $('fileSaveMem').onclick = saveMem;
}

export async function refreshFileEngineSelect() {
  const engines = await getEngines();
  const opts = engines.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  $('fileEngine').innerHTML = opts || '<option value="">（无引擎）</option>';
}

async function onFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  $('fileEmpty').style.display = 'none';
  $('fileProgress').textContent = '解析中…';
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    let text = '';
    if (ext === 'pdf') text = await extractPdf(file);
    else if (ext === 'docx') text = await extractDocx(file);
    else text = await file.text();
    const paras = text.split(/\n{1,}/).map((s) => s.trim()).filter(Boolean);
    fstate.paras = paras.map((p, i) => ({ id: i, src: p, tgt: '' }));
    renderParas();
    $('fileProgress').textContent = `共 ${fstate.paras.length} 段`;
    ['fileTranslateAll', 'fileExportHtml', 'fileExportTxt', 'fileSaveMem']
      .forEach((id) => { $(id).disabled = false; });
  } catch (err) {
    $('fileProgress').textContent = '解析失败：' + err.message;
  }
}

async function extractPdf(file) {
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error('PDF 解析库未加载（请检查网络 / CDN）');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let line = '';
    for (const it of tc.items) {
      line += it.str;
      if (it.hasEOL) { lines.push(line.trim()); line = ''; }
      else line += ' ';
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines.join('\n');
}

async function extractDocx(file) {
  const mammoth = window.mammoth;
  if (!mammoth) throw new Error('DOCX 解析库未加载（请检查网络 / CDN）');
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return res.value;
}

function renderParas() {
  const body = $('fileBody');
  body.innerHTML = fstate.paras.map((p) => `
    <tr id="fp-${p.id}">
      <td>${esc(p.src)}</td>
      <td><textarea class="file-tgt" data-pid="${p.id}" placeholder="译文…">${esc(p.tgt)}</textarea></td>
    </tr>`).join('');
  body.querySelectorAll('.file-tgt').forEach((ta) => {
    ta.addEventListener('input', () => {
      const p = fstate.paras.find((x) => x.id == ta.dataset.pid);
      if (p) p.tgt = ta.value;
    });
  });
}

async function translateAll() {
  if (fstate.translating) return;
  const engines = await getEngines();
  const engine = engines.find((x) => x.id === $('fileEngine').value);
  if (!engine) { alert('请先在「API 设置」添加并选择翻译引擎'); return; }
  fstate.translating = true;
  const total = fstate.paras.length;
  let done = 0;
  for (const p of fstate.paras) {
    if (!p.src.trim()) { done++; continue; }
    try {
      p.tgt = await translate(p.src, engine, fstate.srcLang, fstate.tgtLang);
    } catch (err) {
      p.tgt = '[翻译失败] ' + err.message;
    }
    const ta = document.querySelector(`.file-tgt[data-pid="${p.id}"]`);
    if (ta) ta.value = p.tgt;
    done++;
    $('fileProgress').textContent = `翻译中 ${done}/${total}`;
  }
  $('fileProgress').textContent = `完成 ${total} 段`;
  fstate.translating = false;
}

function exportHtml() {
  const rows = fstate.paras.map((p) =>
    `<tr><td>${esc(p.src)}</td><td>${esc(p.tgt)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>双语对照翻译</title>
<style>body{font-family:-apple-system,"PingFang SC",sans-serif;margin:32px}
h1{font-size:20px} table{width:100%;border-collapse:collapse;margin-top:16px}
td{border:1px solid #ccc;padding:10px;vertical-align:top} td:first-child{width:50%;color:#555}</style></head>
<body><h1>双语对照翻译</h1><table>${rows}</table></body></html>`;
  download('bilingual.html', html, 'text/html');
}
function exportTxt() {
  download('translation.txt', fstate.paras.map((p) => p.tgt).join('\n\n'), 'text/plain');
}
async function saveMem() {
  let n = 0;
  for (const p of fstate.paras) {
    if (p.src.trim() && p.tgt.trim() && !p.tgt.startsWith('[翻译失败]')) {
      await addMemory({ source: p.src, target: p.tgt, srcLang: fstate.srcLang, tgtLang: fstate.tgtLang });
      n++;
    }
  }
  alert(`已存入翻译记忆库 ${n} 条`);
}
