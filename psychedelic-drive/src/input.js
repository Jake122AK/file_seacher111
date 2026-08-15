/* =====================================================================
   input.js — 片手ドラッグステアリング / タップ / ジャイロ(オプション)
   ---------------------------------------------------------------------
   ・画面のどこを触っても良いが、下部 45% は「ハンドル領域」として扱い
     指の横移動量がそのままステアリングに乗る（実車シムではなく音ゲー感）。
   ・タップ（短時間・小移動）は tap イベントとして通知（キノコ等）。
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
    this.taps = [];        // {x,y} 内部解像度座標
    this.gyro = false; this.gyroBase = null; this.gyroVal = 0;
    this.sensitivity = 1.55;
    this.lastMoveT = 0;
    this.wheelKick = 0;    // 演出用: 急な操作量

    const opts = { passive: false };
    el.addEventListener('touchstart', e => this._down(e.changedTouches[0], e), opts);
    el.addEventListener('touchmove', e => this._move(e.changedTouches[0], e), opts);
    el.addEventListener('touchend', e => this._up(e.changedTouches[0], e), opts);
    el.addEventListener('touchcancel', e => this._up(e.changedTouches[0], e), opts);
    el.addEventListener('mousedown', e => this._down(e, e));
    window.addEventListener('mousemove', e => { if (this.active) this._move(e, e); });
    window.addEventListener('mouseup', e => this._up(e, e));
    window.addEventListener('keydown', e => this._key(e, 1));
    window.addEventListener('keyup', e => this._key(e, 0));
    this.keyL = 0; this.keyR = 0;
  }

  _pt(t) {
    const r = this.el.getBoundingClientRect();
    return {
      x: (t.clientX - r.left) / r.width * this.pixel.w,
      y: (t.clientY - r.top) / r.height * this.pixel.h
    };
  }

  _down(t, e) {
    if (e.preventDefault) e.preventDefault();
    const p = this._pt(t);
    this.active = true;
    this.touchX = p.x; this.touchY = p.y;
    this.startX = p.x; this.startY = p.y;
    this.startT = performance.now();
    this.anchor = p.x - this.raw * (this.pixel.w * .34);
  }

  _move(t, e) {
    if (e.preventDefault) e.preventDefault();
    if (!this.active) return;
    const p = this._pt(t);
    this.touchX = p.x; this.touchY = p.y;
    const prev = this.raw;
    // アンカー相対 + 絶対位置のブレンド → どこを持っても直感的
    const rel = (p.x - this.anchor) / (this.pixel.w * .34);
    const abs = (p.x - this.pixel.w * .5) / (this.pixel.w * .42);
    this.raw = M.clamp(M.lerp(rel, abs, .35) * this.sensitivity, -1.35, 1.35);
    const d = Math.abs(this.raw - prev);
    if (d > .09) this.wheelKick = Math.min(1, this.wheelKick + d);
    this.lastMoveT = performance.now();
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

  _key(e, v) {
    if (e.key === 'ArrowLeft' || e.key === 'a') { this.keyL = v; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'd') { this.keyR = v; e.preventDefault(); }
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

  update(dt) {
    let target = this.raw;
    if (this.keyL || this.keyR) target = M.clamp(target + (this.keyR - this.keyL) * 1.15, -1.2, 1.2);
    if (this.gyro) target = M.clamp(target + this.gyroVal, -1.3, 1.3);
    if (!this.active && !this.keyL && !this.keyR && !this.gyro) {
      // 指を離したら緩やかにセンターへ（完全には戻さない = 音ゲー的追従）
      this.raw = M.approach(this.raw, 0, 1.1, dt);
      target = this.raw;
    }
    const prev = this.steer;
    this.steer = M.approach(this.steer, M.clamp(target, -1.15, 1.15), 17, dt);
    this.vel = (this.steer - prev) / Math.max(.0001, dt);
    this.wheelKick = M.approach(this.wheelKick, 0, 3.5, dt);
  }
}

PX.Input = Input;
})(window.PX);
