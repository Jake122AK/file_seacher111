/* =====================================================================
   core.js — 名前空間 / 数学 / カラーパレット / ビットマップフォント
   ===================================================================== */
window.PX = window.PX || {};
(function (PX) {
'use strict';

/* ---------------------------------------------------------------- math */
const M = PX.M = {
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  sat(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  mix(a, b, t) { return a + (b - a) * (t < 0 ? 0 : t > 1 ? 1 : t); },
  inv(a, b, v) { return b === a ? 0 : (v - a) / (b - a); },
  invSat(a, b, v) { return M.sat(M.inv(a, b, v)); },
  smooth(t) { t = M.sat(t); return t * t * (3 - 2 * t); },
  smoother(t) { t = M.sat(t); return t * t * t * (t * (t * 6 - 15) + 10); },
  ramp(a, b, v) { return M.smooth(M.inv(a, b, v)); },
  mod(a, n) { return ((a % n) + n) % n; },
  // 三角波 / のこぎり波 (位相 0..1)
  tri(p) { p = M.mod(p, 1); return p < .5 ? p * 2 : 2 - p * 2; },
  saw(p) { return M.mod(p, 1); },
  // 決定論的ハッシュノイズ
  hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); },
  hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); },
  noise(x) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return M.lerp(M.hash(i), M.hash(i + 1), u);
  },
  fbm(x, oct) {
    let v = 0, a = .5, f = 1;
    for (let i = 0; i < (oct || 3); i++) { v += a * M.noise(x * f); f *= 2.03; a *= .5; }
    return v;
  },
  // シード付き乱数
  rng(seed) {
    let s = (seed | 0) || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  },
  approach(cur, tgt, rate, dt) { return cur + (tgt - cur) * (1 - Math.exp(-rate * dt)); },
  pick(arr, r) { return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))]; }
};

/* --------------------------------------------------------------- color */
const C = PX.C = {
  hex(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  css(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; },
  cssa(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')'; },
  mix(a, b, t) {
    t = M.sat(t);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  },
  scale(c, k) { return [M.clamp(c[0] * k, 0, 255), M.clamp(c[1] * k, 0, 255), M.clamp(c[2] * k, 0, 255)]; },
  add(c, k) { return [M.clamp(c[0] + k, 0, 255), M.clamp(c[1] + k, 0, 255), M.clamp(c[2] + k, 0, 255)]; },
  hsl(h, s, l) {
    h = M.mod(h, 1);
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      t = M.mod(t, 1);
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  },
  // 高速な近似色相回転（YIQ 回転）
  rot(c, ang) {
    if (!ang) return c;
    const cs = Math.cos(ang * Math.PI * 2), sn = Math.sin(ang * Math.PI * 2);
    const r = c[0], g = c[1], b = c[2];
    const m0 = .299 + .701 * cs + .168 * sn, m1 = .587 - .587 * cs + .330 * sn, m2 = .114 - .114 * cs - .497 * sn;
    const m3 = .299 - .299 * cs - .328 * sn, m4 = .587 + .413 * cs + .035 * sn, m5 = .114 - .114 * cs + .292 * sn;
    const m6 = .299 - .300 * cs + 1.25 * sn, m7 = .587 - .588 * cs - 1.05 * sn, m8 = .114 + .886 * cs - .203 * sn;
    return [
      M.clamp(r * m0 + g * m1 + b * m2, 0, 255),
      M.clamp(r * m3 + g * m4 + b * m5, 0, 255),
      M.clamp(r * m6 + g * m7 + b * m8, 0, 255)
    ];
  },
  // 虹（サイケ用の飽和した帯）
  rainbow(t, l) { return C.hsl(t, 1, l === undefined ? .55 : l); }
};

/* ------------------------------------------------------------ palettes
   各ワールドのカラーセット。全スロットが同名で存在するので、
   複数ワールドを重み付き平均すれば「連続的にワールドが溶ける」。
   ------------------------------------------------------------------- */
const SLOTS = ['skyTop', 'skyMid', 'skyLow', 'sun', 'cloud', 'far', 'mid', 'near',
  'ground', 'groundAlt', 'road', 'roadAlt', 'line', 'rumble', 'rumbleAlt',
  'accentA', 'accentB', 'accentC', 'fog', 'lightGlow'];

const RAW = {
  /* PHASE1: 夕方の住宅街 */
  suburb: {
    skyTop: '#2b2a52', skyMid: '#6b4a70', skyLow: '#d8785c', sun: '#ffd090', cloud: '#7b5a7e',
    far: '#3a3557', mid: '#2e2a46', near: '#231f36',
    ground: '#2a2b33', groundAlt: '#25262e', road: '#3a3a44', roadAlt: '#343440',
    line: '#d8d4c0', rumble: '#8a8778', rumbleAlt: '#5c5a50',
    accentA: '#ffb060', accentB: '#7ac0d8', accentC: '#e06a80', fog: '#4a3a58', lightGlow: '#ffd8a0'
  },
  /* 夜の住宅街 (帰還) */
  night: {
    skyTop: '#0a0a1c', skyMid: '#131a34', skyLow: '#1e2748', sun: '#c8d4ff', cloud: '#1a2140',
    far: '#161a2e', mid: '#121424', near: '#0d0f1c',
    ground: '#151620', groundAlt: '#12131c', road: '#26262f', roadAlt: '#22222b',
    line: '#c8c4b0', rumble: '#4e4c46', rumbleAlt: '#33322e',
    accentA: '#ffd090', accentB: '#7090c0', accentC: '#8060a0', fog: '#1a1c30', lightGlow: '#ffdc9c'
  },
  /* PHASE2-3: 違和感 → トリップ入口 */
  weird: {
    skyTop: '#241a4e', skyMid: '#5a2a72', skyLow: '#c2506e', sun: '#ffc8e0', cloud: '#6e3a86',
    far: '#40265e', mid: '#32204c', near: '#26183a',
    ground: '#2c2438', groundAlt: '#261e32', road: '#42364e', roadAlt: '#3a2e46',
    line: '#f0e0ff', rumble: '#a06ec0', rumbleAlt: '#6a4a86',
    accentA: '#ff70c0', accentB: '#60e0d0', accentC: '#ffe060', fog: '#503070', lightGlow: '#ffb0f0'
  },
  /* 南国 */
  tropical: {
    skyTop: '#ff6aa8', skyMid: '#ff9a6a', skyLow: '#ffd48a', sun: '#fff2b0', cloud: '#ffb0c8',
    far: '#7a5aa8', mid: '#2f8fb8', near: '#1d6f9a',
    ground: '#f0c88a', groundAlt: '#e0b478', road: '#5a4a7a', roadAlt: '#524270',
    line: '#fff4d0', rumble: '#ff7ab0', rumbleAlt: '#ffd060',
    accentA: '#00e0c0', accentB: '#ff5090', accentC: '#ffe870', fog: '#ff9ab0', lightGlow: '#fff0c0'
  },
  /* 宇宙 */
  space: {
    skyTop: '#050418', skyMid: '#160a3a', skyLow: '#2e1060', sun: '#ffe8ff', cloud: '#3a1a70',
    far: '#1d0f44', mid: '#140a30', near: '#0c0620',
    ground: '#150a2c', groundAlt: '#100820', road: '#2a1a54', roadAlt: '#221446',
    line: '#a0f0ff', rumble: '#7040c0', rumbleAlt: '#40208a',
    accentA: '#70e0ff', accentB: '#ff70e0', accentC: '#fff0a0', fog: '#241050', lightGlow: '#c0a0ff'
  },
  /* 巨大都市 */
  city: {
    skyTop: '#0d0a24', skyMid: '#2a1050', skyLow: '#5a1a6a', sun: '#ff70a0', cloud: '#3a1656',
    far: '#241a52', mid: '#1a1240', near: '#120c2c',
    ground: '#1a1630', groundAlt: '#161228', road: '#2e2a4a', roadAlt: '#282442',
    line: '#00f0e0', rumble: '#ff2e88', rumbleAlt: '#8a1a5a',
    accentA: '#00f0ff', accentB: '#ff3070', accentC: '#ffe030', fog: '#2a1a4a', lightGlow: '#70f0ff'
  },
  /* ジャングル */
  jungle: {
    skyTop: '#0a2820', skyMid: '#16543a', skyLow: '#5aa050', sun: '#e8ff90', cloud: '#2a6a48',
    far: '#1b4a34', mid: '#143a28', near: '#0e2c1e',
    ground: '#274a26', groundAlt: '#20401f', road: '#3a4a30', roadAlt: '#32422a',
    line: '#e0ff90', rumble: '#8ad04a', rumbleAlt: '#4a8a2a',
    accentA: '#ffe040', accentB: '#ff5a3a', accentC: '#40ffb0', fog: '#2a6a48', lightGlow: '#d0ff80'
  },
  /* 海底 */
  ocean: {
    skyTop: '#02182e', skyMid: '#064a72', skyLow: '#0a86a8', sun: '#a8f0ff', cloud: '#0a5c80',
    far: '#08405e', mid: '#052e46', near: '#031e30',
    ground: '#0a3a4e', groundAlt: '#082e40', road: '#0e4a62', roadAlt: '#0c4056',
    line: '#c0ffff', rumble: '#20c0c8', rumbleAlt: '#107080',
    accentA: '#40ffe0', accentB: '#ff8ac0', accentC: '#ffe060', fog: '#0a6a90', lightGlow: '#a0ffff'
  },
  /* 抽象世界 */
  abstract: {
    skyTop: '#1a0030', skyMid: '#50007a', skyLow: '#a000a0', sun: '#ffffff', cloud: '#7a0090',
    far: '#3a0a60', mid: '#2a0648', near: '#1c0432',
    ground: '#2a0a44', groundAlt: '#220838', road: '#4a1070', roadAlt: '#400c62',
    line: '#ffff00', rumble: '#00ffc0', rumbleAlt: '#ff00a0',
    accentA: '#ffff40', accentB: '#00ffe0', accentC: '#ff40ff', fog: '#5a1080', lightGlow: '#ffffff'
  },
  /* クライマックス: 全部盛り */
  climax: {
    skyTop: '#2a0060', skyMid: '#a01090', skyLow: '#ff7040', sun: '#ffffff', cloud: '#ff90d0',
    far: '#6a20a0', mid: '#4a1880', near: '#341060',
    ground: '#5a2090', groundAlt: '#4a1878', road: '#7a30b0', roadAlt: '#6a28a0',
    line: '#ffffff', rumble: '#ffe000', rumbleAlt: '#00ffd0',
    accentA: '#ffffff', accentB: '#00ffe0', accentC: '#ffe000', fog: '#a040c0', lightGlow: '#ffffff'
  },
  /* 白飛び (帰還の瞬間) */
  white: {
    skyTop: '#ffffff', skyMid: '#ffffff', skyLow: '#fff8f0', sun: '#ffffff', cloud: '#ffffff',
    far: '#fff4e8', mid: '#fff0e0', near: '#ffece0',
    ground: '#fff4ec', groundAlt: '#fff0e4', road: '#fffaf4', roadAlt: '#fff6ee',
    line: '#ffffff', rumble: '#fff0d0', rumbleAlt: '#ffe8c0',
    accentA: '#ffffff', accentB: '#ffffff', accentC: '#ffffff', fog: '#ffffff', lightGlow: '#ffffff'
  }
};

// hex → [r,g,b] へ展開
const PAL = PX.PALETTES = {};
for (const k in RAW) {
  const p = {};
  for (const s of SLOTS) p[s] = C.hex(RAW[k][s] || '#ff00ff');
  PAL[k] = p;
}
PX.PALETTE_SLOTS = SLOTS;

/* 重み付きブレンド + 色相回転 + 彩度ブースト */
PX.blendPalette = function (weights, hueShift, satBoost, out) {
  out = out || {};
  let total = 0;
  for (const k in weights) total += weights[k];
  if (total <= 0) { total = 1; weights = { suburb: 1 }; }
  for (let i = 0; i < SLOTS.length; i++) {
    const s = SLOTS[i];
    let r = 0, g = 0, b = 0;
    for (const k in weights) {
      const w = weights[k]; if (!w) continue;
      const c = PAL[k] ? PAL[k][s] : PAL.suburb[s];
      r += c[0] * w; g += c[1] * w; b += c[2] * w;
    }
    let c = [r / total, g / total, b / total];
    if (hueShift) c = C.rot(c, hueShift);
    if (satBoost) {
      const lum = c[0] * .299 + c[1] * .587 + c[2] * .114;
      c = [M.clamp(lum + (c[0] - lum) * (1 + satBoost), 0, 255),
           M.clamp(lum + (c[1] - lum) * (1 + satBoost), 0, 255),
           M.clamp(lum + (c[2] - lum) * (1 + satBoost), 0, 255)];
    }
    out[s] = c;
  }
  return out;
};

/* ------------------------------------------------------------ 3x5 font */
const GLYPH = {
  'A': '.#.,#.#,###,#.#,#.#', 'B': '##.,#.#,##.,#.#,##.', 'C': '.##,#..,#..,#..,.##',
  'D': '##.,#.#,#.#,#.#,##.', 'E': '###,#..,##.,#..,###', 'F': '###,#..,##.,#..,#..',
  'G': '.##,#..,#.#,#.#,.##', 'H': '#.#,#.#,###,#.#,#.#', 'I': '###,.#.,.#.,.#.,###',
  'J': '..#,..#,..#,#.#,.#.', 'K': '#.#,#.#,##.,#.#,#.#', 'L': '#..,#..,#..,#..,###',
  'M': '#.#,###,###,#.#,#.#', 'N': '#.#,###,###,###,#.#', 'O': '.#.,#.#,#.#,#.#,.#.',
  'P': '##.,#.#,##.,#..,#..', 'Q': '.#.,#.#,#.#,##.,.##', 'R': '##.,#.#,##.,#.#,#.#',
  'S': '.##,#..,.#.,..#,##.', 'T': '###,.#.,.#.,.#.,.#.', 'U': '#.#,#.#,#.#,#.#,.#.',
  'V': '#.#,#.#,#.#,.#.,.#.', 'W': '#.#,#.#,###,###,#.#', 'X': '#.#,#.#,.#.,#.#,#.#',
  'Y': '#.#,#.#,.#.,.#.,.#.', 'Z': '###,..#,.#.,#..,###',
  '0': '###,#.#,#.#,#.#,###', '1': '.#.,##.,.#.,.#.,###', '2': '##.,..#,.#.,#..,###',
  '3': '##.,..#,.#.,..#,##.', '4': '#.#,#.#,###,..#,..#', '5': '###,#..,##.,..#,##.',
  '6': '.##,#..,##.,#.#,.#.', '7': '###,..#,.#.,.#.,.#.', '8': '.#.,#.#,.#.,#.#,.#.',
  '9': '.#.,#.#,.##,..#,##.',
  ' ': '...,...,...,...,...', '.': '...,...,...,...,.#.', ',': '...,...,...,.#.,#..',
  ':': '...,.#.,...,.#.,...', '!': '.#.,.#.,.#.,...,.#.', '?': '##.,..#,.#.,...,.#.',
  '-': '...,...,###,...,...', '+': '...,.#.,###,.#.,...', '/': '..#,..#,.#.,#..,#..',
  '%': '#.#,..#,.#.,#..,#.#', 'x': '...,...,#.#,.#.,#.#', '*': '#.#,.#.,#.#,...,...',
  '(': '..#,.#.,.#.,.#.,..#', ')': '#..,.#.,.#.,.#.,#..', "'": '.#.,.#.,...,...,...',
  '>': '#..,.#.,..#,.#.,#..', '<': '..#,.#.,#..,.#.,..#', '=': '...,###,...,###,...'
};
const FONT = PX.FONT = {};
for (const ch in GLYPH) {
  const rows = GLYPH[ch].split(',');
  const bits = [];
  for (let y = 0; y < 5; y++) {
    let m = 0;
    for (let x = 0; x < 3; x++) if (rows[y][x] === '#') m |= (1 << x);
    bits.push(m);
  }
  FONT[ch] = bits;
}
PX.FONT_W = 3; PX.FONT_H = 5;

PX.textWidth = function (s, scale, sp) {
  scale = scale || 1; sp = sp === undefined ? 1 : sp;
  return s.length * (3 + sp) * scale - sp * scale;
};

})(window.PX);
