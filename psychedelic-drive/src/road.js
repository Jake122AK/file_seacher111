/* =====================================================================
   road.js — 譜面(Chart) + 擬似3D道路レンダラ + 判定
   ---------------------------------------------------------------------
   ★ 本作の中核アイデア ★
   ノーツは降ってこない。「道路の曲線そのもの」が譜面である。
   距離 dz 先の道路中心は「(dz / 速度) 秒後の譜面レーン値」で決まるので、
   プレイヤーは前方の道路を見るだけで未来の譜面を読める。
   ハンドルを曲線の中心に合わせ続ける = 正確に演奏する、になる。
   ===================================================================== */
(function (PX) {
'use strict';
const M = PX.M, C = PX.C;

/* ===================================================== Chart (譜面) */
class Chart {
  constructor(track) {
    this.track = track;
    this.notes = [];
    this.build();
    this.res = 8;                       // 1拍あたりのサンプル数
    this.bake();
    this.judgeWindow = .20;             // 拍単位
    this.cursor = 0;
    this.stats = { perfect: 0, groovy: 0, good: 0, miss: 0, total: 0 };
  }

  build() {
    const tr = this.track;
    if (tr.chart && tr.chart.length) { this.notes = tr.chart.slice(); }
    else this.notes = PX.generateChart(tr);
    this.notes.sort((a, b) => a.beat - b.beat);
    for (const n of this.notes) { n.judged = false; n.bestErr = 9; n.seen = false; }
  }

  bake() {
    const last = this.notes.length ? this.notes[this.notes.length - 1].beat : 0;
    const total = Math.ceil(last + 32);
    const n = total * this.res;
    const arr = this.lane = new Float32Array(n + 2);
    let idx = 0;
    for (let i = 0; i <= n; i++) {
      const beat = i / this.res;
      arr[i] = this._laneRaw(beat, idx);
      while (idx + 1 < this.notes.length && this.notes[idx + 1].beat <= beat) idx++;
    }
    this.maxBeat = total;
  }

  _laneRaw(beat) {
    const N = this.notes;
    if (!N.length) return 0;
    if (beat <= N[0].beat) return N[0].lane * M.smooth(beat / Math.max(.001, N[0].beat));
    let i = 0;
    // 二分探索
    let lo = 0, hi = N.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (N[mid].beat <= beat) lo = mid; else hi = mid - 1; }
    i = lo;
    const a = N[i], b = N[i + 1];
    if (!b) return a.lane;
    const t = M.sat((beat - a.beat) / Math.max(.0001, b.beat - a.beat));
    switch (b.kind) {
      case 'snap':  return M.lerp(a.lane, b.lane, M.smoother(M.sat((t - .55) / .45)));
      case 'hold':  return M.lerp(a.lane, b.lane, M.smooth(M.sat((t - .72) / .28)));
      case 'swing': return M.lerp(a.lane, b.lane, t < .5 ? M.smooth(t * 2) * .58 : .58 + M.smooth((t - .5) * 2) * .42);
      default:      return M.lerp(a.lane, b.lane, M.smoother(t));
    }
  }

  /* 拍位置のレーン値（ベイク済み配列を線形補間） */
  laneAt(beat) {
    if (beat < 0) return 0;
    const f = beat * this.res;
    const i = f | 0;
    if (i >= this.lane.length - 1) return this.lane[this.lane.length - 1];
    const t = f - i;
    return this.lane[i] + (this.lane[i + 1] - this.lane[i]) * t;
  }

  /* 判定: 毎フレーム呼ぶ。確定した判定を配列で返す */
  update(beat, steer) {
    const out = [];
    const W = this.judgeWindow;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.beat - W > beat) break;
      if (n.judged) { if (i === this.cursor) this.cursor++; continue; }
      const d = beat - n.beat;
      if (d >= -W && d <= W) {
        const err = Math.abs(steer - n.lane);
        if (err < n.bestErr) n.bestErr = err;
      }
      if (d > W) {
        n.judged = true;
        const e = n.bestErr;
        let g;
        if (e < .15) g = 'PERFECT';
        else if (e < .27) g = 'GROOVY';
        else if (e < .44) g = 'GOOD';
        else g = 'MISS';
        this.stats[g.toLowerCase()]++;
        this.stats.total++;
        out.push({ grade: g, note: n, err: e });
        if (i === this.cursor) this.cursor++;
      }
    }
    return out;
  }
}
PX.Chart = Chart;

/* 譜面自動生成（セクションの style / density から作る）
   実楽曲を入れる時は track.chart に配列を渡せばこちらは使われない。   */
PX.generateChart = function (track) {
  const notes = [];
  const bpb = track.beatsPerBar || 4;
  const secs = track.sections;
  for (let s = 0; s < secs.length; s++) {
    const sec = secs[s];
    const bars = (s + 1 < secs.length ? secs[s + 1].bar : sec.bar + (sec.bars || 8)) - sec.bar;
    const rng = M.rng(1000 + s * 137 + (sec.seed || 0));
    const style = sec.style || 'straight';
    const amp = sec.amp === undefined ? .6 : sec.amp;
    for (let b = 0; b < bars; b++) {
      const bar0 = (sec.bar + b) * bpb;
      const r = rng();
      switch (style) {
        case 'still':
          if (b % 4 === 0) notes.push({ beat: bar0, lane: 0, kind: 'ease' });
          break;
        case 'straight':
          notes.push({ beat: bar0, lane: (r < .5 ? -1 : 1) * amp * (.35 + rng() * .3), kind: 'ease' });
          notes.push({ beat: bar0 + 2, lane: (r < .5 ? 1 : -1) * amp * (.35 + rng() * .3), kind: 'ease' });
          break;
        case 'sway': {
          const s0 = r < .5 ? -1 : 1;
          for (let k = 0; k < 4; k++)
            notes.push({ beat: bar0 + k, lane: s0 * (k % 2 ? -1 : 1) * amp * (.55 + rng() * .35), kind: 'ease' });
          break;
        }
        case 'skank': {
          // 裏拍でクイッと寄せる（レゲエのスキャンク）
          const s0 = r < .5 ? -1 : 1;
          for (let k = 0; k < 4; k++) {
            notes.push({ beat: bar0 + k + .5, lane: s0 * (k % 2 ? -1 : 1) * amp * .85, kind: 'snap' });
            notes.push({ beat: bar0 + k + .99, lane: s0 * (k % 2 ? -1 : 1) * amp * .25, kind: 'ease' });
          }
          break;
        }
        case 'long': {
          const s0 = r < .5 ? -1 : 1;
          notes.push({ beat: bar0, lane: s0 * amp * .95, kind: 'hold' });
          notes.push({ beat: bar0 + 2, lane: s0 * amp * .95, kind: 'hold' });
          notes.push({ beat: bar0 + 3, lane: -s0 * amp * .5, kind: 'ease' });
          break;
        }
        case 'scratch': {
          for (let k = 0; k < 8; k++) {
            const l = (k % 2 ? 1 : -1) * amp * (.6 + rng() * .4);
            notes.push({ beat: bar0 + k * .5, lane: l, kind: 'snap' });
          }
          break;
        }
        case 'wave': {
          for (let k = 0; k < 8; k++)
            notes.push({ beat: bar0 + k * .5, lane: Math.sin((b * 8 + k) * .55) * amp, kind: 'swing' });
          break;
        }
        case 'wild': {
          const n = 4 + Math.floor(rng() * 5);
          for (let k = 0; k < n; k++) {
            const bt = bar0 + (k / n) * bpb;
            notes.push({ beat: bt, lane: (rng() * 2 - 1) * amp, kind: rng() < .4 ? 'snap' : 'ease' });
          }
          break;
        }
        case 'climax': {
          for (let k = 0; k < 8; k++) {
            const l = Math.sin((b * 8 + k) * .8) * amp * (.7 + .3 * Math.sin(k * 1.7));
            notes.push({ beat: bar0 + k * .5, lane: l, kind: k % 4 === 0 ? 'snap' : 'swing' });
          }
          break;
        }
      }
    }
  }
  return notes;
};

/* ======================================================== Road ===== */
const SEGLEN = 1.7;        // 縞 1 本の長さ（world units）
const LANE_AMP = 0.62;     // レーン値 1.0 が何 world unit 横に相当するか
const CAM_H = 1.20;        // 視点高（高いほど道路の奥行きが見える）
const CAM_D = 1.75;
const ROAD_HALF = 0.92;

class Road {
  constructor(chart) {
    this.chart = chart;
    this.z = 0;                 // 走行距離
    this.speed = 30;            // world units / sec
    this.carX = 0;              // 車の横位置 (world units)
    this.offRoad = 0;           // MISS で外れた量 0..1
    this.horizon = .44;         // 画面比
    this.pitch = 0;             // 上下カメラ
    this.roll = 0;
    this.warp = {
      sky: 0,      // 道路が空へ曲がる
      spiral: 0,   // 螺旋
      wave: 0,     // 上下のうねり
      snake: 0,    // 横うねり(蛇)
      loop: 0,     // 無限ループ
      breathe: 0,  // 幅の脈動
      rainbow: 0,  // 虹色化
      glow: 0,     // 白線の発光
      keys: 0,     // 鍵盤化
      tongue: 0,   // 舌化（縁が丸くなる）
      liquid: 0,   // 波形化（音の波として動く）
      widen: 1     // 幅倍率
    };
    this.N = 150;
    this.pts = new Array(this.N + 1);
    for (let i = 0; i <= this.N; i++) this.pts[i] = { dz: 0, sx: 0, sy: 0, sw: 0, sc: 0, seg: 0 };
    this.beatsPerUnit = 0;
    this.time = 0;
  }

  /* 距離 → 拍（前方の道路 = 未来の譜面） */
  setTiming(bpm, beat) {
    this.bpm = bpm;
    this.beat = beat;
    this.beatsPerUnit = (bpm / 60) / this.speed;
  }
  laneAtDz(dz) { return this.chart.laneAt(this.beat + dz * this.beatsPerUnit) * LANE_AMP; }

  /* 車の目標位置（＝プレイヤーのステア） */
  update(dt, steer, conductor) {
    this.time += dt;
    this.z += this.speed * dt;
    const target = steer * LANE_AMP;
    this.carX = M.approach(this.carX, target + this.offRoad * .55 * (this.offSide || 1), 22, dt);
    this.offRoad = M.approach(this.offRoad, 0, 1.3, dt);
  }

  kickOff(side) { this.offRoad = Math.min(1, this.offRoad + .8); this.offSide = side; }

  horizonY(p) { return Math.round(p.h * this.horizon + this.pitch); }

  /* 距離 dz、横オフセット side(world) の点をスクリーンへ投影 */
  project(p, dz, side, out) {
    out = out || {};
    dz = Math.max(.35, dz);
    const K = p.w * .58;
    const sc = CAM_D / dz;
    const lane = this.laneAtDz(dz);
    let sx = p.w * .5 + sc * ((lane + (side || 0)) - this.carX) * K;
    let sy = this.horizonY(p) + sc * CAM_H * K;
    const W = this.warp, t = this.time;

    if (W.wave) sy -= Math.sin((this.z + dz) * .13 - t * 2.2) * W.wave * sc * K * .55;
    if (W.snake) sx += Math.sin((this.z + dz) * .09 - t * 1.5) * W.snake * sc * K * .5;
    if (W.sky) {
      // 遠くほど上へ（道路が空へ立ち上がる）
      const k = Math.min(1, dz / 42);
      sy -= k * k * W.sky * p.h * .85;
    }
    if (W.loop) {
      const k = Math.min(1, dz / 38);
      sy -= Math.sin(k * Math.PI * 2 * W.loop) * p.h * .30 * Math.min(1, W.loop);
    }
    if (W.spiral) {
      const ang = (dz * .045 + t * .5) * W.spiral;
      const vx = p.w * .5, vy = this.horizonY(p);
      const dx = sx - vx, dy = sy - vy;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      sx = vx + dx * ca - dy * sa;
      sy = vy + dx * sa + dy * ca;
    }
    if (this.roll) {
      const vx = p.w * .5, vy = this.horizonY(p);
      const dx = sx - vx, dy = sy - vy;
      const ca = Math.cos(this.roll), sa = Math.sin(this.roll);
      sx = vx + dx * ca - dy * sa;
      sy = vy + dx * sa + dy * ca;
    }
    out.sx = sx; out.sy = sy; out.sc = sc;
    out.sw = sc * ROAD_HALF * K * this.warp.widen;
    return out;
  }

  /* 前方の道路を投影 */
  buildPoints(p) {
    const N = this.N;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const dz = .5 + Math.pow(t, 1.9) * 78;   // 近くを密に
      const q = this.pts[i];
      this.project(p, dz, 0, q);
      q.dz = dz;
      q.seg = Math.floor((this.z + dz) / SEGLEN);
    }
  }

  /* 道路本体を描画（遠→近のペインターズアルゴリズム） */
  render(p, pal, env, trip) {
    this.buildPoints(p);
    const ctx = p.ctx;
    const W = this.warp;
    const hz = this.horizonY(p);
    const beatPulse = env ? env.kick : 0;
    const bassPulse = env ? env.bass : 0;
    const fog = pal.fog;
    const rb = W.rainbow;

    for (let i = this.N - 1; i >= 0; i--) {
      const a = this.pts[i], b = this.pts[i + 1];
      let y0 = Math.ceil(b.sy), y1 = Math.ceil(a.sy);
      if (y1 <= hz - 6) continue;
      if (y0 < hz - 40) y0 = hz - 40;
      if (y0 >= p.h) continue;
      if (y1 > p.h) y1 = p.h;
      if (y1 <= y0) continue;

      const segEven = (a.seg & 1) === 0;
      const depth = M.sat(1 - a.dz / 62);
      const fogT = Math.pow(1 - depth, 2.1);

      for (let y = y0; y < y1; y++) {
        const t = (y - b.sy) / Math.max(.001, a.sy - b.sy);
        const sx = M.lerp(b.sx, a.sx, t);
        let sw = M.lerp(b.sw, a.sw, t);
        sw *= 1 + beatPulse * .05 * (1 + W.breathe * 3);
        if (W.liquid) sw *= 1 + Math.sin(y * .35 - this.time * 7) * .14 * W.liquid;

        // --- 地面（路面より必ず暗く保つ = 道が消えない）
        let g = segEven ? pal.ground : pal.groundAlt;
        if (rb > .01) g = C.mix(g, C.rainbow(a.seg * .017 + y * .003 + this.time * .05 + .5, .20), rb * .8);
        g = C.mix(g, [0, 0, 0], .10 + rb * .14);
        g = C.mix(g, fog, fogT * .8);
        ctx.fillStyle = C.css(g);
        ctx.fillRect(0, y, p.w, 1);

        // --- ランブル（路肩）
        let rum = segEven ? pal.rumble : pal.rumbleAlt;
        if (rb > .01) rum = C.mix(rum, C.rainbow(a.seg * .05 + this.time * .5, .68), rb);
        rum = C.mix(rum, fog, fogT * .6);
        const rw = Math.max(1, sw * .16);
        // 路肩のさらに外側に暗い縁 → 道路の輪郭が常に立つ
        ctx.fillStyle = C.css(C.mix(g, [0, 0, 0], .35));
        ctx.fillRect(Math.round(sx - sw - rw * 2.1), y, Math.max(1, Math.round(rw * 1.2)), 1);
        ctx.fillRect(Math.round(sx + sw + rw * .9), y, Math.max(1, Math.round(rw * 1.2)), 1);
        ctx.fillStyle = C.css(rum);
        ctx.fillRect(Math.round(sx - sw - rw), y, Math.max(1, Math.round(sw * 2 + rw * 2)), 1);

        // --- 路面
        let rd = segEven ? pal.road : pal.roadAlt;
        if (rb > .01) rd = C.mix(rd, C.rainbow(a.seg * .030 + y * .0055 - this.time * .12, segEven ? .56 : .47), rb);
        if (W.keys > .01) {
          // 鍵盤化: 横方向を白鍵/黒鍵に割る
          const kk = Math.floor(M.mod(a.seg, 7));
          const black = (kk === 1 || kk === 3 || kk === 5);
          rd = C.mix(rd, black ? [20, 16, 30] : [242, 240, 235], W.keys);
        }
        rd = C.mix(rd, fog, fogT * .75);
        ctx.fillStyle = C.css(rd);
        const rx0 = Math.round(sx - sw), rww = Math.max(1, Math.round(sw * 2));
        ctx.fillRect(rx0, y, rww, 1);

        // --- 白線（センター/サイド）
        if (sw > 1.2) {
          let lc = pal.line;
          if (W.glow > .01) lc = C.mix(lc, [255, 255, 255], W.glow * .8);
          if (rb > .01) lc = C.mix(lc, C.rainbow(a.seg * .05 + this.time * .3, .72), rb * .8);
          lc = C.mix(lc, fog, fogT * .55);
          ctx.fillStyle = C.css(lc);
          const lw = Math.max(1, Math.round(sw * (.06 + W.glow * .03)));
          // 外側の線
          ctx.fillRect(Math.round(sx - sw + sw * .04), y, lw, 1);
          ctx.fillRect(Math.round(sx + sw - sw * .04 - lw), y, lw, 1);
          // センターの破線
          if (a.seg % 2 === 0 && sw > 2) {
            const cw = Math.max(1, Math.round(sw * .05));
            ctx.fillRect(Math.round(sx - cw / 2), y, cw, 1);
          }
          if (W.glow > .2) {
            ctx.globalAlpha = W.glow * .35 * (0.4 + beatPulse * .6);
            ctx.fillStyle = C.css(pal.lightGlow);
            ctx.fillRect(rx0, y, rww, 1);
            ctx.globalAlpha = 1;
          }
        }

        // 低音で路面が上下に揺れる（帯を重ねて表現）
        if (bassPulse > .25 && (a.seg % 4 === 0)) {
          ctx.globalAlpha = (bassPulse - .25) * .5;
          ctx.fillStyle = C.css(pal.accentA);
          ctx.fillRect(rx0, y, rww, 1);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  /* 判定ライン付近の「今なぞるべき点」を淡く示す（UI ではなく world 内表現） */
  renderGuide(p, pal, strength, env) {
    if (strength <= .01) return;
    const q = this.project(p, 3.2, 0, {});
    const ctx = p.ctx;
    const a = strength * (.35 + (env ? env.kick : 0) * .5);
    ctx.globalAlpha = a;
    ctx.fillStyle = C.css(pal.lightGlow);
    const w = Math.max(2, q.sw * .10);
    ctx.fillRect(Math.round(q.sx - w / 2), Math.round(q.sy) - 2, Math.round(w), 3);
    ctx.globalAlpha = 1;
  }
}
PX.Road = Road;
PX.ROAD_CONST = { SEGLEN, LANE_AMP, CAM_H, CAM_D, ROAD_HALF };

})(window.PX);
