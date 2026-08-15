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

/* ===================================================== Chart (譜面)
   5レーンのタップ譜面。ノーツは路面を手前へ流れ、判定ラインで叩く。
   道路のうねり(path)は「見た目」専用で、判定には一切関与しない。
   → 世界がどれだけグニャグニャに歪んでも、叩くべきタイミングは壊れない。
   ===================================================================== */
const LANES = 5;
/* レーン固有色（サイケ寄りに彩度を上げた5色） */
const LANE_COL = [
  [255, 90, 140], [255, 178, 60], [120, 255, 150], [80, 200, 255], [190, 120, 255]
];
PX.LANE_COL = LANE_COL;

class Chart {
  constructor(track) {
    this.track = track;
    this.notes = [];
    this.build();
    this.res = 4;
    this.bakePath();
    this.cursor = 0;
    // 判定幅（拍単位）。84BPM なら 1拍 = 0.714秒
    this.win = { perfect: .10, groovy: .19, good: .30 };
    this.stats = { perfect: 0, groovy: 0, good: 0, miss: 0, total: 0 };
  }

  build() {
    const tr = this.track;
    this.notes = (tr.chart && tr.chart.length) ? tr.chart.slice() : PX.generateChart(tr);
    this.notes.sort((a, b) => a.beat - b.beat);
    for (const n of this.notes) {
      n.lane = M.clamp(n.lane | 0, 0, LANES - 1);
      n.judged = false; n.hit = 0;
    }
  }

  /* 道路のうねり（装飾）。セクションの amp に合わせて振幅が変わる */
  bakePath() {
    const tr = this.track, bpb = tr.beatsPerBar || 4;
    const secs = tr.sections;
    const lastBar = secs[secs.length - 1].bar + (secs[secs.length - 1].bars || 8);
    const total = Math.ceil(lastBar * bpb) + 16;
    const n = total * this.res;
    const arr = this.path = new Float32Array(n + 2);
    for (let i = 0; i <= n; i++) {
      const beat = i / this.res;
      const bar = beat / bpb;
      let amp = .5;
      for (let k = 0; k < secs.length; k++) if (bar >= secs[k].bar) amp = secs[k].amp === undefined ? .5 : secs[k].amp;
      arr[i] = (Math.sin(beat * .17) * .62 + Math.sin(beat * .43 + 1.7) * .3 + Math.sin(beat * .07) * .28) * amp;
    }
    this.maxBeat = total;
  }

  pathAt(beat) {
    if (beat < 0) return 0;
    const f = beat * this.res, i = f | 0;
    if (i >= this.path.length - 1) return this.path[this.path.length - 1];
    return this.path[i] + (this.path[i + 1] - this.path[i]) * (f - i);
  }

  /* 指定レーンのタップを試みる。判定できたら結果を返す */
  tryHit(beat, lane) {
    const W = this.win.good;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.beat - beat > W) break;
      if (n.judged || n.lane !== lane) continue;
      const d = Math.abs(n.beat - beat);
      if (d > W) continue;
      n.judged = true; n.hit = 1;
      const g = d < this.win.perfect ? 'PERFECT' : d < this.win.groovy ? 'GROOVY' : 'GOOD';
      this.stats[g.toLowerCase()]++; this.stats.total++;
      return { grade: g, note: n, err: d };
    }
    return null;
  }

  /* 見逃しの確定。毎フレーム呼ぶ */
  update(beat) {
    const out = [];
    const W = this.win.good;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.beat + W > beat) break;
      if (!n.judged) {
        n.judged = true;
        this.stats.miss++; this.stats.total++;
        out.push({ grade: 'MISS', note: n, err: 9 });
      }
      if (i === this.cursor) this.cursor++;
    }
    // cursor は「まだ判定され得る最古のノーツ」まで進める
    while (this.cursor < this.notes.length &&
           this.notes[this.cursor].judged &&
           this.notes[this.cursor].beat + W < beat) this.cursor++;
    return out;
  }
}
PX.Chart = Chart;
PX.LANES = LANES;

/* 譜面自動生成。セクションの style がレーンの並びを決める。
   実楽曲を入れる時は track.chart に [{beat, lane}] を渡せばこちらは使われない。 */
PX.generateChart = function (track) {
  const notes = [];
  const bpb = track.beatsPerBar || 4;
  const secs = track.sections;
  const push = (beat, lane, kind) => notes.push({ beat, lane: M.clamp(lane, 0, 4), kind: kind || 'tap' });

  for (let s = 0; s < secs.length; s++) {
    const sec = secs[s];
    const bars = (s + 1 < secs.length ? secs[s + 1].bar : sec.bar + (sec.bars || 8)) - sec.bar;
    const rng = M.rng(1000 + s * 137 + (sec.seed || 0));
    const style = sec.style || 'straight';
    for (let b = 0; b < bars; b++) {
      const t0 = (sec.bar + b) * bpb;
      const r = rng();
      switch (style) {
        case 'still':
          push(t0, 2);
          break;
        case 'straight':
          push(t0, r < .5 ? 1 : 3);
          push(t0 + 2, r < .5 ? 3 : 1);
          break;
        case 'sway': {
          const d = r < .5 ? 1 : -1;
          for (let k = 0; k < 4; k++) push(t0 + k, 2 + d * (k % 2 ? 1 : -1) * (1 + (k > 1 ? 1 : 0)));
          break;
        }
        case 'skank':
          // レゲエの裏拍。2 と 4 の裏で外側を叩く
          for (let k = 0; k < 4; k++) {
            push(t0 + k + .5, k % 2 ? 0 : 4);
            if (k % 2 === 0) push(t0 + k, 2);
          }
          break;
        case 'long': {
          const d = r < .5 ? 1 : -1;
          push(t0, 2 - d, 'accent');
          push(t0 + 1.5, 2);
          push(t0 + 2, 2 + d, 'accent');
          push(t0 + 3.5, 2);
          break;
        }
        case 'scratch':
          for (let k = 0; k < 8; k++) push(t0 + k * .5, k % 2 ? 4 - (k >> 1) % 5 : (k >> 1) % 5);
          break;
        case 'wave':
          for (let k = 0; k < 8; k++) push(t0 + k * .5, 2 + Math.round(Math.sin((b * 8 + k) * .55) * 2));
          break;
        case 'wild': {
          const n = 4 + Math.floor(rng() * 4);
          for (let k = 0; k < n; k++) push(t0 + Math.floor(rng() * 8) * .5, Math.floor(rng() * 5));
          break;
        }
        case 'climax':
          for (let k = 0; k < 8; k++) {
            const lane = 2 + Math.round(Math.sin((b * 8 + k) * .8) * 2);
            push(t0 + k * .5, lane, k % 4 === 0 ? 'accent' : 'tap');
            if (k % 4 === 0) push(t0 + k * .5, 4 - lane, 'accent');   // 同時押し
          }
          break;
      }
    }
  }
  // 同一レーン・同一拍の重複を除去
  notes.sort((a, b) => a.beat - b.beat || a.lane - b.lane);
  const out = [];
  for (const n of notes) {
    const p = out[out.length - 1];
    if (p && Math.abs(p.beat - n.beat) < .05 && p.lane === n.lane) continue;
    out.push(n);
  }
  return out;
};

/* ======================================================== Road ===== */
const SEGLEN = 1.7;        // 縞 1 本の長さ（world units）
const LANE_AMP = 0.62;     // レーン値 1.0 が何 world unit 横に相当するか
const CAM_H = 1.62;        // 視点高（三人称。車を見下ろす高さ）
const CAR_DZ = 4.00;       // 自車は少し先を走る（判定ラインと重ならない位置）
/* 判定ラインの距離。ここでの路面幅がちょうど画面幅になるよう選んである。
   → 路面の5レーンと、画面を5等分したタップ領域がぴったり一致する。 */
const JUDGE_DZ = 1.95;
const CAR_W = 0.40;        // 自車の半車幅（world units。道路半幅は0.92）
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
  /* 道路のうねり（見た目のみ。判定には無関係） */
  laneAtDz(dz) { return this.chart.pathAt(this.beat + dz * this.beatsPerUnit) * LANE_AMP; }

  /* 判定はタップ面(playfield)が持つので、道路側に先読みは不要 */
  laneX(lane) { return (lane - (PX.LANES - 1) / 2) * (ROAD_HALF * 2 * .92 / PX.LANES); }

  /* 車の目標位置（＝プレイヤーのステア） */
  /* 自車はオート走行。プレイヤーはタップに専念する。
     叩いたレーンへ少しだけ寄る（= 自分の演奏で車が動いている感触）。 */
  update(dt, laneNudge) {
    this.time += dt;
    this.z += this.speed * dt;
    const prev = this.carX;
    const centre = this.laneAtDz(this.carDz);
    this.nudge = M.approach(this.nudge || 0, laneNudge || 0, 6, dt);
    this.carX = M.approach(this.carX, centre + this.nudge * .55, 9, dt);
    this.camX = M.approach(this.camX, this.carX * this.camFollow + centre * (1 - this.camFollow) * .35, 6, dt);
    const vel = (this.carX - prev) / Math.max(.0001, dt);
    this.bank = M.approach(this.bank, M.clamp(vel * .8, -1, 1), 8, dt);
    this.offRoad = M.approach(this.offRoad, 0, 2.6, dt);
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
        if (W.liquid) sw *= 1 + Math.sin(y * .055 - this.time * 2.2) * .05 * W.liquid;

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

}
PX.Road = Road;
PX.ROAD_CONST = { SEGLEN, LANE_AMP, CAM_H, CAM_D, ROAD_HALF, CAR_DZ, CAR_W, JUDGE_DZ };

})(window.PX);
