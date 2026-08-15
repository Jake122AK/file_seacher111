/* =====================================================================
   input.js — 5レーンのタップ入力 / マルチタッチ / ジャイロ(オプション)
   ---------------------------------------------------------------------
   ・判定は touchstart の瞬間に取る（touchend まで待つと必ず遅れる）。
   ・マルチタッチ対応。同時押しのノーツが叩ける。
   ・hits[] は音ゲーの判定用、taps[] はキノコ等の UI 用。
   ===================================================================== */
(function (PX) {
'use strict';
const M = PX.M;

class Input {
  constructor(el, pixel) {
    this.el = el; this.pixel = pixel;
    this.raw = 0;          // -1..1 目標ステア
    this.steer = 0;        // 平滑化後
    this.vel = 0;
    this.active = false;
    this.touchX = 0; this.touchY = 0;
    this.startX = 0; this.startY = 0; this.startT = 0;
    this.anchor = 0;
    this.taps = [];        // {x,y} 内部解像度座標（UI 用）
    this.hits = [];        // {x,y,lane,t} 音ゲー判定用（touchstart の瞬間）
    this.lanes = 5;
    this.laneFlash = [0, 0, 0, 0, 0];   // 押された余韻（描画用）
    this.gyro = false; this.gyroBase = null; this.gyroVal = 0;
    this.sensitivity = 1.55;
    this.lastMoveT = 0;

    const opts = { passive: false };
    // マルチタッチ: changedTouches を全部処理する
    el.addEventListener('touchstart', e => {
      if (e.preventDefault) e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) this._down(e.changedTouches[i], e);
    }, opts);
    el.addEventListener('touchmove', e => { if (e.preventDefault) e.preventDefault(); }, opts);
    el.addEventListener('touchend', e => {
      for (let i = 0; i < e.changedTouches.length; i++) this._up(e.changedTouches[i], e);
    }, opts);
    el.addEventListener('touchcancel', e => {
      for (let i = 0; i < e.changedTouches.length; i++) this._up(e.changedTouches[i], e);
    }, opts);
    el.addEventListener('mousedown', e => this._down(e, e));
    window.addEventListener('mousemove', e => { if (this.active) this._move(e, e); });
    window.addEventListener('mouseup', e => this._up(e, e));
    window.addEventListener('keydown', e => this._key(e, 1));
    window.addEventListener('keyup', e => this._key(e, 0));
    this.keyHeld = [0, 0, 0, 0, 0];
  }

  _pt(t) {
    const r = this.el.getBoundingClientRect();
    return {
      x: (t.clientX - r.left) / r.width * this.pixel.w,
      y: (t.clientY - r.top) / r.height * this.pixel.h
    };
  }

  _down(t, e) {
    if (e && e.preventDefault && e.type === 'mousedown') e.preventDefault();
    const p = this._pt(t);
    this.active = true;
    this.touchX = p.x; this.touchY = p.y;
    this.startX = p.x; this.startY = p.y;
    this.startT = performance.now();
    // 画面を横に5等分したものがそのままレーン
    const lane = M.clamp(Math.floor(p.x / (this.pixel.w / this.lanes)), 0, this.lanes - 1);
    // 誰も取りに来ない場面（導入シーン等）で溜まり続けないよう上限を設ける
    if (this.hits.length > 12) this.hits.shift();
    this.hits.push({ x: p.x, y: p.y, lane, t: performance.now() });
    this.laneFlash[lane] = 1;
  }

  _move(t, e) {
    if (!this.active) return;
    const p = this._pt(t);
    this.touchX = p.x; this.touchY = p.y;
  }

  _up(t, e) {
    if (!this.active) return;
    if (e.preventDefault) e.preventDefault();
    const p = this._pt(t);
    const dt = performance.now() - this.startT;
    const dist = Math.hypot(p.x - this.startX, p.y - this.startY);
    if (dt < 320 && dist < 6) this.taps.push({ x: p.x, y: p.y });
    this.active = false;
  }

  /* PC 確認用: S D F J K が左から5レーンに対応 */
  _key(e, v) {
    const idx = 'sdfjk'.indexOf(e.key.toLowerCase());
    if (idx >= 0) {
      e.preventDefault();
      if (v && !this.keyHeld[idx]) {
        const x = (idx + .5) * (this.pixel.w / this.lanes);
        this.hits.push({ x, y: this.pixel.h * .8, lane: idx, t: performance.now() });
        this.laneFlash[idx] = 1;
      }
      this.keyHeld[idx] = v;
      return;
    }
    if (v && (e.key === ' ' || e.key === 'Enter')) this.taps.push({ x: this.pixel.w / 2, y: this.pixel.h / 2 });
  }

  enableGyro() {
    const start = () => {
      this.gyro = true;
      window.addEventListener('deviceorientation', ev => {
        if (ev.gamma == null) return;
        if (this.gyroBase === null) this.gyroBase = ev.gamma;
        this.gyroVal = M.clamp((ev.gamma - this.gyroBase) / 22, -1.2, 1.2);
      });
    };
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then(r => { if (r === 'granted') start(); }).catch(() => {});
    } else if (DOE) start();
  }
  disableGyro() { this.gyro = false; this.gyroBase = null; }

  takeTaps() { const t = this.taps; this.taps = []; return t; }
  takeHits() { const h = this.hits; this.hits = []; return h; }

  update(dt) {
    for (let i = 0; i < this.lanes; i++) this.laneFlash[i] = M.approach(this.laneFlash[i], 0, 7, dt);
  }
}

PX.Input = Input;
})(window.PX);
