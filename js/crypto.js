// 轻量加密工具：MD5 / SHA256 / HMAC-SHA1，用于各厂商翻译 API 签名

export function md5(input) {
  function rotateLeft(lValue, iShiftBits) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }
  function addUnsigned(lX, lY) {
    const lX8 = lX & 0x80000000;
    const lY8 = lY & 0x80000000;
    const lX4 = lX & 0x40000000;
    const lY4 = lY & 0x40000000;
    const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      return lResult ^ 0x40000000 ^ lX8 ^ lY8;
    }
    return lResult ^ lX8 ^ lY8;
  }
  function F(x, y, z) { return (x & y) | (~x & z); }
  function G(x, y, z) { return (x & z) | (y & ~z); }
  function H(x, y, z) { return x ^ y ^ z; }
  function I(x, y, z) { return y ^ (x | ~z); }
  function FF(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function GG(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function HH(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function II(a, b, c, d, x, s, ac) { a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac)); return addUnsigned(rotateLeft(a, s), b); }
  function convertToWordArray(str) {
    const wordCount = ((str.length + 8) >> 6) + 1;
    const wordArray = new Array(wordCount * 16).fill(0);
    for (let i = 0; i < str.length; i++) {
      wordArray[i >> 2] |= (str.charCodeAt(i) & 0xff) << ((i % 4) * 8);
    }
    wordArray[str.length >> 2] |= 0x80 << ((str.length % 4) * 8);
    wordArray[wordCount * 16 - 2] = str.length << 3;
    wordArray[wordCount * 16 - 1] = 0;
    return wordArray;
  }
  function wordToHex(lValue) {
    let hex = '';
    for (let i = 0; i <= 3; i++) {
      const byte = (lValue >>> (i * 8)) & 0xff;
      hex += ('0' + byte.toString(16)).slice(-2);
    }
    return hex;
  }
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391];
  const str = unescape(encodeURIComponent(input));
  const x = convertToWordArray(str);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let k = 0; k < x.length; k += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    a = FF(a, b, c, d, x[k], S[0], K[0]); d = FF(d, a, b, c, x[k + 1], S[1], K[1]);
    c = FF(c, d, a, b, x[k + 2], S[2], K[2]); b = FF(b, c, d, a, x[k + 3], S[3], K[3]);
    a = FF(a, b, c, d, x[k + 4], S[4], K[4]); d = FF(d, a, b, c, x[k + 5], S[5], K[5]);
    c = FF(c, d, a, b, x[k + 6], S[6], K[6]); b = FF(b, c, d, a, x[k + 7], S[7], K[7]);
    a = FF(a, b, c, d, x[k + 8], S[8], K[8]); d = FF(d, a, b, c, x[k + 9], S[9], K[9]);
    c = FF(c, d, a, b, x[k + 10], S[10], K[10]); b = FF(b, c, d, a, x[k + 11], S[11], K[11]);
    a = FF(a, b, c, d, x[k + 12], S[12], K[12]); d = FF(d, a, b, c, x[k + 13], S[13], K[13]);
    c = FF(c, d, a, b, x[k + 14], S[14], K[14]); b = FF(b, c, d, a, x[k + 15], S[15], K[15]);
    a = GG(a, b, c, d, x[k + 1], S[16], K[16]); d = GG(d, a, b, c, x[k + 6], S[17], K[17]);
    c = GG(c, d, a, b, x[k + 11], S[18], K[18]); b = GG(b, c, d, a, x[k], S[19], K[19]);
    a = GG(a, b, c, d, x[k + 5], S[20], K[20]); d = GG(d, a, b, c, x[k + 10], S[21], K[21]);
    c = GG(c, d, a, b, x[k + 15], S[22], K[22]); b = GG(b, c, d, a, x[k + 4], S[23], K[23]);
    a = GG(a, b, c, d, x[k + 9], S[24], K[24]); d = GG(d, a, b, c, x[k + 14], S[25], K[25]);
    c = GG(c, d, a, b, x[k + 3], S[26], K[26]); b = GG(b, c, d, a, x[k + 8], S[27], K[27]);
    a = GG(a, b, c, d, x[k + 13], S[28], K[28]); d = GG(d, a, b, c, x[k + 2], S[29], K[29]);
    c = GG(c, d, a, b, x[k + 7], S[30], K[30]); b = GG(b, c, d, a, x[k + 12], S[31], K[31]);
    a = HH(a, b, c, d, x[k + 5], S[32], K[32]); d = HH(d, a, b, c, x[k + 8], S[33], K[33]);
    c = HH(c, d, a, b, x[k + 11], S[34], K[34]); b = HH(b, c, d, a, x[k + 14], S[35], K[35]);
    a = HH(a, b, c, d, x[k + 1], S[36], K[36]); d = HH(d, a, b, c, x[k + 4], S[37], K[37]);
    c = HH(c, d, a, b, x[k + 7], S[38], K[38]); b = HH(b, c, d, a, x[k + 10], S[39], K[39]);
    a = HH(a, b, c, d, x[k + 13], S[40], K[40]); d = HH(d, a, b, c, x[k], S[41], K[41]);
    c = HH(c, d, a, b, x[k + 3], S[42], K[42]); b = HH(b, c, d, a, x[k + 6], S[43], K[43]);
    a = HH(a, b, c, d, x[k + 9], S[44], K[44]); d = HH(d, a, b, c, x[k + 12], S[45], K[45]);
    c = HH(c, d, a, b, x[k + 15], S[46], K[46]); b = HH(b, c, d, a, x[k + 2], S[47], K[47]);
    a = II(a, b, c, d, x[k], S[48], K[48]); d = II(d, a, b, c, x[k + 7], S[49], K[49]);
    c = II(c, d, a, b, x[k + 14], S[50], K[50]); b = II(b, c, d, a, x[k + 5], S[51], K[51]);
    a = II(a, b, c, d, x[k + 12], S[52], K[52]); d = II(d, a, b, c, x[k + 3], S[53], K[53]);
    c = II(c, d, a, b, x[k + 10], S[54], K[54]); b = II(b, c, d, a, x[k + 1], S[55], K[55]);
    a = II(a, b, c, d, x[k + 8], S[56], K[56]); d = II(d, a, b, c, x[k + 15], S[57], K[57]);
    c = II(c, d, a, b, x[k + 6], S[58], K[58]); b = II(b, c, d, a, x[k + 13], S[59], K[59]);
    a = II(a, b, c, d, x[k + 4], S[60], K[60]); d = II(d, a, b, c, x[k + 11], S[61], K[61]);
    c = II(c, d, a, b, x[k + 2], S[62], K[62]); b = II(b, c, d, a, x[k + 9], S[63], K[63]);
    a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}

export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function b64encodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
export function b64decodeUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

export async function hmacSha1Base64(key, data) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
