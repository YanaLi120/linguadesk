// TMX / CSV 导入导出
function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function xmlUnescape(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

// 导出 TMX
export function toTMX(records) {
  const body = records.map((r) => {
    const sl = r.srcLang || 'zh-CN';
    const tl = r.tgtLang || 'en-US';
    return `    <tu>
      <tuv xml:lang="${xmlEscape(sl)}"><seg>${xmlEscape(r.source)}</seg></tuv>
      <tuv xml:lang="${xmlEscape(tl)}"><seg>${xmlEscape(r.target)}</seg></tuv>
    </tu>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<tmx version="1.4">
  <header creationtool="LinguaDesk" creationtoolversion="1.0" srclang="zh-CN" datatype="plaintext"/>
  <body>
${body}
  </body>
</tmx>`;
}

// 解析 TMX
export function parseTMX(text) {
  const out = [];
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('TMX 解析失败：不是有效的 XML');
  doc.querySelectorAll('tu').forEach((tu) => {
    const segs = {};
    tu.querySelectorAll('tuv').forEach((tuv) => {
      const lang = (tuv.getAttribute('xml:lang') || tuv.getAttribute('lang') || '').toLowerCase();
      const seg = tuv.querySelector('seg');
      if (lang && seg) segs[lang] = xmlUnescape(seg.textContent);
    });
    const langs = Object.keys(segs);
    if (langs.length >= 2) {
      const [a, b] = langs;
      out.push({ source: segs[a], target: segs[b], srcLang: a, tgtLang: b });
    }
  });
  return out;
}

// 导出 CSV（带表头）
export function toCSV(records, cols) {
  const header = cols.map(xmlEscape).join(',');
  const rows = records.map((r) =>
    cols.map((c) => {
      let v = r[c] ?? '';
      v = String(v).replace(/"/g, '""');
      return `"${v}"`;
    }).join(',')
  );
  return [header, ...rows].join('\n');
}

// 解析 CSV（简单引号感知）
export function parseCSV(text) {
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

export function download(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
