/* =====================================================================
   pixel.js — 低解像度ピクセルバッファ + ポストエフェクトパイプライン
   ---------------------------------------------------------------------
   描画は全て内部の低解像度キャンバス(既定 192px幅)に対して行う。
   present() で ImageData に対し
     [1] 幾何パス (波/リップル/メルト/万華鏡/トンネル/ズーム/回転/RGBずれ)
     [2] 色パス   (色相回転/彩度/明度/反転/ポスタライズ/ビネット/スキャンライン)
     [3] 残像パス (afterimage / pixel trails)
   を適用してから、ニアレストネイバーで実画面へ拡大する。
   ===================================================================== */
(function (PX) {
'use strict';
const M = PX.M, C = PX.C;

const DEFAULT_FX = {
  wave: 0, waveFreq: 1, waveSpeed: 1,   // 横方向の波打ち
  protect: 0, protectY: .45,            // 走行ライン保護（下ほど幾何変形を弱める）
  vwave: 0,                             // 縦方向のうねり
  ripple: 0, rippleCX: .5, rippleCY: .5,// 同心円リップル
  rgb: 0,                               // 色収差風ドットずれ
  hue: 0, sat: 0, bright: 1, invert: 0, // 色
  posterize: 0,                         // 色段階の粗さ
  trails: 0,                            // 残像
  melt: 0,                              // 画面が溶ける
  kaleido: 0, kaleidoSeg: 6, kaleidoRot: 0,
  tunnel: 0,                            // 中心へ吸い込むひねり
  zoom: 1, rot: 0,                      // 画面全体のズーム/回転
  shakeX: 0, shakeY: 0,
  vignette: 0, scan: 0,
  flash: 0, flashColor: null,
  dither: 0
};

class Pixel {
  constructor(view, baseW) {
    this.view = view;
    this.vctx = view.getContext('2d', { alpha: false });
    this.baseW = baseW || 192;
    this.fx = Object.assign({}, DEFAULT_FX);
    this.time = 0;
    this._mk(this.baseW, Math.round(this.baseW * 16 / 9));
    this.quality = 1;   // 1 = full, 0 = 重いエフェクトを間引く
    this._kalFrame = 0;
  }

  _mk(w, h) {
    this.w = w; this.h = h;
    this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h;
    this.ctx = this.cv.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.post = document.createElement('canvas'); this.post.width = w; this.post.height = h;
    this.pctx = this.post.getContext('2d', { alpha: false });
    this.pctx.imageSmoothingEnabled = false;
    this.imgOut = this.pctx.createImageData(w, h);
    this.hist = new Uint8ClampedArray(w * h * 4);
    this.srcData = null;
  }

  /* 実画面サイズに追従。内部解像度は幅固定・高さは端末アスペクト */
  setBaseWidth(w) {
    if (w === this.baseW) return;
    this.baseW = w;
    this._forceW = 0;
    this.resize();
  }

  resize() {
    let vw = window.innerWidth;
    const vh = window.innerHeight;
    // 横長の画面（PC・タブレット）でも縦画面の構図を保つ
    if (vw / vh > 0.62) vw = Math.round(vh * 0.52);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const aspect = vh / vw;
    let w = this.baseW;
    let h = Math.round(w * aspect);
    if (h % 2) h++;
    h = M.clamp(h, 240, 480);
    if (w !== this.w || h !== this.h) this._mk(w, h);

    // 内部バッファが整数倍で収まる最大スケールを選ぶ（ドットが崩れない）
    const maxScale = Math.min(vw / w, vh / h);
    let scale = Math.max(1, Math.floor(maxScale * dpr)) / dpr;
    // 端末が小さすぎて1倍未満になる場合のみ非整数を許容
    if (maxScale < 1) scale = maxScale;
    const cssW = w * scale, cssH = h * scale;
    this.view.width = Math.round(cssW * dpr);
    this.view.height = Math.round(cssH * dpr);
    this.view.style.width = cssW + 'px';
    this.view.style.height = cssH + 'px';
    this.vctx = this.view.getContext('2d', { alpha: false });
    this.vctx.imageSmoothingEnabled = false;
    this.viewRect = { w: cssW, h: cssH, left: (window.innerWidth - cssW) / 2, top: (vh - cssH) / 2 };
  }

  resetFx() { Object.assign(this.fx, DEFAULT_FX); }

  /* ------------------------------------------------------- draw helpers */
  clear(col) {
    const c = this.ctx;
    c.fillStyle = typeof col === 'string' ? col : C.css(col || [0, 0, 0]);
    c.fillRect(0, 0, this.w, this.h);
  }
  rect(x, y, w, h, col) {
    if (w <= 0 || h <= 0) return;
    const c = this.ctx;
    c.fillStyle = typeof col === 'string' ? col : C.css(col);
    c.fillRect(x | 0, y | 0, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }
  rectA(x, y, w, h, col, a) {
    if (a <= 0 || w <= 0 || h <= 0) return;
    const c = this.ctx;
    c.globalAlpha = M.sat(a);
    c.fillStyle = typeof col === 'string' ? col : C.css(col);
    c.fillRect(x | 0, y | 0, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    c.globalAlpha = 1;
  }
  px(x, y, col) { this.rect(x, y, 1, 1, col); }
  hline(x0, x1, y, col) {
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    this.rect(x0, y, x1 - x0 + 1, 1, col);
  }
  vline(x, y0, y1, col) {
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    this.rect(x, y0, 1, y1 - y0 + 1, col);
  }
  /* ドット感を保った円（走査線ベース） */
  circle(cx, cy, r, col, a) {
    if (r <= 0) return;
    const c = this.ctx;
    c.globalAlpha = a === undefined ? 1 : M.sat(a);
    c.fillStyle = typeof col === 'string' ? col : C.css(col);
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    for (let y = -r; y <= r; y++) {
      const dx = Math.floor(Math.sqrt(r * r - y * y) + .5);
      if (dx <= 0) continue;
      c.fillRect(cx - dx, cy + y, dx * 2 + 1, 1);
    }
    c.globalAlpha = 1;
  }
  ring(cx, cy, r, col, a, thick) {
    thick = thick || 1;
    const c = this.ctx;
    c.globalAlpha = a === undefined ? 1 : M.sat(a);
    c.fillStyle = typeof col === 'string' ? col : C.css(col);
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    const ri = Math.max(0, r - thick);
    for (let y = -r; y <= r; y++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)) + .5);
      const di = Math.abs(y) <= ri ? Math.floor(Math.sqrt(Math.max(0, ri * ri - y * y)) + .5) : 0;
      if (dx <= 0) continue;
      if (di <= 0) { c.fillRect(cx - dx, cy + y, dx * 2 + 1, 1); }
      else {
        c.fillRect(cx - dx, cy + y, dx - di, 1);
        c.fillRect(cx + di + 1, cy + y, dx - di, 1);
      }
    }
    c.globalAlpha = 1;
  }
  line(x0, y0, x1, y1, col, a) {
    // ブレゼンハム（アンチエイリアスなし = ドット絵）
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const c = this.ctx;
    c.globalAlpha = a === undefined ? 1 : M.sat(a);
    c.fillStyle = typeof col === 'string' ? col : C.css(col);
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    let guard = 0;
    while (guard++ < 4000) {
      c.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    c.globalAlpha = 1;
  }
  /* 縦グラデーション（バンディングを活かしたドット的ディザ付き） */
  vgrad(x, y, w, h, top, bot, dither) {
    const c = this.ctx;
    for (let i = 0; i < h; i++) {
      const t = h <= 1 ? 0 : i / (h - 1);
      let col = C.mix(top, bot, t);
      c.fillStyle = C.css(col);
      c.fillRect(x | 0, (y + i) | 0, w, 1);
      if (dither && i > 0 && i < h - 1) {
        const d = M.mod(i, 2);
        const nx = C.mix(top, bot, M.sat(t + .06));
        c.fillStyle = C.css(nx);
        for (let px = d; px < w; px += 4) c.fillRect((x + px) | 0, (y + i) | 0, 1, 1);
      }
    }
  }

  /* テキスト（3x5 ビットマップフォント） */
  text(str, x, y, col, scale, spacing, alpha) {
    scale = scale || 1; spacing = spacing === undefined ? 1 : spacing;
    const c = this.ctx;
    c.globalAlpha = alpha === undefined ? 1 : M.sat(alpha);
    c.fillStyle = typeof col === 'string' ? col : C.css(col);
    let cx = Math.round(x);
    const up = str.toUpperCase();
    for (let i = 0; i < up.length; i++) {
      const g = PX.FONT[up[i]] || PX.FONT[str[i]] || PX.FONT[' '];
      for (let ry = 0; ry < 5; ry++) {
        const m = g[ry];
        for (let rx = 0; rx < 3; rx++) {
          if (m & (1 << rx)) c.fillRect(cx + rx * scale, Math.round(y) + ry * scale, scale, scale);
        }
      }
      cx += (3 + spacing) * scale;
    }
    c.globalAlpha = 1;
  }
  textC(str, cx, y, col, scale, spacing, alpha) {
    const w = PX.textWidth(str, scale || 1, spacing === undefined ? 1 : spacing);
    this.text(str, Math.round(cx - w / 2), y, col, scale, spacing, alpha);
  }

  /* スプライト描画（行単位ブリットで揺れ/傾き/潰しを表現） */
  sprite(spr, x, y, opt) {
    if (!spr) return;
    opt = opt || {};
    const c = this.ctx;
    const sc = Math.max(0, opt.scale === undefined ? 1 : opt.scale);
    if (sc <= 0.03) return;
    const src = (opt.hue && spr.hues) ? spr.hues[M.mod(Math.round(opt.hue * spr.hues.length), spr.hues.length)] : spr.cv;
    const sw = spr.w, sh = spr.h;
    const dw = Math.max(1, Math.round(sw * sc));
    const dh = Math.max(1, Math.round(sh * sc * (opt.squash === undefined ? 1 : opt.squash)));
    const ox = Math.round(x - dw * (opt.ax === undefined ? .5 : opt.ax));
    const oy = Math.round(y - dh * (opt.ay === undefined ? 1 : opt.ay));
    c.globalAlpha = opt.alpha === undefined ? 1 : M.sat(opt.alpha);
    if (opt.additive) c.globalCompositeOperation = 'lighter';
    const flip = opt.flip ? -1 : 1;
    if (opt.sway && dh > 6) {
      // 上に行くほど横にずれる（風/踊り/呼吸）。行単位だと重いのでバンド分割。
      const rows = M.clamp(Math.round(dh / 6), 2, 6);
      const step = dh / rows;
      const sstep = sh / rows;
      for (let i = 0; i < rows; i++) {
        const t = 1 - i / (rows - 1);                   // 0(下) .. 1(上)
        const off = Math.round(opt.sway * t * t);
        c.save();
        if (flip < 0) { c.translate(ox + dw, 0); c.scale(-1, 1); c.translate(-ox, 0); }
        c.drawImage(src, 0, i * sstep, sw, sstep,
          ox + off, oy + Math.round(i * step), dw, Math.ceil(step));
        c.restore();
      }
        } else {
      c.save();
      if (flip < 0) { c.translate(ox + dw, 0); c.scale(-1, 1); c.translate(-ox, 0); }
      c.drawImage(src, 0, 0, sw, sh, ox, oy, dw, dh);
      c.restore();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  /* --------------------------------------------------------- post chain
     幾何 / 色 / 残像 を1パスに融合。80k画素を3周していたのを1周にする。 */
  present() {
    const w = this.w, h = this.h, fx = this.fx, t = this.time;
    const needGeom = fx.wave > .002 || fx.vwave > .002 || fx.ripple > .002 || fx.rgb > .002 ||
      fx.melt > .002 || fx.kaleido > .002 || fx.tunnel > .002 ||
      Math.abs(fx.zoom - 1) > .003 || Math.abs(fx.rot) > .0015 ||
      Math.abs(fx.shakeX) > .4 || Math.abs(fx.shakeY) > .4;
    const needColor = Math.abs(fx.hue) > .002 || Math.abs(fx.sat) > .01 ||
      Math.abs(fx.bright - 1) > .01 || fx.invert > .004 || fx.posterize > .01 ||
      fx.vignette > .01 || fx.scan > .01 || fx.flash > .004;
    const needTrail = fx.trails > .01;

    if (!needGeom && !needColor && !needTrail) {
      if (this.hist) this.hist.fill(0);
      this._blit(this.cv);
      return;
    }
    const src = this.ctx.getImageData(0, 0, w, h);
    this._process(src.data, this.imgOut.data, w, h, fx, t, needGeom, needColor, needTrail);
    this.pctx.putImageData(this.imgOut, 0, 0);
    this._blit(this.post);
  }

  _blit(cvs) {
    const v = this.vctx, r = this.view;
    v.imageSmoothingEnabled = false;
    v.drawImage(cvs, 0, 0, this.w, this.h, 0, 0, r.width, r.height);
  }

  _process(S, D, w, h, fx, t, doGeom, doColor, doTrail) {
    const cx = w * .5, cy = h * .5;
    const H = this.hist;

    /* ---- 幾何パラメータ ---- */
    const kal = fx.kaleido, seg = Math.max(2, fx.kaleidoSeg | 0), segA = Math.PI * 2 / seg;
    const shX = fx.shakeX || 0, shY = fx.shakeY || 0;
    const rgb = fx.rgb;
    const maxR2 = cx * cx + cy * cy;
    const maxR = Math.sqrt(maxR2);
    const rip = fx.ripple, ripCX = fx.rippleCX * w, ripCY = fx.rippleCY * h;

    const mask = this._mask || (this._mask = new Float32Array(512));
    const py = (fx.protectY === undefined ? .45 : fx.protectY) * h;
    const keep = 1 - M.sat(fx.protect === undefined ? 0 : fx.protect);
    for (let y = 0; y < h; y++) {
      mask[y] = y <= py ? 1 : M.lerp(1, keep, M.smooth((y - py) / Math.max(1, h * .20)));
    }
    const rowOff = this._rowOff || (this._rowOff = new Float32Array(512));
    for (let y = 0; y < h; y++) {
      let o = 0;
      if (fx.wave > .002) {
        const k = M.lerp(1, .55, 1 - mask[y]);
        o += Math.sin(y * .11 * fx.waveFreq + t * 2.4 * fx.waveSpeed) * fx.wave * 7 * k;
        o += Math.sin(y * .031 * fx.waveFreq - t * 1.3 * fx.waveSpeed) * fx.wave * 11 * k;
      }
      rowOff[y] = o + shX;
    }
    const colOff = this._colOff || (this._colOff = new Float32Array(512));
    const melt = this._melt || (this._melt = new Float32Array(512));
    if (fx.melt > .002) {
      for (let x = 0; x < w; x++) {
        const seed = M.hash(x * 3.77);
        const drip = .35 + .65 * Math.abs(Math.sin(t * (.25 + seed * .5) + seed * 11));
        melt[x] += ((seed * .6 + M.hash(x * .91 + 7) * .4) * drip * fx.melt * h * .34 - melt[x]) * .06;
      }
    } else for (let x = 0; x < w; x++) melt[x] *= .88;
    for (let x = 0; x < w; x++) {
      let o = melt[x];
      if (fx.vwave > .002) o += Math.sin(x * .09 + t * 1.9) * fx.vwave * 6;
      colOff[x] = o;
    }

    /* ---- 色パラメータ ---- */
    const hue = fx.hue, sat = fx.sat, br = fx.bright, inv = fx.invert;
    const post = fx.posterize, vig = fx.vignette, scan = fx.scan;
    const flash = fx.flash, fc = fx.flashColor || [255, 255, 255];
    let m0 = 1, m1 = 0, m2 = 0, m3 = 0, m4 = 1, m5 = 0, m6 = 0, m7 = 0, m8 = 1;
    const doHue = Math.abs(hue) > .002;
    if (doHue) {
      const cs = Math.cos(hue * Math.PI * 2), sn = Math.sin(hue * Math.PI * 2);
      m0 = .299 + .701 * cs + .168 * sn; m1 = .587 - .587 * cs + .330 * sn; m2 = .114 - .114 * cs - .497 * sn;
      m3 = .299 - .299 * cs - .328 * sn; m4 = .587 + .413 * cs + .035 * sn; m5 = .114 - .114 * cs + .292 * sn;
      m6 = .299 - .300 * cs + 1.250 * sn; m7 = .587 - .588 * cs - 1.050 * sn; m8 = .114 + .886 * cs - .203 * sn;
    }
    const doSat = Math.abs(sat) > .01, doBr = Math.abs(br - 1) > .01;
    const doInv = inv > .004, doFlash = flash > .004, doVig = vig > .01;
    const levels = post > .01 ? Math.max(2, Math.round(M.lerp(32, 3, post))) : 0;
    const step = levels ? 255 / (levels - 1) : 0;
    const tDecay = M.lerp(.34, .60, M.sat(fx.trails));
    const tK = M.lerp(.30, .78, M.sat(fx.trails));

    for (let y = 0; y < h; y++) {
      const rowBase = y * w;
      const mk = mask[y];
      const kalE = kal * mk, tunE = fx.tunnel * mk, rotE = (fx.rot || 0) * mk;
      const zoomE = 1 + ((fx.zoom || 1) - 1) * mk;
      const ripE = rip * (.35 + .65 * mk);
      const usePolar = kalE > .11 || tunE > .09;
      const useAffine = usePolar || Math.abs(rotE) > .0015 || Math.abs(zoomE - 1) > .003;
      const rc = useAffine ? Math.cos(rotE) : 1, rs = useAffine ? Math.sin(rotE) : 0;
      const yOffRow = colOff.length ? 0 : 0;
      const scanMul = (scan > .01 && (y & 1)) ? (1 - scan * .30) : 1;
      const dyv = y - cy, dyv2 = dyv * dyv;
      const rowX = rowOff[y];

      for (let x = 0; x < w; x++) {
        const di = (rowBase + x) << 2;
        let r, g, b;

        /* --- 幾何 --- */
        if (doGeom) {
          let sx = x - rowX;
          let sy = y - colOff[x] * mk + shY;
          if (ripE > .004) {
            const dx = x - ripCX, dy = y - ripCY;
            const d = Math.sqrt(dx * dx + dy * dy) + .001;
            const amp = Math.sin(d * .22 - t * 6.5) * ripE * 4.2 * (d < 60 ? 1 : 60 / d);
            sx += dx / d * amp; sy += dy / d * amp;
          }
          if (useAffine) {
            let dx = sx - cx, dy = sy - cy;
            if (zoomE !== 1) { dx /= zoomE; dy /= zoomE; }
            if (rotE) { const nx = dx * rc - dy * rs; dy = dx * rs + dy * rc; dx = nx; }
            if (usePolar) {
              if (tunE > .09) {
                const rr0 = Math.sqrt(dx * dx + dy * dy) + .001;
                const a = Math.atan2(dy, dx) + tunE * (1.6 - rr0 / maxR * 1.4) * 1.1;
                const rr = rr0 * (1 - tunE * .18 * Math.sin(rr0 * .06 - t * 2.2));
                dx = Math.cos(a) * rr; dy = Math.sin(a) * rr;
              }
              if (kalE > .11) {
                const rr = Math.sqrt(dx * dx + dy * dy);
                let fa = M.mod(Math.atan2(dy, dx) + fx.kaleidoRot, segA);
                if (fa > segA * .5) fa = segA - fa;
                const ka = fa - segA * .5 + 1.5707963;
                dx += (Math.cos(ka) * rr - dx) * kalE;
                dy += (Math.sin(ka) * rr - dy) * kalE;
              }
            }
            sx = cx + dx; sy = cy + dy;
          }
          let ix = sx | 0, iy = sy | 0;
          if (ix < 0) ix = -ix % w; else if (ix >= w) ix = w - 1 - (ix - w) % w;
          if (iy < 0) iy = -iy % h; else if (iy >= h) iy = h - 1 - (iy - h) % h;
          if (rgb > .002) {
            const d = rgb * 3.2 * (.4 + .6 * mk);
            let rx = (sx - d) | 0, bx = (sx + d) | 0;
            if (rx < 0) rx = 0; else if (rx >= w) rx = w - 1;
            if (bx < 0) bx = 0; else if (bx >= w) bx = w - 1;
            const rowS = iy * w;
            r = S[(rowS + rx) << 2];
            g = S[((rowS + ix) << 2) + 1];
            b = S[((rowS + bx) << 2) + 2];
          } else {
            const si = (iy * w + ix) << 2;
            r = S[si]; g = S[si + 1]; b = S[si + 2];
          }
        } else {
          r = S[di]; g = S[di + 1]; b = S[di + 2];
        }

        /* --- 色 --- */
        if (doColor) {
          if (doHue) {
            const nr = r * m0 + g * m1 + b * m2;
            const ng = r * m3 + g * m4 + b * m5;
            const nb = r * m6 + g * m7 + b * m8;
            r = nr; g = ng; b = nb;
          }
          if (doSat) {
            const l = r * .299 + g * .587 + b * .114;
            r = l + (r - l) * (1 + sat); g = l + (g - l) * (1 + sat); b = l + (b - l) * (1 + sat);
          }
          if (doBr) { r *= br; g *= br; b *= br; }
          if (doInv) { r += (255 - r - r) * inv; g += (255 - g - g) * inv; b += (255 - b - b) * inv; }
          if (doFlash) { r += (fc[0] - r) * flash; g += (fc[1] - g) * flash; b += (fc[2] - b) * flash; }
          if (scanMul !== 1) { r *= scanMul; g *= scanMul; b *= scanMul; }
          if (doVig) {
            const dxv = x - cx;
            const k = 1 - vig * ((dxv * dxv + dyv2) / maxR2) * 1.15;
            r *= k; g *= k; b *= k;
          }
          if (levels) {
            r = Math.round(r / step) * step; g = Math.round(g / step) * step; b = Math.round(b / step) * step;
          }
          r = r < 0 ? 0 : r > 255 ? 255 : r;
          g = g < 0 ? 0 : g > 255 ? 255 : g;
          b = b < 0 ? 0 : b > 255 ? 255 : b;
        }

        /* --- 残像 --- */
        if (doTrail) {
          const pr = H[di] * tDecay, pg = H[di + 1] * tDecay, pb = H[di + 2] * tDecay;
          if (pr > r) r += (pr - r) * tK;
          if (pg > g) g += (pg - g) * tK;
          if (pb > b) b += (pb - b) * tK;
          H[di] = r; H[di + 1] = g; H[di + 2] = b;
        }

        D[di] = r; D[di + 1] = g; D[di + 2] = b; D[di + 3] = 255;
      }
    }
  }

  clearHistory() { if (this.hist) this.hist.fill(0); }
}

PX.Pixel = Pixel;
})(window.PX);
