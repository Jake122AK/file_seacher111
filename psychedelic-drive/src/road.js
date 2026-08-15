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
          notes.push({ beat: bar0, lane: (r < .5 ? -1 : 1) * amp * .8, kind: 'ease' });
          notes.push({ beat: bar0 + 2, lane: (r < .5 ? 1 : -1) * amp * .8, kind: 'ease' });
          break;
        case 'straight': {
          const s0 = r < .5 ? -1 : 1;
          for (let k = 0; k < 4; k++)
            notes.push({ beat: bar0 + k, lane: s0 * (k % 2 ? -1 : 1) * amp * (.4 + rng() * .3), kind: 'ease' });
          break;
        }
        case 'sway': {
          const s0 = r < .5 ? -1 : 1;
          for (let k = 0; k < 8; k++)
            notes.push({ beat: bar0 + k * .5, lane: s0 * Math.sin(k * .785) * amp * (.6 + rng() * .3),
                         kind: k % 2 ? 'ease' : 'swing' });
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
          notes.push({ beat: bar0 + 1, lane: s0 * amp * .88, kind: 'hold' });
          notes.push({ beat: bar0 + 2, lane: s0 * amp * .95, kind: 'hold' });
          notes.push({ beat: bar0 + 3, lane: -s0 * amp * .55, kind: 'ease' });
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
const CAM_H = 1.62;        // 視点高（三人称。車を見下ろす高さ）
const CAR_DZ = 2.80;       // カメラから自車までの距離（world units）
const CAR_W = 0.34;        // 自車の半車幅（world units。道路半幅は0.92）
const CAM_D = 1.75;
const ROAD_HALF = 0.92;

class Road {
  constructor(chart) {
    this.chart = chart;
    this.z = 0;                 // 走行距離
    this.speed = 30;            // world units / sec
    this.carX = 0;              // 自車の横位置 (world units)
    this.camX = 0;              // カメラの横位置（自車に遅れて追従する）
    this.camFollow = .58;       // 追従率。1 未満だと自車が画面内で左右に振れる
    this.carDz = CAR_DZ;
    this.camH = CAM_H;
    this.bank = 0;              // 車のロール（見た目の傾き）
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
    this.N = 118;
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

  /* 判定面は「カメラ」ではなく「自車」。
     自車は dz = carDz 先にいるので、その分だけ先の拍を判定する。
     ここがズレていると、見た目でラインに乗せているのに判定が渋る。 */
  judgeLead() { return this.carDz * this.beatsPerUnit; }

  /* 車の目標位置（＝プレイヤーのステア） */
  update(dt, steer, conductor) {
    this.time += dt;
    this.z += this.speed * dt;
    const target = steer * LANE_AMP;
    const prev = this.carX;
    this.carX = M.approach(this.carX, target + this.offRoad * .18 * (this.offSide || 1), 22, dt);
    // カメラは自車に遅れて追従 → 自車が画面内で左右に振れて進路が見える
    this.camX = M.approach(this.camX, this.carX * this.camFollow, 9, dt);
    const vel = (this.carX - prev) / Math.max(.0001, dt);
    this.bank = M.approach(this.bank, M.clamp(vel * .55, -1, 1), 8, dt);
  }

  kickOff(side) { this.offRoad = Math.min(1, this.offRoad + .55); this.offSide = side; }

  horizonY(p) { return Math.round(p.h * this.horizon + this.pitch); }

  /* 距離 dz、横オフセット side(world) の点をスクリーンへ投影 */
  project(p, dz, side, out) {
    out = out || {};
    dz = Math.max(.35, dz);
    const K = p.w * .58;
    const sc = CAM_D / dz;
    const lane = this.laneAtDz(dz);
    let sx = p.w * .5 + sc * ((lane + (side || 0)) - this.camX) * K;
    let sy = this.horizonY(p) + sc * this.camH * K;
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

  /* 自車のスクリーン上の位置と大きさ */
  carPose(p) {
    const dz = this.carDz;
    // side に「自車位置 - その地点の道路中心」を渡すと、
    // 道路と同じワープが自車にも一貫して掛かる
    const out = this.project(p, dz, this.carX - this.laneAtDz(dz), {});
    out.w = out.sc * CAR_W * (p.w * .58);
    out.dz = dz;
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

      // 色は 3 行ごとにだけ作り直す（見た目は変わらず、確保と文字列生成が 1/3 になる）
      let cG = null, cRum = null, cRd = null, cLine = null, cGt = null, cGd = null, cCache = -99;
      for (let y = y0; y < y1; y++) {
        const t = (y - b.sy) / Math.max(.001, a.sy - b.sy);
        const sx = M.lerp(b.sx, a.sx, t);
        let sw = M.lerp(b.sw, a.sw, t);
        sw *= 1 + beatPulse * .05 * (1 + W.breathe * 3);
        if (W.liquid) sw *= 1 + Math.sin(y * .35 - this.time * 7) * .14 * W.liquid;

        // --- 色の再計算（3行ごと）
        if (y - cCache >= 3 || cG === null) {
          cCache = y;
          let g = segEven ? pal.ground : pal.groundAlt;
          if (rb > .01) g = C.mix(g, C.rainbow(a.seg * .017 + y * .003 + this.time * .05 + .5, .20), rb * .8);
          g = C.mix(g, [0, 0, 0], .10 + rb * .14);
          g = C.mix(g, fog, fogT * .8);
          cG = C.css(g);
          cGt = C.css(C.mix(g, pal.accentA, .10 + rb * .18));
          cGd = C.css(C.mix(g, [0, 0, 0], .30));
          let rum = segEven ? pal.rumble : pal.rumbleAlt;
          if (rb > .01) rum = C.mix(rum, C.rainbow(a.seg * .05 + this.time * .5, .68), rb);
          cRum = C.css(C.mix(rum, fog, fogT * .6));
          let rd = segEven ? pal.road : pal.roadAlt;
          if (rb > .01) rd = C.mix(rd, C.rainbow(a.seg * .030 + y * .0055 - this.time * .12, segEven ? .56 : .47), rb);
          if (W.keys > .01) {
            const kk = Math.floor(M.mod(a.seg, 7));
            const black = (kk === 1 || kk === 3 || kk === 5);
            rd = C.mix(rd, black ? [20, 16, 30] : [242, 240, 235], W.keys);
          }
          cRd = C.css(C.mix(rd, fog, fogT * .75));
          let lc = pal.line;
          if (W.glow > .01) lc = C.mix(lc, [255, 255, 255], W.glow * .8);
          if (rb > .01) lc = C.mix(lc, C.rainbow(a.seg * .05 + this.time * .3, .72), rb * .8);
          cLine = C.css(C.mix(lc, fog, fogT * .55));
        }

        ctx.fillStyle = cG;
        ctx.fillRect(0, y, p.w, 1);

        // --- 路肩の下草（セグメント単位で流れるので速度感が出る）
        if (sw > 1.6 && fogT < .85 && (y & 1) === 0) {
          for (let k = 0; k < 3; k++) {
            const hh = M.hash2(a.seg * 2.3 + k * 7.1, k * 3.7);
            const wpx = 1 + (hh > .72 ? 1 : 0);
            ctx.fillStyle = hh > .5 ? cGt : cGd;
            ctx.fillRect(Math.round(sx - sw * (1.30 + hh * 3.4)), y, wpx, 1);
            const hh2 = M.hash2(a.seg * 2.3 + k * 7.1 + 31, k * 3.7);
            ctx.fillStyle = hh2 > .5 ? cGt : cGd;
            ctx.fillRect(Math.round(sx + sw * (1.30 + hh2 * 3.4)), y, wpx, 1);
          }
        }

        // --- ランブル（路肩）
        const rw = Math.max(1, sw * .16);
        // 路肩のさらに外側に暗い縁 → 道路の輪郭が常に立つ
        ctx.fillStyle = cGd;
        ctx.fillRect(Math.round(sx - sw - rw * 2.1), y, Math.max(1, Math.round(rw * 1.2)), 1);
        ctx.fillRect(Math.round(sx + sw + rw * .9), y, Math.max(1, Math.round(rw * 1.2)), 1);
        ctx.fillStyle = cRum;
        ctx.fillRect(Math.round(sx - sw - rw), y, Math.max(1, Math.round(sw * 2 + rw * 2)), 1);

        // --- 路面
        ctx.fillStyle = cRd;
        const rx0 = Math.round(sx - sw), rww = Math.max(1, Math.round(sw * 2));
        ctx.fillRect(rx0, y, rww, 1);

        // --- 白線（センター/サイド）
        if (sw > 1.2) {
          ctx.fillStyle = cLine;
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

  /*
    譜面マーカー — 音ゲー感の本体。
    ノーツを画面上部から降らせるのではなく、路面に「拍のライン」と
    「そこで乗るべき点」を描いて手前へ流す。自車に到達した瞬間が判定。
    UI ではなく世界の一部なので、視線は道路から外れない。
  */
  renderNotes(p, pal, cond, trip) {
    const notes = this.chart.notes;
    if (!notes.length) return;
    /* 冒頭の「完全に普通のドライブ」では譜面表示を出さない。
       音楽が世界を侵食し始める(level>0.6)のに合わせて浮かび上がらせる。 */
    const vis = M.sat((trip.level - 0.6) / 1.6);
    if (vis <= .01) return;
    const ctx = p.ctx;
    const beat = this.beat;
    const bpu = this.beatsPerUnit;
    const lead = this.judgeLead();
    const q = {};
    const FAR = 46;   // これ以上遠いと地平線に潰れて読めないので描かない

    /* --- 拍のグリッド ---
       ノーツが疎な区間でも「音楽が路面を流れている」状態を作る。
       8分ごとに細い線、拍で太く、小節頭で最も明るい。
       これが手前へ流れ続けるので、曲に乗っている感覚が視覚的に生まれる。 */
    const bpb = this.chart.track.beatsPerBar || 4;
    const jb = beat + lead;
    /* 判定面より手前(=通過済み)も描く。ここを描かないと画面の下半分に
       拍が存在せず、流れが途切れて「音に乗っている」感覚が出ない。 */
    const gridStart = Math.ceil((jb - 1.5) * 2) / 2;
    for (let gb = gridStart; ; gb += .5) {
      const gdz = (gb - beat) / bpu;
      if (gdz > FAR) break;
      if (gdz < .4) continue;
      this.project(p, gdz, 0, q);
      if (q.sw < .8 || q.sy > p.h + 8) continue;
      const isBeat = Math.abs(gb - Math.round(gb)) < .01;
      const isBar = isBeat && Math.abs(M.mod(gb, bpb)) < .01;
      const app = M.sat((FAR - gdz) / FAR);
      const gPassed = M.sat((this.carDz - gdz) / 2.0);
      const a = (isBar ? .78 : isBeat ? .52 : .26) * (.35 + app * .85) * vis * (1 - gPassed * .8);
      const hgt = M.clamp(Math.round(q.sc * (isBar ? 15 : isBeat ? 10 : 5)), 1, Math.round(p.h * .035));
      ctx.globalAlpha = a;
      // 暗い縁を先に置いて、路面の色に関わらず線が立つようにする
      ctx.fillStyle = '#000';
      ctx.globalAlpha = a * .5;
      ctx.fillRect(Math.round(q.sx - q.sw), Math.round(q.sy) + hgt, Math.max(1, Math.round(q.sw * 2)), Math.max(1, Math.round(hgt * .6)));
      ctx.globalAlpha = a;
      ctx.fillStyle = C.css(isBar ? pal.accentA : pal.line);
      ctx.fillRect(Math.round(q.sx - q.sw), Math.round(q.sy), Math.max(1, Math.round(q.sw * 2)), hgt);
      if (isBeat) {   // 白い芯を入れて、どんな路面色でも線が読める
        ctx.globalAlpha = a * .85;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(q.sx - q.sw), Math.round(q.sy), Math.max(1, Math.round(q.sw * 2)),
          Math.max(1, Math.round(hgt * .4)));
      }
      ctx.globalAlpha = 1;
    }

    // 表示範囲の先頭ノートを二分探索
    let lo = 0, hi = notes.length - 1, start = notes.length;
    const minBeat = beat + lead - 1.2;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].beat >= minBeat) { start = mid; hi = mid - 1; } else lo = mid + 1;
    }

    for (let i = start; i < notes.length; i++) {
      const n = notes[i];
      const dz = (n.beat - beat) / bpu;          // そのノーツが今どこにあるか
      if (dz > FAR) break;
      if (dz < .4) continue;
      this.project(p, dz, 0, q);
      if (q.sy < this.horizonY(p) - 4 || q.sy > p.h + 8) continue;
      if (q.sw < 1.0) continue;
      const app = M.sat((FAR - dz) / (FAR - this.carDz));       // 手前ほど 1
      const imminent = M.sat(1 - Math.abs(dz - this.carDz) / 9);// 到達前後で強く光る
      const passed = M.sat((this.carDz - dz) / 1.8);            // 通過後は素早く消す
      const pf = 1 - passed * .88;
      const strong = (n.kind === 'snap' || n.kind === 'hold');

      // 拍のライン（路面を横切る帯）。到達間際に一気に明るくなる = 「今」が分かる
      const a = (.30 + app * .50 + imminent * .55) * (strong ? 1 : .74) * M.lerp(.45, 1, vis) * pf;
      const bandH = M.clamp(Math.round(q.sc * (strong ? 20 : 13)), 1, Math.round(p.h * .05));
      ctx.globalAlpha = M.sat(a);
      ctx.fillStyle = C.css(C.mix(pal.line, strong ? pal.accentB : pal.accentA, .3 + app * .35));
      ctx.fillRect(Math.round(q.sx - q.sw * .96), Math.round(q.sy), Math.max(1, Math.round(q.sw * 1.92)), bandH);
      // 帯の芯（白）
      ctx.globalAlpha = M.sat(a * .9);
      ctx.fillStyle = C.css(C.mix(pal.lightGlow, [255, 255, 255], .5));
      ctx.fillRect(Math.round(q.sx - q.sw * .96), Math.round(q.sy), Math.max(1, Math.round(q.sw * 1.92)),
        Math.max(1, Math.round(bandH * .35)));

      // 乗るべき点（路面中央のひし形）
      const lx = q.sx + q.sc * (n.lane * LANE_AMP - this.laneAtDz(dz)) * (p.w * .58);
      const r = M.clamp(Math.round(q.sc * (9 + app * 12 + imminent * 10)), 1, Math.round(p.h * .06));
      ctx.globalAlpha = M.sat((.40 + app * .5 + imminent * .45) * M.lerp(.5, 1, vis) * pf);
      ctx.fillStyle = C.css(strong ? pal.accentB : pal.lightGlow);
      for (let k = -r; k <= r; k++) {
        const wq = r - Math.abs(k);
        if (wq < 0) continue;
        ctx.fillRect(Math.round(lx - wq), Math.round(q.sy + k), Math.max(1, wq * 2), 1);
      }
      ctx.globalAlpha = 1;
    }

    /* --- ターゲット --- 「今この瞬間、車が居るべき点」を常時表示する。
       自車とこのマーカーの距離がそのままズレ量なので、
       プレイヤーは何をすれば良いかを一瞬で理解できる。 */
    this.project(p, this.carDz, 0, q);
    if (q.sw > 2) {
      const err = Math.abs(this.carX - this.laneAtDz(this.carDz)) / LANE_AMP;
      const good = M.sat(1 - err / .45);
      const pulse = .55 + cond.env.kick * .45;
      const col = C.mix(pal.line, pal.accentA, .25 + good * .5);
      const w2 = Math.max(2, Math.round(q.sw * .16));
      const hh = Math.max(1, Math.round(q.sc * 9));
      ctx.globalAlpha = M.sat((.35 + good * .5) * pulse * M.lerp(.5, 1, vis));
      // 中央のくさび
      ctx.fillStyle = C.css(col);
      for (let k = 0; k < hh; k++) {
        const ww = Math.max(1, Math.round(w2 * (1 - k / hh)));
        ctx.fillRect(Math.round(q.sx - ww), Math.round(q.sy - k), ww * 2, 1);
      }
      // ぴったり乗っていると光る
      if (good > .72) {
        ctx.globalAlpha = (good - .72) / .28 * .5 * pulse;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(q.sx - w2), Math.round(q.sy - hh), w2 * 2, Math.max(1, Math.round(hh * .5)));
      }
      ctx.globalAlpha = 1;
    }

    // 判定面（自車の足元）を路肩に小さく示す
    this.project(p, this.carDz, 0, q);
    if (q.sw > 2) {
      const pulse = .45 + cond.env.kick * .55;
      ctx.globalAlpha = .5 * pulse;
      ctx.fillStyle = C.css(pal.lightGlow);
      const tw = Math.max(2, Math.round(q.sw * .18));
      ctx.fillRect(Math.round(q.sx - q.sw - tw), Math.round(q.sy) - 1, tw, 3);
      ctx.fillRect(Math.round(q.sx + q.sw), Math.round(q.sy) - 1, tw, 3);
      ctx.globalAlpha = 1;
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
PX.ROAD_CONST = { SEGLEN, LANE_AMP, CAM_H, CAM_D, ROAD_HALF, CAR_DZ, CAR_W };

})(window.PX);
