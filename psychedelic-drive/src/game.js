/* =====================================================================
   game.js — ステージ進行 / トリップ管理 / スコア / 自車描画 / HUD
   ---------------------------------------------------------------------
   ステージデータ(data/stage1.js)を時間で補間し、
     world(重み) / road(変形) / pixel(ポストFX)
   に配るだけの層。ここにステージ固有の記述は書かない。

   ★ グルーヴ分岐 ★
   判定精度から groove(0..1) を作り、
     ・trip.level を最大 +1.6 押し上げる
     ・worlds を keys[].deep 側へブレンドする
     ・路肩オブジェクトの密度(フラダンサーの人数)を最大 3.4 倍にする
   → 上手いほど深い世界が見える。ヘタなら少し現実寄りに戻る。
   ===================================================================== */
(function (PX) {
'use strict';
const M = PX.M, C = PX.C, D = PX.draw;

/* --------------------------------------------- タイムライン補間 */
const WARP_DEF = { sky: 0, spiral: 0, wave: 0, snake: 0, loop: 0, breathe: 0, rainbow: 0, glow: 0, keys: 0, tongue: 0, liquid: 0, widen: 1 };
const FX_DEF = { wave: 0, vwave: 0, ripple: 0, rgb: 0, hue: 0, sat: 0, bright: 1, invert: 0, posterize: 0, trails: 0, melt: 0, kaleido: 0, tunnel: 0, vignette: 0, scan: 0, flash: 0 };
const V_DEF = { speed: 30, horizon: .44, moonSize: 0, cloudFace: 0, starBoost: 0, sunGlasses: 0, moonFace: 0, tunnelDark: 0, crowd: 0, signSet: 'normal' };

function lerpObj(a, b, u, def, out) {
  out = out || {};
  for (const k in def) {
    const av = (a && a[k] !== undefined) ? a[k] : def[k];
    const bv = (b && b[k] !== undefined) ? b[k] : def[k];
    out[k] = typeof av === 'number' ? av + (bv - av) * u : (u < .5 ? av : bv);
  }
  return out;
}
function lerpWorlds(a, b, u, out) {
  out = out || {};
  for (const k of PX.WORLD_LIST) out[k] = 0;
  if (a) for (const k in a) out[k] = (out[k] || 0) + a[k] * (1 - u);
  if (b) for (const k in b) out[k] = (out[k] || 0) + b[k] * u;
  return out;
}

class Timeline {
  constructor(stage) {
    this.stage = stage;
    this.keys = stage.keys;
    this.i = 0;
    this.out = { level: 0, worlds: {}, deep: null, warp: {}, fx: {}, v: {} };
    this.fired = new Array(stage.events.length).fill(false);
  }
  sample(t) {
    const K = this.keys;
    let i = 0, lo = 0, hi = K.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (K[mid].t <= t) lo = mid; else hi = mid - 1; }
    i = lo;
    const a = K[i], b = K[i + 1] || K[i];
    const u = b === a ? 0 : M.smooth((t - a.t) / (b.t - a.t));
    const o = this.out;
    o.level = M.lerp(a.level || 0, b.level || 0, u);
    lerpWorlds(a.worlds, b.worlds, u, o.worlds);
    // deep（グルーヴ時の世界）も同様に補間。無ければ通常と同じ。
    o.deep = lerpWorlds(a.deep || a.worlds, b.deep || b.worlds, u, o.deep || {});
    lerpObj(a.warp, b.warp, u, WARP_DEF, o.warp);
    lerpObj(a.fx, b.fx, u, FX_DEF, o.fx);
    lerpObj(a.v, b.v, u, V_DEF, o.v);
    return o;
  }
  events(t) {
    const out = [];
    const E = this.stage.events;
    for (let i = 0; i < E.length; i++) {
      if (!this.fired[i] && t >= E[i].t) { this.fired[i] = true; out.push(E[i]); }
    }
    return out;
  }
  reset() { this.fired.fill(false); }
}

/* エンジン側が決めるエフェクトの最大振れ幅。
   ここを絞ることで「終盤 100%」でも走行ラインが読める状態を担保する。 */
const FX_MAX = {
  wave: .28, vwave: .20, ripple: .26, rgb: .42, hue: .05, sat: .50,
  trails: .22, melt: .12, kaleido: .38, tunnel: .38, posterize: .70, invert: .26
};

/* ------------------------------------------------------------ Game */
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.p = new PX.Pixel(canvas, 192);
    this.p.resize();
    PX.buildArt();
    this.input = new PX.Input(canvas, this.p);
    this.scene = 'house';
    this.stage = PX.STAGES.stage1;
    this.track = PX.TRACKS[this.stage.track] || PX.TRACKS.default;
    this.house = new PX.HouseScene(this.p, this.input);
    this.outro = null;
    this.acc = 0; this.last = 0;
    this.songTime = 0;
    this.particles = [];
    this.judgeText = null;
    this.frame = 0;
    /* 自動品質。実測では内部解像度が最も効くので、そちらを主レバーにする。
       エフェクト側(qual)は 0.6 までしか落とさない = 終盤の絵作りを壊さない。 */
    this.frameMs = 16.7; this.workMs = 8; this.qual = 1;
    this.resLadder = [192, 176, 160, 144, 128];
    this.resStep = 0; this.resCool = 3;
    this.exhaust = [];

    window.addEventListener('resize', () => this.p.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.p.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && PX.Audio.ctx && PX.Audio.ctx.state === 'suspended') PX.Audio.ctx.resume();
    });
  }

  /* ------------------------------------------------- ドライブ開始 */
  startDrive(offset) {
    offset = offset || 0;
    const tr = this.track;
    this.chart = new PX.Chart(tr);
    this.cond = new PX.Conductor(tr);
    this.road = new PX.Road(this.chart);
    this.world = new PX.World(this.road);
    this.tl = new Timeline(this.stage);
    this.songTime = offset;
    this.scene = 'drive';
    // シーク時は過ぎたイベントを消化済みにし、世界の重みを即座に合わせる
    if (offset > 0) {
      this.tl.events(offset);
      const K = this.tl.sample(offset);
      for (const k of PX.WORLD_LIST) this.world.w[k] = K.worlds[k] || 0;
      this.chart.cursor = 0;
      const b0 = offset / (60 / tr.bpm);
      for (const n of this.chart.notes) if (n.beat < b0) n.judged = true;
    }

    this.trip = {
      level: 0, groove: .38, grooveBoost: 0, hueSpin: 0,
      moonSize: 0, cloudFace: 0, starBoost: 0,
      signWords: this.stage.signSets.normal
    };
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.grooveRaw = .38;
    this.distort = 0; this.hueBlip = 0; this.flash = 0;
    this.camTimer = 0; this.camZoom = 0;   // closeUp 演出（カメラが一瞬寄る）
    this.hitFx = null;
    this.shake = 0;
    this.deepest = 0;
    this.pal = {};

    PX.Audio.init();
    PX.Audio.setTrack(tr);
    PX.Audio.startEngine();   // 走行中は常にエンジン音（導入を飛ばした場合の保険も兼ねる）
    if (tr.audioUrl) {
      PX.Audio.loadExternal(tr.audioUrl).then(() => PX.Audio.play(offset)).catch(() => PX.Audio.play(offset));
    } else {
      PX.Audio.play(offset);
    }
    PX.Audio.fadeMusic(1, .8);

    // 導入シーンからの遷移では update より先に render が走るフレームがある。
    // パレット・世界の重み・道路を1回分だけ先に確定させ、
    // どの入り方でも1フレーム目から描画可能な状態にしておく。
    this.updateDrive(0);
  }

  /* ------------------------------------------------------- ループ */
  start() {
    const step = (ts) => {
      if (!this.last) this.last = ts;
      let dt = (ts - this.last) / 1000;
      this.last = ts;
      if (dt > .06) dt = .06;
      this.frame++;
      this.frameMs += (Math.min(60, dt * 1000) - this.frameMs) * .05;
      this.input.update(dt);
      // 実処理時間を測る。rAF の間隔は vsync で 16.7ms に張り付くので
      // フレーム間隔では「余裕があるか」が判定できない。
      const w0 = performance.now();
      this.update(dt);
      this.render();
      this.workMs += (Math.min(80, performance.now() - w0) - this.workMs) * .06;
      this.autoQuality(dt);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* 重い端末では解像度を1段ずつ落とし、余裕が戻れば1段ずつ戻す */
  autoQuality(dt) {
    const heavy = this.workMs > 14.0;      // 1フレームの予算 16.7ms に対して余裕なし
    const light = this.workMs < 8.5;       // 余裕あり
    if (heavy) this.qual = M.clamp(this.qual - dt * .9, .6, 1);
    else if (light) this.qual = M.clamp(this.qual + dt * .3, .6, 1);
    this.resCool -= dt;
    if (this.resCool > 0) return;
    if (heavy && this.resStep < this.resLadder.length - 1) {
      this.resStep++;
      this.p.setBaseWidth(this.resLadder[this.resStep]);
      this.resCool = 3.0;
    } else if (this.workMs < 9.0 && this.resStep > 0) {
      this.resStep--;
      this.p.setBaseWidth(this.resLadder[this.resStep]);
      this.resCool = 7.0;
    }
  }

  update(dt) {
    switch (this.scene) {
      case 'house':
        this.house.update(dt);
        if (this.house.done) this.startDrive();
        break;
      case 'drive':
        this.updateDrive(dt);
        break;
      case 'outro':
        this.outro.update(dt);
        if (this.outro.done) {
          const taps = this.input.takeTaps();
          if (taps.length) this.restart();
        }
        break;
    }
  }

  /* 任意の時刻へ移動（プレビュー用） */
  seek(t) { PX.Audio.stop(); this.p.clearHistory(); this.startDrive(t); }

  restart() {
    PX.Audio.stop();
    PX.Audio.stopEngine(.3);
    this.p.clearHistory();
    this.house = new PX.HouseScene(this.p, this.input);
    this.scene = 'house';
  }

  /* =============================================== DRIVE UPDATE */
  updateDrive(dt) {
    const p = this.p;
    // 音楽時計（音源があればそれが正、無ければ内部時計）
    if (PX.Audio.ready && PX.Audio.playing) this.songTime = PX.Audio.now();
    else this.songTime += dt;
    const t = this.songTime;

    this.cond.set(t);
    const K = this.tl.sample(t);

    /* --- グルーヴ → トリップ強度 --------------------------------- */
    this.road.setTiming(this.track.bpm, this.cond.beat);
    // 判定面は自車の位置（カメラより carDz だけ先）
    const jBeat = this.cond.beat + this.road.judgeLead();
    const judged = this.chart.update(jBeat, this.input.steer);
    for (const j of judged) this.onJudge(j);

    // 連続的なライン精度も少しだけ効かせる（“ノっている”感）
    const laneNow = this.chart.laneAt(jBeat);
    const lineAcc = M.sat(1 - Math.abs(this.input.steer - laneNow) / .5);
    this.grooveRaw = M.clamp(this.grooveRaw + (lineAcc - .5) * dt * .12, 0, 1);
    this.trip.groove = M.approach(this.trip.groove, this.grooveRaw, 1.6, dt);
    const gb = this.trip.grooveBoost = M.sat((this.trip.groove - .42) / .48);

    /* --- トリップレベル ------------------------------------------ */
    const base = K.level;
    const gate = M.sat(base / 1.5);                 // 序盤は絶対に普通のまま
    const bonus = (this.trip.groove - .45) * 3.2 * gate;
    this.trip.level = M.clamp(base + M.clamp(bonus, -1.3, 1.7), 0, 10);
    this.deepest = Math.max(this.deepest, this.trip.level);

    this.trip.hueSpin += dt * this.trip.level * .012;
    this.trip.moonSize = K.v.moonSize;
    this.trip.cloudFace = K.v.cloudFace;
    this.trip.starBoost = K.v.starBoost;
    this.trip.signWords = this.stage.signSets[K.v.signSet] || this.stage.signSets.normal;

    /* --- ワールド重み（グルーヴで deep 側へ分岐） ------------------ */
    const wts = {};
    for (const k of PX.WORLD_LIST) wts[k] = M.lerp(K.worlds[k] || 0, K.deep[k] || 0, gb);
    this.world.setTarget(wts);
    this.world.moonFace = K.v.moonFace;
    this.world.sunGlasses = K.v.sunGlasses;

    /* --- 道路 ---------------------------------------------------- */
    this.road.speed = K.v.speed * M.lerp(.94, 1.06, this.trip.groove);
    this.road.horizon = K.v.horizon;
    for (const k in WARP_DEF) {
      const boost = (k === 'widen') ? 1 : M.lerp(.85, 1.18, gb);
      this.road.warp[k] = (k === 'widen') ? K.warp[k] : K.warp[k] * boost;
    }
    // 低音で路面がうねる / ビートで幅が脈動
    this.road.warp.wave += this.cond.env.bass * .05 * M.sat(this.trip.level / 4);
    this.road.warp.breathe += this.cond.env.kick * .3 * M.sat(this.trip.level / 5);
    this.road.pitch = Math.sin(this.cond.beat * Math.PI) * this.cond.env.kick * 1.4 * M.sat(this.trip.level / 6)
                    - this.cond.env.bass * 1.2 * M.sat(this.trip.level / 8);
    this.road.roll = Math.sin(t * .21) * .05 * M.sat((this.trip.level - 5) / 5)
                   + this.input.steer * .012;
    this.road.update(dt, this.input.steer, this.cond);
    this.world.update(dt, this.cond, this.trip);

    /* --- イベント ------------------------------------------------ */
    for (const e of this.tl.events(t)) this.onEvent(e);
    // カメラ: 通常は定位置。closeUp イベント中だけ車に寄って見上げる
    this.camTimer -= dt;
    this.camZoom = M.approach(this.camZoom, this.camTimer > 0 ? 1 : 0, 2.2, dt);
    const CD = PX.ROAD_CONST.CAR_DZ, CH = PX.ROAD_CONST.CAM_H;
    this.road.carDz = M.lerp(CD, CD * .62, this.camZoom);
    this.road.camH = M.lerp(CH, CH * .72, this.camZoom);
    this.road.camFollow = M.lerp(.58, .34, this.camZoom);

    /* --- エンジン音 ---------------------------------------------- */
    PX.Audio.setEngine(.25 + M.sat(this.road.speed / 50) * .55 + Math.abs(this.input.steer) * .1,
      .085 * (1 - M.sat(this.trip.level / 14)));

    /* --- パレット ------------------------------------------------ */
    const nw = this.world.normWeights();
    // 色相は「累積回転」させない（作り込んだパレットが台無しになる）。
    // レベルに応じた有界な揺らぎ + 一瞬のブリップだけにする。
    const hueWobble = Math.sin(t * .19) * .035 * M.sat(this.trip.level / 10)
                    + Math.sin(t * .047) * .025 * M.sat((this.trip.level - 6) / 4);
    PX.blendPalette(nw, hueWobble + this.hueBlip,
      M.sat(this.trip.level / 10) * .30 + this.trip.groove * .08, this.pal);

    /* --- 減衰系 -------------------------------------------------- */
    this.distort = M.approach(this.distort, 0, 1.8, dt);
    this.hueBlip = M.approach(this.hueBlip, 0, 3.5, dt);
    this.flash = M.approach(this.flash, 0, 2.2, dt);
    this.shake = M.approach(this.shake, 0, 5, dt);
    if (this.judgeText) { this.judgeText.life -= dt; if (this.judgeText.life <= 0) this.judgeText = null; }
    if (this.hitFx) { this.hitFx.life -= dt; if (this.hitFx.life <= 0) this.hitFx = null; }
    this.updateParticles(dt);

    /* --- 終了 ---------------------------------------------------- */
    if (t >= this.stage.driveEnd) {
      this.outro = new PX.OutroScene(p);
      this.outro.stats = this.stats();
      this.scene = 'outro';
      PX.Audio.stop(1.0);
      this.p.clearHistory();
    }
  }

  stats() {
    const s = this.chart.stats;
    return {
      perfect: s.perfect, groovy: s.groovy, good: s.good, miss: s.miss,
      maxCombo: this.maxCombo, score: this.score,
      depth: Math.round(this.deepest * 10) / 10
    };
  }

  /* ------------------------------------------------------- 判定 */
  onJudge(j) {
    const g = j.grade;
    const mul = Math.min(4, 1 + this.combo / 50);
    // 自車の位置で光らせる（判定面 = 自車なので、当たった場所が一致する）
    const pose = this.road.carPose(this.p);
    this.hitFx = { grade: g, life: .5, x: pose.sx, y: pose.sy, w: pose.w };
    PX.Audio.hit(g, this.combo);
    if (g === 'MISS') {
      this.combo = 0;
      this.grooveRaw = M.clamp(this.grooveRaw - .11, 0, 1);
      this.distort = Math.min(1.4, this.distort + .9);
      this.road.kickOff(j.note.lane > this.input.steer ? -1 : 1);
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const pts = g === 'PERFECT' ? 300 : g === 'GROOVY' ? 180 : 70;
      this.score += Math.round(pts * mul);
      this.grooveRaw = M.clamp(this.grooveRaw + (g === 'PERFECT' ? .052 : g === 'GROOVY' ? .026 : -.004), 0, 1);
      if (g === 'PERFECT') {
        if (this.combo % 8 === 0) this.burst(this.p.w * .5, this.p.h * .52, 14 + this.combo / 4);
        if (this.trip.level > 7 && this.combo % 4 === 0) this.burst(this.p.w * (.2 + Math.random() * .6), this.p.h * .3, 8);
      }
    }
    this.judgeText = { g, life: .5, x: this.p.w * .5 };
  }

  /* ----------------------------------------------------- イベント */
  onEvent(e) {
    switch (e.type) {
      case 'cat':
        this.world.forceSpawn('cat', 46, (M.hash(e.t) < .5 ? -1 : 1) * 2.2, { sit: true });
        break;
      case 'hueBlip': this.hueBlip = e.amount; break;
      case 'shimmer': PX.Audio.sfx('shimmer'); break;
      case 'whoosh': PX.Audio.sfx('whoosh'); break;
      case 'tunnelIn': PX.Audio.fadeMusic(.25, 1.2); this.shake = .6; break;
      case 'tunnelOut':
        PX.Audio.fadeMusic(1, .25); PX.Audio.sfx('shimmer');
        this.flash = 1; this.burst(this.p.w * .5, this.p.h * .45, 46);
        break;
      case 'closeUp': this.camTimer = e.dur; break;
      case 'fireworks':
        for (let i = 0; i < 6; i++) this.burst(this.p.w * (.15 + Math.random() * .7), this.p.h * (.15 + Math.random() * .4), 26);
        break;
      case 'whiteout': this.flash = 1.6; PX.Audio.sfx('shimmer'); break;
      case 'musicOut': PX.Audio.fadeMusic(0, 3.0); break;
    }
  }

  /* --------------------------------------------------- パーティクル */
  burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 90;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20,
        life: .5 + Math.random() * .9, max: 1.4,
        c: C.rainbow(Math.random(), .62)
      });
    }
    if (this.particles.length > 460) this.particles.splice(0, this.particles.length - 460);
  }
  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 42 * dt;
      q.vx *= (1 - dt * 1.1); q.life -= dt;
      if (q.life <= 0) this.particles.splice(i, 1);
    }
  }

  /* ================================================== RENDER */
  render() {
    const p = this.p;
    switch (this.scene) {
      case 'house': this.house.render(); break;
      case 'drive': this.renderDrive(); break;
      case 'outro': this.outro.render(this.outro.stats); break;
    }
    p.time = performance.now() / 1000;
    p.present();
  }

  renderDrive() {
    const p = this.p, pal = this.pal, cond = this.cond, trip = this.trip, road = this.road;
    p.clear(pal.skyTop);

    this.world.render(p, pal, cond, trip, road);
    road.render(p, pal, cond.env, trip);
    road.renderNotes(p, pal, cond, trip);
    this.world.renderObjects(p, pal, cond, trip, road);
    road.renderGuide(p, pal, M.sat(1.2 - trip.level / 6) * .8, cond.env);

    // ドットの花火
    for (const q of this.particles) {
      const a = M.sat(q.life / q.max) * 1.2;
      p.rectA(q.x, q.y, 1 + (q.life > .8 ? 1 : 0), 1 + (q.life > .8 ? 1 : 0), q.c, a);
    }

    // トンネル（世界が一度閉じる。ここが南国への切り替え点）
    const tun = this.tl.out.v.tunnelDark;
    if (tun > .02) this.drawTunnel(tun);

    this.drawCar();
    this.drawHit();
    this.drawHUD();
    this.applyFx();
  }

  /* トンネル: 暗い壁と天井灯が流れる */
  drawTunnel(a) {
    const p = this.p, road = this.road, pal = this.pal;
    const hz = road.horizonY(p);
    const wall = C.mix(pal.near, [6, 5, 10], .8);
    const q = {};
    for (let y = 0; y < p.h; y++) {
      const t = M.sat((y - hz + 24) / (p.h - hz + 24));
      const open = M.lerp(.10, .62, Math.pow(t, .7)) * M.lerp(1.6, 1, a);
      const half = p.w * open;
      const x0 = Math.round(p.w * .5 - half), x1 = Math.round(p.w * .5 + half);
      if (x0 > 0) p.rectA(0, y, x0, 1, wall, a);
      if (x1 < p.w) p.rectA(x1, y, p.w - x1, 1, wall, a);
      if (x0 > 0) p.rectA(x0 - 1, y, 2, 1, C.mix(wall, pal.lightGlow, .18), a * .8);
      if (x1 < p.w) p.rectA(x1 - 1, y, 2, 1, C.mix(wall, pal.lightGlow, .18), a * .8);
    }
    for (let i = 0; i < 12; i++) {
      const dz = M.mod(i * 5 - road.z * .55, 60) + 1.2;
      road.project(p, dz, 0, q);
      const y = Math.round(hz - (q.sy - hz) * .75);
      if (y < 0 || y > hz + 10) continue;
      const w = Math.max(1, q.sw * .5);
      p.rectA(q.sx - w / 2, y, w, Math.max(1, q.sc * 3), pal.lightGlow, a * .9);
    }
  }

  /* ------------------------------------------------ 自車（三人称） */
  drawCar() {
    const p = this.p, road = this.road, pal = this.pal, cond = this.cond;
    const pose = road.carPose(p);
    if (pose.sy < -40 || pose.sy > p.h + 80) return;
    const beat = cond.env.kick;
    // 排気煙（速度とビートで吹く）
    const u = pose.w / 9;
    if (u > .5) {
      for (let i = 0; i < 3; i++) {
        const q = this.exhaust[i] || (this.exhaust[i] = { t: Math.random() });
        q.t += .02 + beat * .03;
        if (q.t > 1) q.t -= 1;
        const a = (1 - q.t) * .22 * (.4 + beat * .6);
        const r = u * (1.2 + q.t * 3.4);
        p.circle(pose.sx - pose.w * .74 + (i - 1) * u * .6, pose.sy - u * 4 + q.t * u * 3,
          r, C.cssa(C.mix(pal.fog, [220, 220, 230], .5), a));
      }
    }
    PX.draw.carRear(p, pose.sx, pose.sy, pose.w, {
      bank: road.bank,
      bounce: -beat * 1.1 - cond.env.bass * .5,
      brake: this.distort * .5,
      beat,
      body: C.mix([206, 62, 96], pal.accentC, .30 + M.sat(this.trip.level / 10) * .35),
      glass: C.mix([64, 88, 128], pal.accentB, .35)
    });
  }

  /* 判定の瞬間を自車の足元で光らせる */
  drawHit() {
    const h = this.hitFx;
    if (!h) return;
    const p = this.p, pal = this.pal;
    const k = M.sat(h.life / .5);
    const col = h.grade === 'PERFECT' ? [255, 244, 150] : h.grade === 'GROOVY' ? [150, 255, 225]
      : h.grade === 'GOOD' ? [205, 205, 225] : [255, 120, 140];
    const r = h.w * (.9 + (1 - k) * 1.7);
    p.ring(h.x, h.y - 2, r, C.css(col), k * k * .75, 1);
    if (h.grade === 'PERFECT') p.ring(h.x, h.y - 2, r * .55, C.css(col), k * .5, 1);
    // 路面に残る光
    p.rectA(h.x - h.w, h.y - 1, h.w * 2, 2, col, k * .45);
  }

  /* ---------------------------------------------------------- HUD */
  drawHUD() {
    const p = this.p, pal = this.pal;
    // 進行ゲージ（極細）
    const prog = M.sat(this.songTime / this.stage.driveEnd);
    p.rectA(0, 0, p.w, 1, [0, 0, 0], .35);
    p.rect(0, 0, Math.round(p.w * prog), 1, C.mix(pal.line, pal.accentA, .5));

    // スコア / コンボ
    p.text(String(this.score), 4, 4, C.cssa(pal.line, .70), 1, 1);
    if (this.combo > 2) {
      const s = this.combo >= 50 ? 2 : 1;
      const col = this.combo >= 50 ? C.rainbow(performance.now() / 900, .65) : pal.line;
      const txt = this.combo + 'x';
      p.text(txt, p.w - PX.textWidth(txt, s, 1) - 4, 4, C.cssa(col, .8), s, 1);
    }

    // 判定表示（小さく、一瞬だけ）
    if (this.judgeText) {
      const j = this.judgeText;
      const a = M.sat(j.life / .42);
      const col = j.g === 'PERFECT' ? [255, 240, 140] : j.g === 'GROOVY' ? [140, 255, 220]
        : j.g === 'GOOD' ? [200, 200, 220] : [255, 130, 150];
      const y = Math.round(p.h * .78 - (1 - a) * 5);
      p.textC(j.g, p.w * .5, y, C.cssa(col, a * .85), 1, 1);
    }
  }

  /* ------------------------------------------------ ポストエフェクト
     stage データの fx 値は 0..1 の「許容範囲のうちどれだけ使うか」。
     実際の振れ幅は下の FX_MAX がエンジン側の責任として決める。
     これがあるので data 側は思い切り 1.0 と書ける。 */
  applyFx() {
    const p = this.p, K = this.tl.out, trip = this.trip, cond = this.cond;
    const fx = p.fx;
    p.resetFx();
    const lv = M.sat(trip.level / 10);
    const gK = M.lerp(.84, 1.16, trip.grooveBoost);
    const Q = this.qual;   // 自動品質（重い端末では静かに下がる）
    /* 解像度を下げてもまだ重い端末では、最も高価な効果から順に切る。
       万華鏡とトンネルは画素ごとに極座標演算が要るので真っ先に落とす。 */
    const tier = this.resStep;
    const Qpolar = tier >= 4 ? 0 : tier === 3 ? .45 : tier === 2 ? .75 : 1;
    const Qmelt = tier >= 3 ? .4 : 1;
    const beat = cond.env.kick, bass = cond.env.bass;
    const X = FX_MAX;
    const now = performance.now();

    // 走行ライン保護: トリップが深いほど「空で暴れて道路は守る」
    fx.protectY = this.road.horizon + .02;
    fx.protect = M.lerp(.40, .90, lv);

    fx.wave = Math.min(X.wave, (K.fx.wave * X.wave + this.distort * .12) * gK);
    fx.waveFreq = 1 + lv * 1.4;
    fx.waveSpeed = .8 + lv;
    fx.vwave = K.fx.vwave * X.vwave + this.distort * .06;
    fx.ripple = Math.min(X.ripple * 1.6, (K.fx.ripple * X.ripple + this.distort * .22) * gK);
    fx.rippleCX = .5; fx.rippleCY = this.road.horizon;
    fx.rgb = K.fx.rgb * X.rgb * (.72 + beat * .5) * gK;
    fx.hue = K.fx.hue * X.hue * Math.sin(now / 4200) + this.hueBlip * .5;
    fx.sat = K.fx.sat * X.sat * gK;
    fx.bright = K.fx.bright * (1 + beat * .04 * lv);
    fx.invert = K.fx.invert * X.invert * (.4 + .6 * Math.abs(Math.sin(now / 3300)));
    fx.posterize = K.fx.posterize * X.posterize;
    fx.trails = K.fx.trails * X.trails * (.85 + this.trip.groove * .25) * Q;
    fx.melt = K.fx.melt * X.melt * gK * Q * Qmelt;
    fx.kaleido = K.fx.kaleido * X.kaleido * gK * (.88 + beat * .14) * Q * Qpolar;
    fx.kaleidoSeg = 4 + Math.floor(lv * 4);
    fx.kaleidoRot = now / 11000;
    fx.tunnel = K.fx.tunnel * X.tunnel * gK * Q * Qpolar;
    fx.vignette = K.fx.vignette + (1 - lv) * .10;
    fx.scan = .09 + lv * .10;
    fx.zoom = 1 + beat * .010 * lv + bass * .006;
    fx.rot = Math.sin(now / 5200) * .014 * lv;
    fx.shakeX = (Math.random() - .5) * this.shake * 6 + this.input.wheelKick * (Math.random() - .5) * 1.6;
    fx.shakeY = (Math.random() - .5) * this.shake * 4;
    fx.flash = M.sat(this.flash * .9 + K.fx.flash * this.flash);
    fx.flashColor = [255, 252, 245];
  }
}

/* --------------------------------------------------------- boot */
function boot() {
  const cv = document.getElementById('view');
  const g = new PX.Game(cv);
  PX.game = g;
  g.start();
  /* デバッグ/プレビュー用: ?t=225 で任意の時刻から、?skip=1 で導入を飛ばす
     （PX.game.seek(秒) でもいつでも移動できる） */
  const q = new URLSearchParams(location.search);
  const t0 = parseFloat(q.get('t'));
  if (q.get('skip') || !isNaN(t0)) g.startDrive(isNaN(t0) ? 0 : t0);
  // 初回タッチで AudioContext を起こす
  const unlock = () => { PX.Audio.init(); };
  document.addEventListener('touchstart', unlock, { once: true });
  document.addEventListener('mousedown', unlock, { once: true });
}
PX.Game = Game;
if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 0);
else window.addEventListener('DOMContentLoaded', boot);

})(window.PX);
