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

/* パレットだけ差し替えて別キャラにする（服・髪・肌の色替え） */
function recolor(art, map) {
  const pal = {};
  for (const k in art.pal) pal[k] = map[k] || art.pal[k];
  return { pal, rows: art.rows };
}
PX.recolorArt = recolor;

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

/* ------- キャラのバリエーション（使い回し感を消す） ----------------- */
A.walk1b = recolor(A.walk1, { c: '#c85a6a', p: '#3a2a3a', h: '#4a2a18' });
A.walk2b = recolor(A.walk2, { c: '#c85a6a', p: '#3a2a3a', h: '#4a2a18' });
A.walk1c = recolor(A.walk1, { c: '#4aa870', p: '#24303a', h: '#161018', s: '#c08858' });
A.walk2c = recolor(A.walk2, { c: '#4aa870', p: '#24303a', h: '#161018', s: '#c08858' });
A.hula1b = recolor(A.hula1, { l: '#50d0e0', g: '#ff8a4a', y: '#e06a2a', h: '#4a2a10', s: '#c88858' });
A.hula2b = recolor(A.hula2, { l: '#50d0e0', g: '#ff8a4a', y: '#e06a2a', h: '#4a2a10', s: '#c88858' });
A.hula1c = recolor(A.hula1, { l: '#b070ff', g: '#70e0a0', y: '#3aa870', h: '#181018', s: '#f0c090' });
A.hula2c = recolor(A.hula2, { l: '#b070ff', g: '#70e0a0', y: '#3aa870', h: '#181018', s: '#f0c090' });

/* 子ども（小さい） */
A.kid = {
  pal: { h: '#3a2418', s: '#f0c098', c: '#f0d055', p: '#5a4a8a', k: '#201820' },
  rows: ['.hhh.', 'hsssh', '.sss.', 'ccccc', '.ccc.', '.ppp.', '.p.p.', 'k...k']
};
/* ローブの人物（クライマックスの群衆） */
A.robed = {
  pal: { r: '#6a3ac0', d: '#4a2490', l: '#c0a0ff', s: '#f0d0b0', k: '#1a1028' },
  rows: [
    '...lll...', '..lsssl..', '..lsssl..', '..lllll..',
    '.rrrrrrr.', 'rrrrrrrrr', 'rrrdrdrrr', 'rrrrrrrrr',
    '.rrrrrrr.', '.rrrrrrr.', '.rrrrrrr.', '.dd...dd.'
  ]
};
/* 宇宙人（抽象/宇宙ゾーン） */
A.alien = {
  pal: { g: '#8ae06a', d: '#4a9040', k: '#101810', w: '#ffffff', c: '#40d0ff' },
  rows: [
    '..ggggg..', '.ggggggg.', 'gkgggggkg', 'gkgggggkg', '.ggggggg.',
    '..ggggg..', '...ggg...', '..ggggg..', '.gg.g.gg.', '.dd...dd.',
    '..d.....d', '..d.....d'
  ]
};
/* 二足歩行の猫（サイケゾーンの住人） */
A.catStand = {
  pal: { f: '#e0b070', d: '#b0803a', k: '#241a20', y: '#ffe070', p: '#ff8aa0' },
  rows: [
    '.f.....f.', 'ff.....ff', 'fffffffff', 'fyffffffy', 'ffffpffff',
    '.fffffff.', '..fffff..', '.fffffff.', '.ff...ff.', '.dd...dd.',
    '..d...d..', '.dd...dd.'
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

/*
  carRear — 後方から見た自車。三人称の主役なので手を入れてある。
  halfW: 画面上の半車幅(px)。すべての寸法をこれ基準にするので
  遠近で拡大縮小しても比率が崩れない。
  o: {bank, bounce, brake, beat, body, glass, hue}
*/
P.carRear = function (p, x, base, halfW, o) {
  o = o || {};
  const ctx = p.ctx;
  const u = halfW / 9;                       // 基本単位
  if (u < .18) return;
  const W = Math.round(halfW * 2);
  const bank = o.bank || 0;
  const bounce = Math.round((o.bounce || 0) * u * .9);
  const body = o.body || [190, 60, 90];
  const dark = C.scale(body, .55);
  const dark2 = C.scale(body, .34);
  const hi = C.scale(body, 1.28);
  const glass = o.glass || [70, 92, 130];
  const x0 = Math.round(x - halfW);
  const y = Math.round(base) + bounce;
  const R = (dx, dy, w2, h2, c, a) => {
    if (a === undefined) p.rect(x0 + dx * u, y + dy * u, Math.max(1, w2 * u), Math.max(1, h2 * u), c);
    else p.rectA(x0 + dx * u, y + dy * u, Math.max(1, w2 * u), Math.max(1, h2 * u), c, a);
  };

  /* 影（接地感） */
  ctx.globalAlpha = .38;
  ctx.fillStyle = '#000';
  for (let i = 0; i < Math.max(1, Math.round(u * 1.6)); i++) {
    const k = i / Math.max(1, u * 1.6);
    const ww = W * (1.06 - k * .3);
    ctx.fillRect(Math.round(x - ww / 2), y - i, Math.round(ww), 1);
  }
  ctx.globalAlpha = 1;

  /* タイヤ */
  R(-0.4, -3.2, 2.6, 3.2, [22, 20, 28]);
  R(15.8, -3.2, 2.6, 3.2, [22, 20, 28]);
  R(-0.2, -2.6, 2.2, 1.1, [58, 56, 70]);
  R(16.0, -2.6, 2.2, 1.1, [58, 56, 70]);

  /* 車体下部 → 上部 */
  R(0.6, -4.2, 16.8, 1.2, dark2);                    // バンパー下
  R(0.2, -7.0, 17.6, 2.9, dark);                     // バンパー
  R(0.8, -10.4, 16.4, 3.5, body);                    // ボディ
  R(0.8, -10.4, 16.4, .8, hi);                       // ハイライト
  R(1.0, -7.6, 16.0, .6, C.scale(body, .8));         // プレスライン

  /* キャビン（バンクでわずかにずれる = 車が傾いて見える） */
  const bx = bank * 1.1;
  R(3.2 + bx, -15.6, 11.6, 5.4, C.mix(body, dark, .28));
  R(3.2 + bx, -15.6, 11.6, .7, C.scale(body, 1.12));
  R(4.2 + bx, -14.8, 9.6, 3.7, glass);               // リアガラス
  R(4.2 + bx, -14.8, 9.6, .8, C.mix(glass, [255, 255, 255], .35));
  R(8.6 + bx, -14.8, .7, 3.7, C.mix(body, dark, .5)); // ガラスの桟
  // ルーフ
  R(3.6 + bx, -16.4, 10.8, .9, C.scale(body, .92));
  // スポイラー
  R(2.2, -11.2, 13.6, .9, dark);
  R(2.2, -11.9, 1.4, .9, dark);
  R(14.4, -11.9, 1.4, .9, dark);

  /* テールランプ（ビートで光る） */
  const glow = M.sat(.45 + (o.beat || 0) * .8 + (o.brake || 0));
  const lamp = C.mix([210, 40, 50], [255, 170, 150], glow * .55);
  R(1.4, -9.6, 3.4, 1.9, lamp);
  R(13.2, -9.6, 3.4, 1.9, lamp);
  if (glow > .5 && u > .5) {
    p.circle(x0 + 3.1 * u, y - 8.6 * u, u * 2.4, C.cssa(lamp, .16 * glow));
    p.circle(x0 + 14.9 * u, y - 8.6 * u, u * 2.4, C.cssa(lamp, .16 * glow));
  }
  // ナンバー灯
  R(7.6, -6.4, 2.8, 1.3, C.mix([230, 226, 210], body, .25));
  // 排気
  R(2.0, -4.6, 1.6, .8, [40, 38, 48]);
  R(13.8, -4.6, 1.6, .8, [40, 38, 48]);
};


/* =====================================================================
   遠近のある建物 / 立体感のある樹木
   ここが「オブジェクトが荒い・遠近法が働いていない」への回答。
   ===================================================================== */

/*
  building2 — 正面 + 側面（消失点へ後退する面）+ 屋根で立体に見せる。
  x は「道路側の内側エッジ」の位置。建物は必ず外側へ伸びるので、
  どれだけ巨大化しても道路にはみ出さない。
  o: {vx, vy, k, w, h, tall, seed, alpha, melt, breathe, win, winOff, body, roof, beatWin, blink, dir}
     dir : +1 = 画面右側にある（左面が見える） / -1 = 左側（右面が見える）
     k   : 側面の後退量 0..1（奥行き / (距離+奥行き)）
*/
P.building2 = function (p, x, base, o) {
  const ctx = p.ctx;
  const a = o.alpha === undefined ? 1 : o.alpha;
  if (a <= .01) return;
  const w = Math.max(3, Math.round(o.w));
  const h = Math.max(4, Math.round(o.h * (1 + (o.breathe || 0) * .04)));
  const dir = o.dir >= 0 ? 1 : -1;
  const k = M.clamp(o.k === undefined ? .3 : o.k, .04, .78);
  const vx = o.vx, vy = o.vy;
  const tall = M.sat(o.tall || 0);
  const melt = M.sat(o.melt || 0);
  const body = o.body || [60, 54, 82];
  const side = C.scale(body, .62);
  const roofC = o.roof || C.scale(body, .8);
  const winOn = o.win || [255, 214, 140];
  const winOff = o.winOff || C.scale(body, .55);
  const seed = o.seed || 1;

  // 正面の矩形（内側エッジ x から外側 dir 方向へ）
  const xIn = Math.round(x);
  const xOut = Math.round(x + dir * w);
  const fx0 = Math.min(xIn, xOut), fx1 = Math.max(xIn, xOut);
  const yTop = Math.round(base - h), yBase = Math.round(base);
  ctx.globalAlpha = a;

  /* --- 側面（内側エッジから消失点へ後退） --- */
  const xf = xIn + (vx - xIn) * k;
  const yTopF = yTop + (vy - yTop) * k;
  const yBaseF = yBase + (vy - yBase) * k;
  const step = xf >= xIn ? 1 : -1;
  const nCols = Math.abs(Math.round(xf - xIn));
  if (nCols > 0) {
    for (let i = 0; i <= nCols; i++) {
      const t = i / nCols;
      const cx2 = xIn + step * i;
      const ty = Math.round(M.lerp(yTop, yTopF, t));
      const by = Math.round(M.lerp(yBase, yBaseF, t));
      if (by <= ty) continue;
      ctx.fillStyle = C.css(C.mix(side, C.scale(side, .72), t));
      ctx.fillRect(cx2, ty, 1, by - ty);
    }
    // 側面の窓（奥行きが伝わる）
    const sc2 = Math.max(2, Math.round(h / 9));
    for (let i = 2; i < nCols - 1; i += Math.max(3, Math.round(nCols / 3))) {
      const t = i / nCols;
      for (let r = 0; r < Math.max(1, Math.floor(h / (sc2 * 2))); r++) {
        const ty = M.lerp(yTop, yTopF, t) + sc2 * (1 + r * 2);
        if (ty > M.lerp(yBase, yBaseF, t) - 2) break;
        const on = M.hash2(i * 1.7 + seed, r * 2.3) > .45;
        ctx.fillStyle = C.css(C.mix(on ? winOn : winOff, side, .45));
        ctx.fillRect(xIn + step * i, Math.round(ty), Math.max(1, Math.round(sc2 * .7)), Math.max(1, Math.round(sc2 * .8)));
      }
    }
  }

  /* --- 屋根 --- */
  if (tall < .65) {
    const rh = Math.max(2, Math.round(h * .26 * (1 - tall)));
    ctx.fillStyle = C.css(roofC);
    for (let i = 0; i < rh; i++) {
      const t = i / Math.max(1, rh - 1);
      const ww = Math.round(w * (.12 + .88 * t)) + 2;
      const rx = dir > 0 ? xIn - 1 : xIn + 1 - ww;
      ctx.fillStyle = C.css(C.mix(C.scale(roofC, 1.18), roofC, t));
      ctx.fillRect(rx, yTop - rh + i, ww, 1);
    }
    // 屋根の側面
    if (nCols > 0) {
      ctx.fillStyle = C.css(C.scale(roofC, .68));
      for (let i = 0; i <= nCols; i++) {
        const t = i / nCols;
        const ty = Math.round(M.lerp(yTop - rh, yTopF - rh * (1 - t * .5), t));
        ctx.fillRect(xIn + step * i, ty, 1, Math.max(1, Math.round(rh * (1 - t * .5))));
      }
    }
  } else {
    // 屋上（上面が見える）
    ctx.fillStyle = C.css(C.scale(body, 1.2));
    ctx.fillRect(fx0, yTop - 2, w, 2);
    if (nCols > 0) {
      for (let i = 0; i <= nCols; i++) {
        const t = i / nCols;
        ctx.fillStyle = C.css(C.mix(C.scale(body, 1.1), C.scale(body, .8), t));
        ctx.fillRect(xIn + step * i, Math.round(M.lerp(yTop - 2, yTopF - 2, t)), 1, 2);
      }
    }
    ctx.fillStyle = C.css(o.antenna || [255, 70, 100]);
    ctx.fillRect(Math.round((fx0 + fx1) / 2), yTop - 8, 1, 7);
    if (o.blink) ctx.fillRect(Math.round((fx0 + fx1) / 2) - 1, yTop - 9, 3, 2);
  }

  /* --- 正面 --- */
  ctx.fillStyle = C.css(body);
  ctx.fillRect(fx0, yTop, w, h);
  ctx.fillStyle = C.css(C.scale(body, 1.14));
  ctx.fillRect(fx0, yTop, w, 1);
  ctx.fillStyle = C.css(C.scale(body, .78));
  ctx.fillRect(dir > 0 ? fx1 - 1 : fx0, yTop, 1, h);

  /* --- 正面の窓 --- */
  const ws = Math.max(2, Math.round(Math.min(w / 3.2, h / 6)));
  const cols = Math.max(1, Math.floor((w - 2) / (ws + 2)));
  const rowsN = Math.max(1, Math.floor((h - 2) / (ws + 3)));
  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = fx0 + 2 + c * (ws + 2);
      const wy = yTop + 3 + r * (ws + 3);
      if (wy + ws > yBase - 1 || wx + ws > fx1 - 1) continue;
      const hsh = M.hash2(c + seed * 7.3, r + seed * 2.1);
      if (melt > .3 && hsh > .55) {
        P.star(p, wx + ws / 2, wy + ws / 2, 1 + melt * 2, '#ffffff', a * M.sat((melt - .3) / .5));
        continue;
      }
      let on = hsh > .38;
      if (o.beatWin !== undefined) on = hsh > .38 - o.beatWin * .35;
      const blink = o.blink && M.hash2(c * 3.1 + seed, r * 1.7) < o.blink;
      ctx.fillStyle = C.css(on ? winOn : winOff);
      if (blink) ctx.fillRect(wx, wy + Math.floor(ws / 2), ws, 1);
      else {
        ctx.fillRect(wx, wy, ws, ws);
        if (on && ws >= 3) {
          ctx.fillStyle = C.css(C.mix(winOn, [255, 255, 255], .4));
          ctx.fillRect(wx, wy, ws, 1);
        }
      }
    }
  }
  // 1階のドア（低層のみ）
  if (tall < .5 && h > 10) {
    const dw = Math.max(2, Math.round(ws * 1.1)), dh = Math.max(3, Math.round(ws * 1.8));
    const dx = Math.round((fx0 + fx1) / 2 - dw / 2);
    ctx.fillStyle = C.css(C.scale(body, .5));
    ctx.fillRect(dx, yBase - dh, dw, dh);
    ctx.fillStyle = C.css(C.mix(winOn, body, .4));
    ctx.fillRect(dx + dw - 1, yBase - Math.round(dh * .55), 1, 1);
  }
  ctx.globalAlpha = 1;
};

/*
  tree2 — 立体感のある樹木。species で見た目を変える。
  0: 広葉樹（丸） / 1: 針葉樹（円錐） / 2: 細長い樹（ポプラ）
  m: 0=通常樹 1=ヤシ 2=星化（従来の tree と同じモーフ軸）
*/
P.tree2 = function (p, x, base, h, o) {
  const m = o.m || 0;
  const palm = M.sat(m), star = M.sat(m - 1);
  if (palm > .35 || star > .01) { P.tree(p, x, base, h, m, o.sway || 0, o.colA, o.colB, o.alpha); return; }
  const ctx = p.ctx;
  const a = o.alpha === undefined ? 1 : o.alpha;
  const sp = o.species | 0;
  const sway = o.sway || 0;
  const colA = o.colA || [92, 162, 78];        // 明部
  const colB = o.colB || [52, 110, 58];        // 暗部
  const rim = C.mix(colA, [255, 255, 230], .28);
  const trunk = o.trunk || [78, 56, 42];
  ctx.globalAlpha = a;

  // 幹
  const th = h * (sp === 1 ? .22 : sp === 2 ? .30 : .40);
  const tw = Math.max(1, Math.round(h * .075));
  for (let i = 0; i < th; i++) {
    const t = i / th;
    const ww = Math.max(1, Math.round(tw * (1 - t * .35)));
    const bx = x + sway * t * t * .5;
    ctx.fillStyle = C.css(C.mix(trunk, C.scale(trunk, 1.3), t * .4));
    ctx.fillRect(Math.round(bx - ww / 2), Math.round(base - i), ww, 1);
    ctx.fillStyle = C.css(C.scale(trunk, .7));
    ctx.fillRect(Math.round(bx - ww / 2), Math.round(base - i), 1, 1);
  }
  const topX = x + sway * .5, topY = base - th;

  if (sp === 1) {
    // 針葉樹: 段重ねの三角
    const tiers = 3;
    for (let s2 = 0; s2 < tiers; s2++) {
      const ft = s2 / tiers;
      const cy = topY - h * (.10 + ft * .52);
      const rw = h * (.34 - ft * .10);
      const hh = h * .30;
      for (let i = 0; i < hh; i++) {
        const t = i / hh;
        const ww = rw * (1 - t);
        const off = sway * (ft + t * .3) * .6;
        ctx.fillStyle = C.css(C.mix(colB, colA, t * .5 + .18));
        ctx.fillRect(Math.round(topX - ww + off), Math.round(cy - i), Math.max(1, Math.round(ww * 2)), 1);
      }
      ctx.fillStyle = C.css(rim);
      ctx.fillRect(Math.round(topX - rw * .5 + sway * ft * .6), Math.round(cy - hh * .55), Math.max(1, Math.round(rw * .5)), 1);
    }
  } else {
    // 広葉樹 / ポプラ: 塊を重ねて陰影をつける
    const rx = h * (sp === 2 ? .17 : .30);
    const ry = h * (sp === 2 ? .40 : .28);
    const cy = topY - ry * .72;
    const blobs = sp === 2
      ? [[0, 0, 1], [0, -.5, .8], [0, .45, .85]]
      : [[0, 0, 1], [-.62, .22, .66], [.64, .16, .62], [-.2, -.6, .6], [.3, -.52, .56]];
    // 暗部を先に置く
    for (const bl of blobs) {
      const bx = topX + bl[0] * rx + sway * .8, by = cy + bl[1] * ry;
      p.circle(bx, by + ry * .16, rx * bl[2], C.css(colB), a);
    }
    // 明部
    for (const bl of blobs) {
      const bx = topX + bl[0] * rx + sway * .8, by = cy + bl[1] * ry;
      p.circle(bx - rx * .1, by - ry * .12, rx * bl[2] * .82, C.css(colA), a);
    }
    // 左上のリムライト
    p.circle(topX - rx * .42 + sway * .8, cy - ry * .5, rx * .34, C.css(rim), a * .85);
    // 葉のディザ（輪郭を柔らかく）
    ctx.fillStyle = C.css(colA);
    for (let i = 0; i < 10; i++) {
      const ang = M.hash(i * 3.1 + h) * 6.28;
      const rr = rx * (.85 + M.hash(i * 7.7) * .3);
      ctx.fillRect(Math.round(topX + Math.cos(ang) * rr + sway * .8),
                   Math.round(cy + Math.sin(ang) * rr * (ry / rx)), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
};

/* =====================================================================
   対称構造 — サイケデリックを「美しく」するための道具
   ---------------------------------------------------------------------
   ランダムに物を散らしても混沌にしかならない。
   実際のサイケデリック体験の視覚は、放射対称・入れ子・自己相似で構成される。
   ここではその3つを明示的に描く。
   ===================================================================== */

/* 調和の取れた配色を作る（黄金角で回すので隣接色が濁らない） */
P.harmony = function (baseHue, i, light) {
  const GOLD = 0.381966;
  return C.hsl(M.mod(baseHue + i * GOLD, 1), .82, light === undefined ? .58 : light);
};

/*
  mandala — N回対称の曼荼羅。
  半径は等比数列（自己相似）、リングごとに逆回転、拍で脈動する。
  N は 6/8/12 のように割り切れる数にすると図形として決まる。
*/
P.mandala = function (p, cx, cy, R, o) {
  o = o || {};
  const ctx = p.ctx;
  const N = o.fold || 8;
  const rings = o.rings || 5;
  const ratio = o.ratio || 0.68;
  const rot = o.rot || 0;
  const a = o.alpha === undefined ? 1 : o.alpha;
  const hue = o.hue || 0;
  const beat = o.beat || 0;
  if (a <= .01 || R < 3) return;

  for (let ri = 0; ri < rings; ri++) {
    const rr = R * Math.pow(ratio, ri) * (1 + beat * .05 * (ri % 2 ? -1 : 1));
    if (rr < 1.5) break;
    const dir = ri % 2 ? -1 : 1;
    const ang0 = rot * dir * (1 + ri * .35);
    const col = P.harmony(hue, ri, .52 + (ri % 2) * .16);
    const ringA = a * (.85 - ri * .09) * (.7 + beat * .3);
    // リングの円弧そのもの
    if (ri < rings - 1) p.ring(cx, cy, rr, C.css(col), ringA * .32, 1);
    // N回対称のモチーフ
    for (let k = 0; k < N; k++) {
      const th = ang0 + k / N * Math.PI * 2;
      const x = cx + Math.cos(th) * rr;
      const y = cy + Math.sin(th) * rr * (o.squash || 1);
      const s = Math.max(1, rr * .17 * (1 + beat * .12));
      const motif = (ri + (o.motif || 0)) % 4;
      if (motif === 0) p.circle(x, y, s, C.css(col), ringA);
      else if (motif === 1) P.star(p, x, y, s * 1.25, C.css(col), ringA);
      else if (motif === 2) {
        // ひし形
        ctx.globalAlpha = ringA; ctx.fillStyle = C.css(col);
        const si = Math.max(1, Math.round(s));
        for (let d = -si; d <= si; d++) {
          const w = si - Math.abs(d);
          if (w <= 0) continue;
          ctx.fillRect(Math.round(x - w), Math.round(y + d), w * 2, 1);
        }
        ctx.globalAlpha = 1;
      } else {
        // 花弁（中心へ向かう楔）
        ctx.globalAlpha = ringA; ctx.fillStyle = C.css(col);
        const steps = Math.max(2, Math.round(s * 1.6));
        for (let d = 0; d < steps; d++) {
          const t = d / steps;
          const px2 = M.lerp(x, cx, t), py2 = M.lerp(y, cy, t);
          const w = Math.max(1, Math.round(s * (1 - t) * .8));
          ctx.fillRect(Math.round(px2 - w / 2), Math.round(py2 - w / 2), w, w);
        }
        ctx.globalAlpha = 1;
      }
    }
  }
  // 中心
  p.circle(cx, cy, Math.max(1, R * .06 * (1 + beat * .3)), C.css(P.harmony(hue, rings, .85)), a * .9);
};

/*
  recursiveFrames — 入れ子の多角形が消失点へ吸い込まれていく。
  一定比率で縮小しながら一定角度ずつ回転するので、無限後退に見える。
  「気づいたら同じ景色の内側にいる」というあの感覚の視覚化。
*/
P.recursiveFrames = function (p, cx, cy, R, o) {
  o = o || {};
  const sides = o.sides || 6;
  const n = o.depth || 9;
  const ratio = o.ratio || .78;
  const twist = o.twist || .22;
  const a = o.alpha === undefined ? 1 : o.alpha;
  const hue = o.hue || 0;
  const phase = o.phase || 0;      // 0..1 でひとつ内側へスクロール
  if (a <= .01) return;
  for (let i = 0; i < n; i++) {
    const t = i + phase;
    const rr = R * Math.pow(ratio, t);
    if (rr < 1.2) break;
    const rot = (o.rot || 0) + t * twist;
    const col = P.harmony(hue, i, .5 + (i % 2) * .2);
    const al = a * (1 - i / n) * .8;
    let px0 = 0, py0 = 0;
    for (let k = 0; k <= sides; k++) {
      const th = rot + k / sides * Math.PI * 2;
      const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr * (o.squash || 1);
      if (k > 0) p.line(px0, py0, x, y, C.css(col), al);
      px0 = x; py0 = y;
    }
  }
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
