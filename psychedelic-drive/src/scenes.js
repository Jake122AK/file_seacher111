/* =====================================================================
   scenes.js — 導入(家) と 終幕(帰宅)
   ---------------------------------------------------------------------
   ここでは「これからサイケが始まります」という演出を一切しない。
   ただの夕方の家。キノコをタップして食べ、数秒何も起きず、家を出て、
   車に乗り、エンジンをかける。それだけ。
   ===================================================================== */
(function (PX) {
'use strict';
const M = PX.M, C = PX.C, D = PX.draw;

/* 室内・屋外で共有する簡易パレット取得 */
function pal(name) { return PX.PALETTES[name]; }

/* ------------------------------------------------------- 屋外の描画 */
function drawExterior(p, o) {
  // o: {t, night, carX, doorOpen, headlights, personX, personFrame, catRainbow}
  const P = o.night ? pal('night') : pal('suburb');
  const hz = Math.round(p.h * .40);
  const yardY = Math.round(p.h * .60);   // 家が建つ地面
  const walkY = yardY + 12;              // 歩道
  const roadY = walkY + 4;               // 車道の始まり
  const roadH = Math.round(p.h * .17);
  const curbY = roadY + roadH;

  /* 空 */
  p.vgrad(0, 0, p.w, hz + 2, P.skyTop, P.skyLow, true);
  if (o.night) {
    for (let i = 0; i < 90; i++) {
      const x = M.hash(i * 3.1) * p.w, y = M.hash(i * 7.7) * hz * .92;
      p.rectA(x, y, 1, 1, [255, 255, 240], .2 + .6 * M.hash(i * 1.3) * (.6 + .4 * Math.sin(o.t * 2 + i)));
    }
    p.circle(p.w * .74, hz * .30, 9, C.cssa(P.sun, .95));
    p.circle(p.w * .70, hz * .27, 2, C.cssa(C.scale(P.sun, .86), .95));
    p.circle(p.w * .74, hz * .30, 17, C.cssa(P.sun, .06));
  } else {
    p.circle(p.w * .76, hz - 16, 15, C.cssa(P.sun, .95));
    p.circle(p.w * .76, hz - 16, 26, C.cssa(P.sun, .09));
    for (let i = 0; i < 5; i++) {
      D.cloud(p, M.mod(i * 47 + o.t * 1.6, p.w + 70) - 35, hz * (.24 + i * .13), 30, 3.4, P.cloud, 0, .8);
    }
  }

  /* 遠景の家並み（不揃いに、隙間を空けて） */
  for (let i = 0; i < 12; i++) {
    const x = i * 18 - 6 + M.hash(i * 2.3) * 5;
    if (M.hash(i * 9.1) < .12) continue;
    const w2 = 13 + M.hash(i * 5.5) * 7;
    const h2 = 12 + M.hash(i * 3.3) * 11;
    D.building(p, x, hz + 3, w2, h2, 0, {
      alpha: 1, body: C.mix(P.mid, P.far, .45), roof: C.mix(P.accentC, P.mid, .55),
      win: o.night ? P.lightGlow : C.mix(P.lightGlow, P.mid, .55),
      winOff: C.mix(P.mid, [0, 0, 0], .45), seed: i + 2
    });
  }
  /* 遠景の木 */
  for (let i = 0; i < 7; i++) {
    const x = 10 + i * 30 + M.hash(i * 4.1) * 12;
    D.tree(p, x, hz + 3, 13 + M.hash(i * 6.6) * 6, 0, Math.sin(o.t * .6 + i) * .8,
      C.mix(P.mid, [58, 92, 60], .55), C.mix(P.far, [40, 68, 46], .55), .95);
  }

  /* 芝生 → 歩道 → 車道 → 手前の芝生 */
  const lawn = C.mix(P.ground, [56, 74, 52], o.night ? .18 : .35);
  p.vgrad(0, hz + 2, p.w, yardY - hz, C.mix(lawn, P.fog, .35), lawn, true);
  p.rect(0, yardY, p.w, walkY - yardY, C.mix(P.ground, [130, 128, 122], .45));
  p.rect(0, yardY, p.w, 1, C.mix(P.ground, [160, 158, 150], .5));
  for (let x = 0; x < p.w; x += 13) p.rect(x, yardY + 1, 1, walkY - yardY - 1, C.mix(P.ground, [96, 94, 90], .4));
  p.rect(0, walkY, p.w, roadY - walkY, C.mix(P.rumble, P.ground, .4));
  p.rect(0, roadY, p.w, roadH, P.road);
  p.rect(0, roadY, p.w, 1, C.mix(P.road, P.line, .35));
  for (let x = -8; x < p.w; x += 22) p.rect(x, roadY + Math.round(roadH * .52), 11, 1, P.line);
  p.rect(0, curbY, p.w, 3, C.mix(P.rumble, P.ground, .4));
  p.rect(0, curbY + 3, p.w, p.h - curbY - 3, C.mix(lawn, [0, 0, 0], .25));
  // 手前の草と生垣（奥行きの額縁）
  for (let i = 0; i < 90; i++) {
    const gx2 = M.hash(i * 2.9) * p.w;
    const gy2 = curbY + 5 + M.hash(i * 5.1) * (p.h - curbY - 8);
    p.rectA(gx2, gy2, 1, 2, C.mix(lawn, [70, 104, 66], .5), .3);
  }
  for (let i = 0; i < 26; i++) {
    const bx = i * 9 - 4 + M.hash(i * 7.3) * 5;
    p.circle(bx, p.h - 4, 8 + M.hash(i * 2.1) * 5, C.css(C.mix(lawn, [30, 58, 40], .75)));
  }

  /* 前庭の草の質感 */
  for (let i = 0; i < 110; i++) {
    const gx2 = M.hash(i * 1.7) * p.w;
    const gy2 = hz + 4 + M.hash(i * 3.9) * (yardY - hz - 6);
    const d = (gy2 - hz) / Math.max(1, yardY - hz);
    p.rectA(gx2, gy2, 1, 1 + (d > .5 ? 1 : 0), C.mix(lawn, [96, 132, 84], .55), .30 + d * .35);
  }
  // 柵
  for (let x = 2; x < p.w * .58; x += 7) {
    p.rect(x, yardY - 11, 1, 11, C.mix(P.near, [130, 122, 116], .45));
  }
  p.rect(0, yardY - 9, Math.round(p.w * .58), 1, C.mix(P.near, [130, 122, 116], .40));

  /* 主人公の家（右） */
  const hx = Math.round(p.w * .70), hb = yardY;
  const hw = 74, hh = 46;
  const wall2 = C.mix(P.near, [156, 128, 122], .58);
  const roof2 = C.mix(P.accentC, [92, 52, 60], .6);
  // 壁
  p.rect(hx - hw / 2, hb - hh, hw, hh, wall2);
  p.rect(hx - hw / 2, hb - hh, hw, 2, C.scale(wall2, 1.12));
  // 屋根
  for (let i = 0; i < 17; i++) {
    const t = i / 16;
    const ww2 = Math.round(hw * (.10 + .95 * t)) + 6;
    p.rect(Math.round(hx - ww2 / 2), hb - hh - 17 + i, ww2, 1, C.mix(roof2, C.scale(roof2, 1.25), 1 - t));
  }
  // 煙突
  p.rect(hx + 16, hb - hh - 24, 7, 12, C.mix(roof2, [70, 50, 54], .5));
  p.rect(hx + 15, hb - hh - 26, 9, 3, C.scale(roof2, .8));
  // 窓（2階/1階）
  const winC = o.night ? P.lightGlow : C.mix(P.lightGlow, P.mid, .35);
  const winF = C.mix(wall2, [40, 34, 44], .6);
  const drawWin = (wx2, wy2, ww2, wh2, lit) => {
    p.rect(wx2 - 1, wy2 - 1, ww2 + 2, wh2 + 2, winF);
    p.rect(wx2, wy2, ww2, wh2, lit ? winC : C.mix(winF, P.mid, .5));
    p.rect(wx2 + ww2 / 2 - .5, wy2, 1, wh2, winF);
    p.rect(wx2, wy2 + wh2 / 2, ww2, 1, winF);
    if (lit) p.rectA(wx2 - 3, wy2 - 3, ww2 + 6, wh2 + 6, P.lightGlow, .07);
  };
  drawWin(hx - 26, hb - hh + 6, 14, 11, true);
  drawWin(hx + 4, hb - hh + 6, 14, 11, false);
  drawWin(hx + 12, hb - 22, 13, 11, true);
  // ドア
  const dw = 12, dh = 20, dx = Math.round(hx - 24), dy = hb - dh;
  p.rect(dx - 1, dy - 1, dw + 2, dh + 1, C.scale(wall2, .8));
  p.rect(dx, dy, dw, dh, C.mix(P.near, [96, 62, 48], .65));
  p.rect(dx + dw - 3, dy + 11, 2, 2, C.mix(P.accentA, [220, 200, 140], .5));
  if (o.doorOpen > .01) {
    p.rect(dx, dy, Math.max(1, Math.round(dw * o.doorOpen)), dh, C.cssa(P.lightGlow, .5));
  }
  // ポーチ灯
  p.rect(dx + dw + 3, dy + 3, 2, 3, C.css(P.lightGlow));
  p.circle(dx + dw + 4, dy + 5, o.night ? 7 : 4, C.cssa(P.lightGlow, o.night ? .16 : .08));
  // 私道
  p.ctx.globalAlpha = .55;
  for (let i = 0; i < walkY - hb + 12; i++) {
    const t = i / (walkY - hb + 12);
    const ww2 = 26 + t * 14;
    p.rect(Math.round(hx - 4 - ww2 / 2), hb + i, Math.round(ww2), 1, C.mix(P.ground, [140, 136, 130], .5));
  }
  p.ctx.globalAlpha = 1;
  // 生垣
  for (let i = 0; i < 9; i++) {
    p.circle(hx - hw / 2 - 6 + i * 5, hb - 2, 4, C.css(C.mix(lawn, [44, 84, 50], .7)));
  }

  /* 街路樹・電柱・街灯 */
  D.tree(p, p.w * .12, yardY + 2, 46, 0, Math.sin(o.t * .8) * 1.4,
    C.mix(P.mid, [70, 112, 66], .7), C.mix(P.near, [44, 78, 50], .7), 1);
  D.pole(p, p.w * .36, walkY, 62, C.mix(P.near, P.mid, .35), 0);
  D.streetlight(p, p.w * .90, walkY, 56, C.mix(P.near, P.mid, .3), P.lightGlow, o.night ? .95 : .2);
  // ポスト
  p.rect(p.w * .50, walkY - 12, 2, 12, C.mix(P.near, P.mid, .4));
  p.rect(p.w * .50 - 4, walkY - 18, 10, 6, C.mix(P.accentC, P.near, .5));

  /* 車 */
  const cx = o.carX === undefined ? p.w * .32 : o.carX;
  const cy = roadY + Math.round(roadH * .34);
  drawCar(p, cx, cy, P, o.headlights || 0, o.night, o.t);

  /* 猫（最初と最後で同じ場所にいる） */
  const catX = Math.round(p.w * .13), catY = curbY + 2;
  const spr = PX.SPR.catSit;
  if (spr) {
    if (o.catRainbow) p.circle(catX, catY - 6, 14, C.cssa(C.rainbow(o.t * 1.4, .6), .22));
    p.sprite(spr, catX, catY, { scale: 1, ax: .5, ay: 1, hue: o.catRainbow ? o.t * 1.1 : 0 });
  }

  /* 主人公 */
  if (o.personX !== undefined) {
    const f = o.personFrame ? PX.SPR.walk2 : PX.SPR.walk1;
    if (f) {
      p.rectA(o.personX - 5, walkY + 1, 10, 2, [0, 0, 0], .22);
      p.sprite(f, o.personX, walkY + 2, { scale: 2, ax: .5, ay: 1, flip: o.personFlip });
    }
  }
  return { hz, roadY, carX: cx, carY: cy, doorX: dx + dw / 2, doorY: dy + dh, walkY };
}

function drawCar(p, x, y, P, headlights, night, t) {
  const body = C.mix(P.accentC, [126, 70, 96], .45);
  const dark = C.scale(body, .58);
  const hi = C.scale(body, 1.22);
  const glass = C.mix(P.accentB, P.mid, .45);
  x = Math.round(x); y = Math.round(y);
  p.rectA(x - 23, y, 46, 2, [0, 0, 0], .35);
  // キャビン
  p.rect(x - 12, y - 17, 23, 7, C.mix(body, dark, .25));
  p.rect(x - 10, y - 16, 19, 5, glass);
  p.rect(x - 10, y - 16, 19, 1, C.mix(glass, [255, 255, 255], .35));
  p.rect(x - 1, y - 16, 1, 5, C.mix(body, dark, .4));
  // ボディ
  p.rect(x - 22, y - 10, 45, 7, body);
  p.rect(x - 22, y - 10, 45, 1, hi);
  p.rect(x - 22, y - 4, 45, 2, dark);
  p.rect(x - 23, y - 8, 1, 4, dark);
  p.rect(x + 22, y - 8, 1, 4, dark);
  // ドアライン
  p.rect(x - 2, y - 9, 1, 5, C.scale(body, .78));
  p.rect(x + 3, y - 7, 3, 1, C.scale(body, 1.1));
  // タイヤ
  p.rect(x - 17, y - 3, 8, 4, [26, 24, 32]);
  p.rect(x + 9, y - 3, 8, 4, [26, 24, 32]);
  p.rect(x - 15, y - 2, 4, 2, [70, 68, 80]);
  p.rect(x + 11, y - 2, 4, 2, [70, 68, 80]);
  // ランプ
  p.rect(x - 23, y - 8, 2, 3, C.mix(P.accentC, [210, 60, 60], .7));
  if (headlights > .01) {
    p.rect(x + 21, y - 8, 3, 3, C.cssa(P.lightGlow, 1));
    p.circle(x + 25, y - 7, 3 + headlights * 4, C.cssa(P.lightGlow, .20 * headlights));
    p.ctx.globalAlpha = .13 * headlights;
    p.ctx.fillStyle = C.css(P.lightGlow);
    for (let i = 0; i < 26; i++) {
      const w = 2 + i * .55;
      p.ctx.fillRect(x + 24 + i * 2, Math.round(y - 7 - w / 2), 2, Math.max(1, Math.round(w)));
    }
    p.ctx.globalAlpha = 1;
  }
}
PX.drawExterior = drawExterior;
PX.drawCar = drawCar;

/* ==================================================== HOUSE (導入) */
class HouseScene {
  constructor(p, input) {
    this.p = p; this.input = input;
    this.t = 0;
    this.state = 'idle';
    this.st = 0;
    this.mushroom = 1;      // 1 = まだ卓上にある
    this.hint = 0;
    this.personX = 0;
    this.doorOpen = 0;
    this.headlights = 0;
    this.camY = 0;
    this.zoom = 1;
    this.done = false;
    this.eatFlash = 0;
    this.tvPhase = 0;
    this.fade = 0;
  }

  _go(s) { this.state = s; this.st = 0; }

  update(dt) {
    this.t += dt; this.st += dt;
    const p = this.p;
    const taps = this.input.takeTaps();

    switch (this.state) {
      case 'idle': {
        this.hint = M.approach(this.hint, this.st > 3.5 ? 1 : 0, 1.5, dt);
        const mx = this.mushX === undefined ? p.w * .46 : this.mushX;
        const my = this.mushY === undefined ? p.h * .72 : this.mushY;
        for (const tp of taps) {
          if (Math.abs(tp.x - mx) < 28 && Math.abs(tp.y - my) < 30) {
            PX.Audio.init();
            PX.Audio.sfx('eat');
            this.mushroom = 0;
            this.eatFlash = 1;
            this._go('eaten');
            break;
          }
        }
        break;
      }
      case 'eaten':
        // ★ここが肝: 数秒間、本当に何も起きない
        this.eatFlash = M.approach(this.eatFlash, 0, 3, dt);
        if (this.st > 4.2) this._go('stand');
        break;
      case 'stand':
        if (this.st > 1.4) { PX.Audio.sfx('door'); this._go('leave'); }
        break;
      case 'leave':
        this.fade = M.sat(this.st / .8);
        if (this.st > 1.1) { this.fade = 0; this._go('outside'); }
        break;
      case 'outside':
        this.personX = M.lerp(p.w * .58, p.w * .34, M.smooth(this.st / 2.6));
        this.doorOpen = M.sat(1.2 - this.st) * .8;
        if (this.st > 2.9) { PX.Audio.sfx('door'); this._go('enter'); }
        break;
      case 'enter':
        if (this.st > .9) {
          PX.Audio.init();
          PX.Audio.sfx('ignition');
          PX.Audio.startEngine();
          this._go('ignition');
        }
        break;
      case 'ignition':
        this.headlights = M.sat(this.st / 1.1);
        PX.Audio.setEngine(.15 + M.sat(this.st / 2) * .2, .12);
        if (this.st > 2.2) this._go('board');
        break;
      case 'board': {
        // 運転席へ視点が入っていく
        const k = M.smoother(M.sat(this.st / 1.6));
        this.zoom = 1 + k * 2.6;
        this.camY = k * 26;
        if (this.st > 1.7) { this.done = true; }
        break;
      }
    }
  }

  render() {
    const p = this.p;
    p.resetFx();
    if (this.state === 'idle' || this.state === 'eaten' || this.state === 'stand' || this.state === 'leave') {
      this._room();
      if (this.fade > 0) p.rectA(0, 0, p.w, p.h, [0, 0, 0], this.fade);
    } else {
      p.fx.zoom = this.zoom;
      drawExterior(p, {
        t: this.t, night: false,
        carX: p.w * .32,
        doorOpen: this.doorOpen,
        headlights: this.headlights,
        personX: (this.state === 'outside') ? this.personX : undefined,
        personFrame: Math.floor(this.t * 5) % 2,
        personFlip: true,
        camY: 0
      });
      if (this.state === 'board') {
        const k = M.sat(this.st / 1.6);
        p.rectA(0, 0, p.w, p.h, [10, 8, 16], k * .35);
      }
    }
  }

  /* -------------------------------------------------------- リビング */
  _room() {
    const p = this.p, P = pal('suburb');
    const wall = C.mix(P.near, [92, 80, 88], .55);
    const floorY = Math.round(p.h * .60);
    const fl = C.mix(P.near, [116, 80, 54], .58);

    /* 壁と床 */
    p.vgrad(0, 0, p.w, floorY, C.scale(wall, .86), wall, true);
    p.rect(0, floorY - 5, p.w, 5, C.scale(wall, .68));
    for (let y = floorY; y < p.h; y++) {
      const t = (y - floorY) / (p.h - floorY);
      p.rect(0, y, p.w, 1, C.mix(C.scale(fl, .74), fl, t));
    }
    for (let i = -5; i <= 5; i++) {
      p.line(p.w * .5 + i * 9, floorY, p.w * .5 + i * 46, p.h, C.scale(fl, .78), .45);
    }

    /* 天井灯（部屋全体を照らす） */
    p.rect(p.w * .5 - 1, 0, 2, 26, C.scale(wall, .5));
    p.rect(p.w * .5 - 7, 26, 14, 3, C.scale(wall, .45));
    p.circle(p.w * .5, 32, 8, C.css(C.mix(P.lightGlow, [255, 255, 255], .35)));
    p.circle(p.w * .5, 34, 26, C.cssa(P.lightGlow, .07));
    p.circle(p.w * .5, 38, 48, C.cssa(P.lightGlow, .04));

    /* 窓（夕方の空） */
    const wx = 12, wy = 78, ww = 62, wh = 52;
    p.rect(wx - 3, wy - 3, ww + 6, wh + 6, C.scale(wall, .58));
    p.vgrad(wx, wy, ww, wh, P.skyMid, P.skyLow, true);
    p.circle(wx + 46, wy + 34, 7, C.cssa(P.sun, .92));
    for (let i = 0; i < 3; i++) D.cloud(p, wx + 14 + i * 20, wy + 12 + i * 4, 16, 2, P.cloud, 0, .55);
    D.pole(p, wx + 14, wy + wh, 30, C.mix(P.mid, [0, 0, 0], .35), 0);
    D.building(p, wx + 44, wy + wh, 16, 12, 0, { alpha: .8, body: C.mix(P.mid, [0, 0, 0], .3), roof: C.mix(P.near, [0, 0, 0], .3), win: P.lightGlow, winOff: P.mid, seed: 3 });
    p.rect(wx + ww / 2 - 1, wy, 2, wh, C.scale(wall, .58));
    p.rect(wx, wy + wh / 2 - 1, ww, 2, C.scale(wall, .58));
    p.rect(wx - 3, wy + wh, ww + 6, 3, C.scale(wall, .5));

    /* 壁の絵（まっすぐな道の絵。これから走る道） */
    const gx = 94, gy = 86, gw = 36, gh = 26;
    p.rect(gx - 2, gy - 2, gw + 4, gh + 4, C.mix(wall, [120, 90, 60], .7));
    p.vgrad(gx, gy, gw, gh * .55, C.hex('#3a3560'), C.hex('#c07a5c'), false);
    p.rect(gx, gy + gh * .55, gw, gh * .45, C.hex('#2e2a40'));
    for (let i = 0; i < 9; i++) {
      const t = i / 8, yy = gy + gh * .55 + t * gh * .45;
      p.rect(gx + gw / 2 - Math.round(t * 5), yy, Math.max(1, Math.round(t * 10)), 1, C.hex('#5a5470'));
    }

    /* 時計（秒針が動く = 「時間はまだ正常」） */
    const cx = p.w * .82, cy = 96, cr = 13;
    p.circle(cx, cy, cr, C.css(C.mix(wall, [242, 238, 224], .82)));
    p.ring(cx, cy, cr, C.css(C.scale(wall, .5)), 1, 1);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      p.px(cx + Math.cos(a) * (cr - 3), cy + Math.sin(a) * (cr - 3), C.scale(wall, .4));
    }
    const sa = -Math.PI / 2 + Math.floor(this.t) * (Math.PI * 2 / 60);
    p.line(cx, cy, cx + Math.cos(sa) * (cr - 4), cy + Math.sin(sa) * (cr - 4), [190, 62, 62]);
    p.line(cx, cy, cx + Math.cos(-1.9) * (cr - 6), cy + Math.sin(-1.9) * (cr - 6), C.scale(wall, .3));
    p.line(cx, cy, cx + Math.cos(-.5) * (cr - 8), cy + Math.sin(-.5) * (cr - 8), C.scale(wall, .3));

    /* 冷蔵庫（右奥） */
    const fx = p.w - 34, fby = floorY + 16;
    p.rectA(fx - 2, fby - 2, 34, 4, [0, 0, 0], .22);
    p.rect(fx, fby - 66, 30, 66, C.mix(wall, [214, 216, 222], .8));
    p.rect(fx, fby - 66, 30, 2, C.mix(wall, [240, 242, 248], .8));
    p.rect(fx, fby - 42, 30, 1, C.scale(wall, .55));
    p.rect(fx + 25, fby - 58, 2, 10, C.scale(wall, .45));
    p.rect(fx + 25, fby - 36, 2, 10, C.scale(wall, .45));
    p.rect(fx + 5, fby - 62, 8, 5, [232, 204, 96]);
    p.rect(fx + 16, fby - 61, 5, 4, [140, 190, 210]);

    /* テレビ（左奥・砂嵐） */
    const tvx = 14, tby = floorY + 22;
    p.rectA(tvx - 2, tby - 2, 58, 4, [0, 0, 0], .22);
    p.rect(tvx + 8, tby - 12, 38, 12, C.mix(fl, [70, 50, 40], .6));
    p.rect(tvx, tby - 50, 54, 38, C.mix(wall, [34, 32, 42], .85));
    for (let y = 0; y < 32; y++) {
      const n = M.hash2(y * 1.7, Math.floor(this.t * 9));
      p.rect(tvx + 3, tby - 47 + y, 48, 1, C.mix([38, 44, 60], [158, 168, 188], n * .85));
    }
    p.rectA(tvx + 3, tby - 47, 48, 32, P.accentB, .10);
    
    p.rect(tvx + 48, tby - 16, 2, 2, [220, 90, 70]);

    /* 観葉植物（左の壁際） */
    const plx = 12, ply = floorY + 26;
    p.rect(plx - 6, ply - 10, 13, 11, C.mix(fl, [150, 96, 70], .6));
    p.rect(plx - 6, ply - 11, 13, 2, C.mix(fl, [172, 116, 84], .6));
    D.fern(p, plx, ply - 10, 26, Math.sin(this.t * .7) * 1.2,
      C.mix(P.mid, [78, 132, 74], .8), C.mix(P.near, [46, 92, 56], .8), 1);

    /* フロアランプ（右の壁際） */
    const lx2 = p.w - 62, ly2 = floorY + 20;
    p.rect(lx2 - 5, ly2 - 1, 11, 2, C.scale(wall, .5));
    p.rect(lx2 - 1, ly2 - 42, 2, 42, C.scale(wall, .5));
    p.rect(lx2 - 9, ly2 - 54, 19, 12, C.mix(wall, [214, 176, 128], .7));
    p.rect(lx2 - 7, ly2 - 42, 15, 2, C.cssa(P.lightGlow, .9));
    p.circle(lx2, ly2 - 38, 20, C.cssa(P.lightGlow, .05));

    /* ラグ */
    p.ctx.globalAlpha = .5;
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const yy = floorY + 74 + i * 2;
      const ww2 = 60 + t * 46;
      p.rect(p.w * .42 - ww2 / 2, yy, ww2, 2, i % 3 === 0 ? C.hex('#7a4a58') : C.hex('#6a3f4c'));
    }
    p.ctx.globalAlpha = 1;

    /* ソファ */
    const sx = p.w * .30, sy = floorY + 66;
    p.rectA(sx - 40, sy - 2, 80, 4, [0, 0, 0], .22);
    p.rect(sx - 36, sy - 34, 72, 14, C.mix(P.near, [146, 88, 98], .6));
    p.rect(sx - 36, sy - 22, 72, 22, C.mix(P.near, [124, 72, 82], .6));
    p.rect(sx - 42, sy - 30, 8, 30, C.mix(P.near, [112, 64, 74], .6));
    p.rect(sx + 34, sy - 30, 8, 30, C.mix(P.near, [112, 64, 74], .6));
    p.rect(sx - 24, sy - 32, 20, 10, C.mix(P.near, [162, 100, 110], .6));
    p.rect(sx + 4, sy - 32, 20, 10, C.mix(P.near, [162, 100, 110], .6));

    /* テーブル + キノコ + マグ */
    const tx = p.w * .46, ty = floorY + 108;
    p.rectA(tx - 40, ty - 1, 80, 3, [0, 0, 0], .25);
    p.rect(tx - 38, ty - 22, 76, 5, C.mix(fl, [162, 112, 74], .65));
    p.rect(tx - 38, ty - 17, 76, 2, C.scale(fl, .7));
    p.rect(tx - 33, ty - 15, 4, 15, C.scale(fl, .78));
    p.rect(tx + 29, ty - 15, 4, 15, C.scale(fl, .78));
    // マグカップ
    p.rect(tx + 16, ty - 31, 8, 9, [232, 228, 218]);
    p.rect(tx + 24, ty - 29, 2, 4, [232, 228, 218]);
    p.rect(tx + 16, ty - 31, 8, 1, [200, 196, 188]);
    for (let i = 0; i < 4; i++) {
      const yy = ty - 34 - i * 4 - M.mod(this.t * 7, 4);
      p.rectA(tx + 19 + Math.sin(this.t * 2 + i * .9) * 2, yy, 1, 3, [255, 255, 255], .20 - i * .04);
    }

    this.mushX = tx - 14; this.mushY = ty - 22;
    if (this.mushroom > 0) {
      const bob = Math.sin(this.t * 1.6) * .7;
      const spr = PX.SPR.mushroom;
      if (spr) p.sprite(spr, this.mushX, this.mushY + bob, { scale: 2, ax: .5, ay: 1 });
      if (this.hint > .02) {
        const a = this.hint * (.26 + .28 * Math.sin(this.t * 3.2));
        p.ring(this.mushX, this.mushY - 10, 17, C.css(P.lightGlow), a, 1);
        p.textC('TAP', this.mushX, this.mushY + 8, C.cssa(P.line, this.hint * .75), 1, 1);
      }
    }

    /* 主人公 */
    const standing = (this.state === 'stand' || this.state === 'leave');
    const px_ = standing ? M.lerp(p.w * .68, p.w * .86, M.sat(this.st / 1.4)) : p.w * .68;
    const f = standing && Math.floor(this.t * 5) % 2 ? PX.SPR.walk2 : PX.SPR.walk1;
    if (f) p.sprite(f, px_, ty + 4, { scale: 4, ax: .5, ay: 1, flip: true });
    p.rectA(px_ - 10, ty + 3, 20, 3, [0, 0, 0], .22);

    /* 食べた瞬間のごく小さな反応（派手にしない） */
    if (this.eatFlash > .01) p.rectA(0, 0, p.w, p.h, [255, 240, 220], this.eatFlash * .09);
  }
}
PX.HouseScene = HouseScene;

/* ==================================================== OUTRO (帰還) */
class OutroScene {
  constructor(p) {
    this.p = p; this.t = 0; this.st = 0; this.state = 'arrive';
    this.carX = -30; this.headlights = 1; this.catRainbow = false;
    this.fade = 0; this.clear = 0; this.done = false;
  }
  _go(s) { this.state = s; this.st = 0; }
  update(dt) {
    this.t += dt; this.st += dt;
    const p = this.p;
    switch (this.state) {
      case 'arrive': {
        const k = M.smoother(M.sat(this.st / 3.4));
        this.carX = M.lerp(-46, p.w * .32, k);
        PX.Audio.setEngine(.28 * (1 - k) + .05, .12 * (1 - k * .5));
        if (this.st > 3.6) { PX.Audio.stopEngine(1.2); this._go('still'); }
        break;
      }
      case 'still':
        this.headlights = M.approach(this.headlights, 0, 1.2, dt);
        // 数秒間、本当に何も起きない
        if (this.st > 4.5) { PX.Audio.sfx('shimmer'); this._go('cat'); }
        break;
      case 'cat':
        this.catRainbow = true;
        if (this.st > 1.3) { this.catRainbow = false; this._go('fade'); }
        break;
      case 'fade':
        this.fade = M.sat(this.st / 1.4);
        if (this.st > 1.8) this._go('clear');
        break;
      case 'clear':
        this.fade = 1;
        this.clear = M.sat((this.st - .4) / .8);
        if (this.st > 6) this.done = true;
        break;
    }
  }
  render(stats) {
    const p = this.p;
    p.resetFx();
    p.fx.vignette = .25;
    drawExterior(p, {
      t: this.t, night: true, carX: this.carX,
      doorOpen: 0, headlights: this.headlights,
      catRainbow: this.catRainbow, camY: 0
    });
    if (this.fade > 0) p.rectA(0, 0, p.w, p.h, [0, 0, 0], this.fade);
    if (this.clear > 0) {
      const a = this.clear;
      const y = Math.round(p.h * .40);
      p.textC('STAGE CLEAR', p.w / 2, y, C.cssa([255, 255, 255], a), 2, 1);
      if (stats && this.st > 1.4) {
        const b = M.sat((this.st - 1.4) / .6);
        const rows = [
          'PERFECT  ' + stats.perfect,
          'GROOVY   ' + stats.groovy,
          'GOOD     ' + stats.good,
          'MISS     ' + stats.miss,
          '',
          'MAX COMBO ' + stats.maxCombo,
          'SCORE ' + stats.score,
          '',
          'TRIP DEPTH ' + stats.depth + ' / 10'
        ];
        for (let i = 0; i < rows.length; i++) {
          p.textC(rows[i], p.w / 2, y + 22 + i * 8, C.cssa([210, 200, 230], b * .9), 1, 1);
        }
        if (this.st > 3.2) {
          const c = .5 + .5 * Math.sin(this.t * 3);
          p.textC('TAP TO DRIVE AGAIN', p.w / 2, p.h - 30, C.cssa([255, 255, 255], c * .8), 1, 1);
        }
      }
    }
  }
}
PX.OutroScene = OutroScene;

})(window.PX);
