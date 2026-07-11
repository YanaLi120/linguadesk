// 模糊匹配：中英混合文本相似度
function norm(s) {
  return (s || '').trim().toLowerCase();
}

function tokenize(s) {
  const n = norm(s);
  const cn = n.match(/[\u4e00-\u9fff]/g) || [];
  const en = n.match(/[a-z0-9]+/g) || [];
  return new Set([...cn, ...en]);
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// 返回 0~1 的相似度
export function similarity(a, b) {
  const sa = norm(a), sb = norm(b);
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  const dist = levenshtein(sa, sb);
  const maxLen = Math.max(sa.length, sb.length) || 1;
  const ratio = 1 - dist / maxLen;

  const ta = tokenize(a), tb = tokenize(b);
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter++; });
  const union = ta.size + tb.size - inter;
  const jaccard = union ? inter / union : 0;

  return ratio * 0.6 + jaccard * 0.4;
}

// 在记忆库中查找相似条目
export function findFuzzy(text, memoryList, threshold = 0.5, limit = 3) {
  return memoryList
    .map((m) => ({ m, score: similarity(text, m.source) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
