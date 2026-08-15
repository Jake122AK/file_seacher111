/* =====================================================================
   art.js — ドット絵アセット
   ---------------------------------------------------------------------
   [A] 文字列アートから生成するスプライト（生き物・小物）
       + 色相バリアントを事前生成（サイケ化で世界の色が回っても馴染む）
   [B] プロシージャル描画関数（木・建物・雲・波など）
       こちらは「モーフィング引数」を持つ。
       drawTree(m) の m を 0→1 に動かすと 街路樹 → ヤシの木 に連続変形する。
       これが本作のトランジション（気づいたら別世界）の中核。
   ===================================================================== */
(function (PX) {
'use strict';
const M = PX.M, C = PX.C;

/* ------------------------------------------------- [A] sprite factory */
function mkSprite(art) {
  const rows = art.rows, h = rows.length;
  let w = 0; for (const r of rows) w = Math.max(w, r.length);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x] || '.';
      if (ch === '.' || ch === ' ') continue;
      const hex = art.pal[ch];
      if (!hex) continue;
      const c = C.hex(hex);
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const spr = { cv, w, h, hues: null };
  spr.hues = makeHues(spr, 8);
  return spr;
}

function makeHues(spr, n) {
  const out = [];
  const src = spr.cv.getContext('2d').getImageData(0, 0, spr.w, spr.h);
  for (let k = 0; k < n; k++) {
    const cv = document.createElement('canvas'); cv.width = spr.w; cv.height = spr.h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(spr.w, spr.h);
    const s = src.data, d = img.data;
    const ang = k / n;
    for (let i = 0; i < s.length; i += 4) {
      if (!s[i + 3]) continue;
      const c = C.rot([s[i], s[i + 1], s[i + 2]], ang);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    out.push(cv);
  }
  return out;
}
PX.mkSprite = mkSprite;

const A = PX.ART = {};

/* ------- 猫（最初と最後に出る、この物語のしるし） --------------------- */
A.cat = {
  pal: { k: '#241a26', f: '#4a3a44', y: '#ffe070', p: '#ff8aa0', w: '#f0e4ea' },
  rows: [
    '.k.......k.',
    '.kk.....kk.',
    '.kfffffffk.',
    '.kfyffffyk.',
    '.kffkpkffk.',
    '..fffffff..',
    '..fffffff.k',
    '..fffffffkk',
    '..w.w.w.wk.'
  ]
};
A.catSit = {
  pal: { k: '#1c1420', f: '#3e2f3a', y: '#ffe070', p: '#ff8aa0' },
  rows: [
    '.k.....k...',
    '.kk...kk...',
    '.kfffffk...',
    '.kfyfyfk...',
    '.kffpffk..k',
    '..fffff..kk',
    '..fffff.kk.',
    '.fffffff...',
    '.ff...ff...'
  ]
};

/* ------- フラダンサー（2 基本ポーズ、揺れは描画時に付与） ------------- */
A.hula1 = {
  pal: { h: '#2a1414', s: '#e8a878', d: '#c08050', l: '#ff5a8a', g: '#ffd24a', y: '#e8a83a', k: '#3a2018' },
  rows: [
    '....hhh....',
    '...hhhhh...',
    '...hsssh...',
    '...hsssh...',
    '....sss....',
    's...lll...s',
    '.s.lllll.s.',
    '..ssdddss..',
    '...ddddd...',
    '...ddddd...',
    '...ggggg...',
    '..ggggggg..',
    '..gygygyg..',
    '...ggggg...',
    '....d.d....',
    '....d.d....',
    '...kk.kk...'
  ]
};
A.hula2 = {
  pal: { h: '#2a1414', s: '#e8a878', d: '#c08050', l: '#ff5a8a', g: '#ffd24a', y: '#e8a83a', k: '#3a2018' },
  rows: [
    '....hhh....',
    '...hhhhh...',
    '...hsssh...',
    '...hsssh...',
    '....sss....',
    '..s.lll.s..',
    '..s.lll.s..',
    '.ssddddds..',
    '...ddddd...',
    '...ddddd...',
    '..ggggggg..',
    '..gygygyg..',
    '...ggggg...',
    '...ggggg...',
    '...d...d...',
    '...d...d...',
    '..kk...kk..'
  ]
};

/* ------- 一般人（歩行 2 フレーム） ----------------------------------- */
A.walk1 = {
  pal: { h: '#2a1c14', s: '#e8b088', c: '#5a80c8', p: '#2a3a5a', k: '#181820' },
  rows: ['.hhh.', 'hsssh', '.sss.', 'ccccc', 'ccccc', '.ccc.', '.ppp.', '.p.p.', '.p.p.', 'k...k']
};
A.walk2 = {
  pal: { h: '#2a1c14', s: '#e8b088', c: '#5a80c8', p: '#2a3a5a', k: '#181820' },
  rows: ['.hhh.', 'hsssh', '.sss.', 'ccccc', 'ccccc', '.ccc.', '.ppp.', 'pp.pp', 'p...p', 'k...k']
};

/* ------- 犬 / 自転車 / 対向車 ---------------------------------------- */
A.dog = {
  pal: { b: '#a8783a', d: '#7a5424', k: '#241810', w: '#f0e8d8' },
  rows: ['..k......k.', '.bbb....bb.', 'bbbbbbbbbb.', 'bbbbbbbbbbk', 'wb.bb..bb..', '.d.d...d.d.']
};
A.bike = {
  pal: { k: '#20202a', s: '#e8b088', c: '#d05a5a', m: '#8a8a9a' },
  rows: [
    '...ss..', '..scs..', '..ccc..', '.mcccm.', '..ccc..', '.m.c.m.',
    'kkk.kkk', 'k.k.k.k', 'kkk.kkk'
  ]
};
A.carOnc = {
  pal: { b: '#c8483a', d: '#8a2a24', g: '#7ac0d8', y: '#fff0b0', k: '#181420', r: '#ff4a30' },
  rows: [
    '...ddddddd...',
    '..dgggggggd..',
    '.ddddddddddd.',
    'dbbbbbbbbbbbd',
    'ybbbbbbbbbbby',
    'ybbbbbbbbbbby',
    '.kk.......kk.'
  ]
};

/* ------- 空を泳ぐ魚 / クジラ / UFO ----------------------------------- */
A.fish = {
  pal: { b: '#40e0d0', d: '#1a90a8', w: '#ffffff', k: '#0a2a3a' },
  rows: ['..bbbb..b', '.bbbbbbbb', 'bwbbbbbbb', 'bkbbbbbbb', '.bbbbbbbb', '..bbbb..b']
};
A.fish2 = {
  pal: { b: '#ff8ac0', d: '#c04a80', w: '#ffffff', k: '#3a0a2a' },
  rows: ['..bbbb..b', '.bbbbbbbb', 'bwbbbbbbb', 'bkbbbbbbb', '.bbbbbbbb', '..bbbb..b']
};
A.whale = {
  pal: { b: '#5a7ad0', d: '#3a548a', w: '#e8f0ff', k: '#141a30', p: '#a0c0ff' },
  rows: [
    '.....bbbbbbbbbb.......dd..',
    '...bbbbbbbbbbbbbbb...dddd.',
    '..bbbbbbbbbbbbbbbbbbddddd.',
    '.bbbbbbbbbbbbbbbbbbbbdddd.',
    'bbkbbbbbbbbbbbbbbbbbbbddd.',
    'bbbbbbbbbbbbbbbbbbbbbbdd..',
    '.wwwwwwwwwwwwwwwwwwwbb....',
    '..wwwwwwwwwwwwwwwww.......',
    '...wwwwwwwwwwwww..........'
  ]
};
A.ufo = {
  pal: { g: '#a0f0c0', m: '#8a90b0', d: '#4a5070', y: '#ffe070', c: '#70e0ff' },
  rows: [
    '....ggggg....',
    '...gggggggg..',
    '.mmmmmmmmmmm.',
    'mmdmdmdmdmdmm',
    '.mmmmmmmmmmm.',
    '..y..y..y..y.'
  ]
};

/* ------- キノコ（すべての始まり） ------------------------------------- */
A.mushroom = {
  pal: { r: '#d8484a', h: '#f06a68', w: '#f4ecd8', s: '#e8dcc0', k: '#2a1a1a', p: '#a83236' },
  rows: [
    '...hhhhh...',
    '..hhwhhwhh.',
    '.hhhhhhhhhh',
    'rhwhhhhhwhr',
    'rrhhhhhhhrr',
    'prrrrrrrrrp',
    '...sssss...',
    '...swwss...',
    '...sssss...',
    '..sssssss..'
  ]
};

/* ------- 巨大な目 / レコード / 手 ------------------------------------ */
A.eye = {
  pal: { w: '#f4f0ff', i: '#7a40e0', p: '#100818', k: '#2a1a4a', g: '#c0a0ff' },
  rows: [
    '.....kkkkkkkkk.....',
    '..kkkwwwwwwwwwkkk..',
    '.kwwwwwwwwwwwwwwwk.',
    'kwwwwwiiiiiwwwwwwwk',
    'kwwwwiiipiiiwwwwwwk',
    'kwwwwiipppiiwwwwwwk',
    'kwwwwiiipiiiwwwwwwk',
    'kwwwwwiiiiiwwwwwwwk',
    '.kwwwwwwwwwwwwwwwk.',
    '..kkkwwwwwwwwwkkk..',
    '.....kkkkkkkkk.....'
  ]
};
A.record = {
  pal: { k: '#181420', d: '#2a2438', l: '#e04a7a', w: '#f0e8ff' },
  rows: [
    '..kkkkk..',
    '.kkdddkk.',
    'kkdkkkdkk',
    'kdkkllkkd',
    'kdklwlkkd',
    'kdkkllkkd',
    'kkdkkkdkk',
    '.kkdddkk.',
    '..kkkkk..'
  ]
};

/* ------- 太陽（サングラス）と月（こちらを見る） ----------------------- */
A.sunGlasses = {
  pal: { y: '#ffe45a', o: '#ff9a3a', k: '#241428', w: '#ffffff', p: '#ff5a8a' },
  rows: [
    '...oyyyyyyo...',
    '..oyyyyyyyyo..',
    '.oyyyyyyyyyyo.',
    'oyyyyyyyyyyyyo',
    'kkkkkkkkkkkkkk',
    'kwkkkkkkkkwkkk',
    'oykkyyyykkyyyo',
    'oyyyyppyyyyyyo',
    '.oyyypppyyyyo.',
    '..oyyyyyyyyo..',
    '...oyyyyyyo...'
  ]
};
A.moonFace = {
  pal: { w: '#f0ecd0', g: '#d8d0a8', k: '#3a3a2a', p: '#c8b890' },
  rows: [
    '..wwwwwww..',
    '.wwwgwwwww.',
    'wwwwwwwgwww',
    'wwkwwwwwkww',
    'wwwwwwwwwww',
    'wwgwwwwwwww',
    'wwwkwwwkwww',
    'wwwwkkkwwww',
    '.wwwwwwwgw.',
    '..wwwwwww..'
  ]
};

/* 生成 */
const SPR = PX.SPR = {};
PX.buildArt = function () {
  for (const k in A) SPR[k] = mkSprite(A[k]);
};

/* =================================================== [B] procedural  */
const P = PX.draw = {};

/*
  drawTree — 街路樹 ↔ ヤシの木 ↔ 星 のモーフィング
  m : 0 = 広葉樹(住宅街) / 1 = ヤシ / 2 = 星化(先端が星になる)
*/
P.tree = function (p, x, base, hgt, m, sway, col, colB, alpha, hue) {
  const palm = M.sat(m), star = M.sat(m - 1);
  const trunkW = Math.max(1, Math.round(M.lerp(hgt * .11, hgt * .055, palm)));
  const th = hgt * M.lerp(.55, .78, palm);
  const trunkCol = C.mix(col, [120, 86, 54], .0);
  const a = alpha === undefined ? 1 : alpha;
  const ctx = p.ctx;
  ctx.globalAlpha = a;

  // 幹（ヤシほど反る）
  let px_ = x, topX = x;
  const seg = Math.max(3, Math.round(th / 2));
  for (let i = 0; i < seg; i++) {
    const t = i / (seg - 1);
    const bend = Math.sin(t * 1.5) * palm * hgt * .14 + sway * t * t;
    const y = base - th * t;
    const w = M.lerp(trunkW, trunkW * M.lerp(1, .6, palm), t);
    px_ = x + bend;
    ctx.fillStyle = C.css(C.mix(trunkCol, colB, t * .25 * (1 - palm)));
    ctx.fillRect(Math.round(px_ - w / 2), Math.round(y), Math.max(1, Math.round(w)), 2);
    if (palm > .35 && i % 3 === 0) {
      ctx.fillStyle = C.css(C.scale(trunkCol, .78));
      ctx.fillRect(Math.round(px_ - w / 2), Math.round(y), Math.max(1, Math.round(w)), 1);
    }
    topX = px_;
  }
  const topY = base - th;

  if (star < .999) {
    if (palm < .5) {
      // 広葉樹: 塊の葉
      const r = hgt * M.lerp(.30, .16, palm * 2);
      const k = 1 - palm * 2;
      p.circle(topX, topY - r * .5, r * .95, C.css(col), a * k);
      p.circle(topX - r * .6, topY - r * .1, r * .62, C.css(colB), a * k);
      p.circle(topX + r * .62, topY - r * .18, r * .58, C.css(colB), a * k);
      p.circle(topX + r * .1, topY - r * 1.1, r * .55, C.css(C.scale(col, 1.14)), a * k);
    }
    if (palm > .3) {
      // ヤシ: 葉を放射状に
      const k = M.sat((palm - .3) / .55) * (1 - star);
      const n = 7;
      const fl = hgt * .38;
      for (let i = 0; i < n; i++) {
        const ang = Math.PI + (i / (n - 1)) * Math.PI + Math.sin(i * 2.1) * .12;
        const droop = .55 + M.hash(i * 3.1) * .4;
        const c = i % 2 ? col : colB;
        ctx.fillStyle = C.css(c);
        let fx = topX, fy = topY;
        const steps = Math.max(3, Math.round(fl / 1.6));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const aa = ang + t * droop * (Math.cos(ang) > 0 ? .9 : -.9);
          fx += Math.cos(aa) * 1.7;
          fy += Math.sin(aa) * 1.7 * .9;
          const w = Math.max(1, Math.round(M.lerp(3, 1, t) * k));
          ctx.globalAlpha = a * k;
          ctx.fillRect(Math.round(fx), Math.round(fy - w / 2), 2, w);
        }
      }
      ctx.globalAlpha = a;
      // ココナッツ
      if (k > .6) { p.circle(topX - 2, topY + 2, 1.6, C.css([90, 60, 30]), a); p.circle(topX + 2, topY + 3, 1.4, C.css([90, 60, 30]), a); }
    }
  }
  if (star > .01) {
    // 先端が星になる（宇宙への入口）
    const r = hgt * .18 * star;
    P.star(p, topX, topY - r * .4, r, C.css([255, 255, 240]), a * star);
    p.circle(topX, topY - r * .4, r * .35, '#ffffff', a * star);
  }
  ctx.globalAlpha = 1;
};

/* 4方向の星 */
P.star = function (p, x, y, r, col, a) {
  const ctx = p.ctx;
  ctx.globalAlpha = a === undefined ? 1 : a;
  ctx.fillStyle = typeof col === 'string' ? col : C.css(col);
  x = Math.round(x); y = Math.round(y); r = Math.max(1, Math.round(r));
  for (let i = -r; i <= r; i++) {
    const w = Math.max(1, Math.round((1 - Math.abs(i) / r) * 2.2));
    ctx.fillRect(x - Math.round(w / 2), y + i, w, 1);
    ctx.fillRect(x + i, y - Math.round(w / 2), 1, w);
  }
  ctx.globalAlpha = 1;
};

/*
  drawBuilding — 家 ↔ ビル ↔ 溶ける ↔ 木 のモーフ
  m : 0 = 一軒家 / 1 = 高層ビル
  melt : 溶け具合 (窓が星になる → 宇宙へ)
*/
P.building = function (p, x, base, w, h, m, opt) {
  opt = opt || {};
  const ctx = p.ctx;
  const a = opt.alpha === undefined ? 1 : opt.alpha;
  if (a <= .01) return;
  ctx.globalAlpha = a;
  const body = opt.body || [40, 36, 60];
  const roof = opt.roof || [70, 40, 50];
  const winOn = opt.win || [255, 214, 140];
  const winOff = opt.winOff || [40, 40, 60];
  const tall = M.sat(m);
  const melt = M.sat(opt.melt || 0);
  const breathe = opt.breathe || 0;
  const bw = Math.max(3, Math.round(w * (1 + breathe * .06)));
  const bh = Math.max(4, Math.round(h * (1 + breathe * .04)));
  const x0 = Math.round(x - bw / 2), y0 = Math.round(base - bh);

  // 屋根（低層のみ三角屋根）
  if (tall < .7) {
    const rh = Math.round(bh * .28 * (1 - tall));
    ctx.fillStyle = C.css(roof);
    for (let i = 0; i < rh; i++) {
      const t = i / Math.max(1, rh - 1);
      const ww = Math.round(bw * (0.15 + .85 * t)) + 2;
      ctx.fillRect(Math.round(x - ww / 2), y0 - rh + i, ww, 1);
    }
  } else {
    ctx.fillStyle = C.css(C.scale(body, 1.25));
    ctx.fillRect(x0, y0 - 2, bw, 2);
    // アンテナ
    ctx.fillStyle = C.css(opt.antenna || [255, 60, 90]);
    ctx.fillRect(Math.round(x), y0 - 7, 1, 6);
    if (opt.blink) ctx.fillRect(Math.round(x) - 1, y0 - 8, 3, 2);
  }

  ctx.fillStyle = C.css(body);
  ctx.fillRect(x0, y0, bw, bh);

  // 窓（音楽で明滅 / 目のようにまばたき / 星化）
  const cols = Math.max(1, Math.floor(bw / 4));
  const rowsN = Math.max(1, Math.floor(bh / 5));
  const seed = opt.seed || 1;
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x0 + 2 + c * 4, wy = y0 + 3 + r * 5;
      if (wy + 2 > base - 1) continue;
      const hsh = M.hash2(c + seed * 7.3, r + seed * 2.1);
      let on = hsh > .38;
      if (opt.beatWin !== undefined) on = hsh > .38 - opt.beatWin * .35;
      const blink = opt.blink && M.hash2(c * 3.1 + seed, r * 1.7) < opt.blink;
      const col = on ? winOn : winOff;
      if (melt > .3 && hsh > .55) {
        // 窓が星になる
        P.star(p, wx + 1, wy + 1, 1 + melt * 2, '#ffffff', a * M.sat((melt - .3) / .5));
        continue;
      }
      ctx.fillStyle = C.css(col);
      if (blink) ctx.fillRect(wx, wy + 1, 2, 1);
      else ctx.fillRect(wx, wy, 2, 3);
    }
  }
  ctx.globalAlpha = 1;
};

/* 街灯（ビートで明滅する） */
P.streetlight = function (p, x, base, h, col, glow, glowAmt) {
  const ctx = p.ctx;
  ctx.fillStyle = C.css(col);
  ctx.fillRect(Math.round(x), Math.round(base - h), 1, Math.round(h));
  const armDir = x < p.w / 2 ? 1 : -1;
  ctx.fillRect(Math.round(x), Math.round(base - h), armDir > 0 ? 4 : -4 + 1, 1);
  const lx = x + armDir * 3.5, ly = base - h + 1;
  if (glowAmt > .02) {
    p.circle(lx, ly + 1, 1.5 + glowAmt * 3.2, C.cssa(glow, .30 + glowAmt * .5));
    p.circle(lx, ly + 1, 1 + glowAmt, C.css(glow));
  }
};

/* 電柱 */
P.pole = function (p, x, base, h, col, breathe) {
  const ctx = p.ctx;
  const w = 1 + (breathe > .5 ? 1 : 0);
  ctx.fillStyle = C.css(col);
  ctx.fillRect(Math.round(x), Math.round(base - h), w, Math.round(h));
  ctx.fillRect(Math.round(x - 3), Math.round(base - h + 3), 7, 1);
  ctx.fillRect(Math.round(x - 2), Math.round(base - h + 6), 5, 1);
};

/* 標識（文字が化ける） */
P.sign = function (p, x, base, h, text, colBg, colFg, colPole) {
  const ctx = p.ctx;
  ctx.fillStyle = C.css(colPole);
  ctx.fillRect(Math.round(x), Math.round(base - h), 1, Math.round(h));
  const w = PX.textWidth(text, 1, 1) + 4;
  const bx = Math.round(x - w / 2), by = Math.round(base - h - 9);
  ctx.fillStyle = C.css(colBg);
  ctx.fillRect(bx, by, w, 9);
  ctx.fillStyle = C.css(colFg);
  ctx.fillRect(bx, by, w, 1); ctx.fillRect(bx, by + 8, w, 1);
  ctx.fillRect(bx, by, 1, 9); ctx.fillRect(bx + w - 1, by, 1, 9);
  p.text(text, bx + 2, by + 2, colFg, 1, 1);
};

/* 雲（巨大な顔になれる） */
P.cloud = function (p, x, y, w, h, col, face, alpha) {
  const a = alpha === undefined ? 1 : alpha;
  p.circle(x, y, h, C.css(col), a);
  p.circle(x - w * .32, y + h * .22, h * .72, C.css(col), a);
  p.circle(x + w * .34, y + h * .18, h * .78, C.css(col), a);
  p.circle(x - w * .12, y - h * .35, h * .66, C.css(col), a);
  p.circle(x + w * .14, y - h * .3, h * .6, C.css(col), a);
  const ctx = p.ctx;
  ctx.globalAlpha = a;
  ctx.fillStyle = C.css(C.scale(col, .82));
  ctx.fillRect(Math.round(x - w * .5), Math.round(y + h * .55), Math.round(w), 1);
  ctx.globalAlpha = 1;
  if (face > .01) {
    const dark = C.scale(col, .35);
    const ey = y - h * .12, ex = w * .26;
    p.circle(x - ex, ey, h * .17, C.cssa(dark, face));
    p.circle(x + ex, ey, h * .17, C.cssa(dark, face));
    // 口
    const my = y + h * .28;
    ctx.globalAlpha = face;
    ctx.fillStyle = C.css(dark);
    for (let i = -3; i <= 3; i++) {
      const yy = my + Math.round(Math.cos(i / 3 * 1.4) * -h * .1 + h * .1);
      ctx.fillRect(Math.round(x + i * w * .07), Math.round(yy), 2, 2);
    }
    ctx.globalAlpha = 1;
  }
};

/* 水面のきらめき（帯状） */
P.water = function (p, y0, y1, cx, colA, colB, t, amp) {
  const ctx = p.ctx;
  for (let y = y0; y < y1; y++) {
    const d = (y - y0) / Math.max(1, y1 - y0);
    const c = C.mix(colA, colB, d);
    ctx.fillStyle = C.css(c);
    ctx.fillRect(0, y, p.w, 1);
    // ハイライト
    const n = 3 + Math.floor(d * 8);
    ctx.fillStyle = C.css(C.scale(c, 1.5));
    for (let i = 0; i < n; i++) {
      const ph = M.hash2(y * .7, i * 3.3);
      const x = M.mod(ph * p.w + Math.sin(t * (0.6 + ph) + y * .3) * (6 + amp * 14), p.w);
      const w = 1 + Math.round(d * 3);
      ctx.fillRect(Math.round(x), y, w, 1);
    }
  }
};

/* 山脈シルエット */
P.mountains = function (p, y, h, col, seed, scroll, alpha) {
  const ctx = p.ctx;
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.fillStyle = C.css(col);
  for (let x = 0; x < p.w; x++) {
    const u = (x + scroll) * .035;
    const e = (M.fbm(u + seed, 3) * .8 + M.fbm(u * 2.7 + seed * 3, 2) * .2);
    const hh = Math.round(e * h);
    ctx.fillRect(x, y - hh, 1, hh + 2);
  }
  ctx.globalAlpha = 1;
};

/* ヤシ以外の「踊る植物」（ジャングル用シダ） */
P.fern = function (p, x, base, h, sway, colA, colB, alpha) {
  const ctx = p.ctx;
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i / (n - 1) - .5) * 1.9;
    let fx = x, fy = base;
    const steps = Math.round(h / 1.8);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const aa = ang + Math.sin(t * 2.2) * .5 * (ang < -Math.PI / 2 ? -1 : 1) + sway * t * .06;
      fx += Math.cos(aa) * 1.8;
      fy += Math.sin(aa) * 1.8;
      ctx.fillStyle = C.css(i % 2 ? colA : colB);
      const w = Math.max(1, Math.round(M.lerp(2.6, 1, t)));
      ctx.fillRect(Math.round(fx), Math.round(fy), w, w);
    }
  }
  ctx.globalAlpha = 1;
};

/* 浮遊島 */
P.island = function (p, x, y, w, colTop, colRock, alpha) {
  const ctx = p.ctx;
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  const h = w * .35;
  ctx.fillStyle = C.css(colTop);
  ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w), 2);
  ctx.fillStyle = C.css(colRock);
  for (let i = 0; i < h; i++) {
    const t = i / h;
    const ww = Math.round(w * (1 - t * t) * (1 - t * .3));
    ctx.fillRect(Math.round(x - ww / 2), Math.round(y + 2 + i), Math.max(1, ww), 1);
  }
  ctx.globalAlpha = 1;
};

})(window.PX);
