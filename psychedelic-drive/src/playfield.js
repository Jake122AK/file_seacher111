/* =====================================================================
   playfield.js — タップ面（5レーン・ノーツ・判定ライン）
   ---------------------------------------------------------------------
   ★ここだけドット絵ではない★

   世界はドット絵の低解像度バッファに描き、歪み・溶け・回転といった
   ポストエフェクトを全面に掛ける。しかし「叩く対象」までが一緒に歪むと
   ゲームとして成立しない。

   そこでタップ面は
     ・ポストエフェクト適用後の実解像度キャンバスに描く（＝一切歪まない）
     ・道路の投影ではなく固定のスクリーン座標系で組む（＝道路が波打っても不動）
     ・ドットではなく滑らかな図形で描く（＝小さくても輪郭が読める）
   という別レイヤーにしてある。

   レーンは判定ラインから画面下端へ扇状に開き、画面を横に5等分した
   タップ領域と中心が一致する（lane i の中心 = (i+0.5)/5）。
   ===================================================================== */
(function (PX) {
'use strict';
const M = PX.M, C = PX.C;

const LANES = 5;
const VP_Y = 0.395;        // 消失点の高さ（画面比）
const JUDGE_Y = 0.845;     // 判定ラインの高さ（画面比）
const Z_NEAR = 1.0;        // 判定ラインの深さ
const Z_FAR = 9.0;         // 出現位置の深さ
const LOOKAHEAD = 2.3;     // 何拍先から見えるか

/* レーン色 — 彩度を上げつつ、隣同士が混ざらない5色 */
const LANE_COL = [
  '#ff4d7e', '#ffa62b', '#5cff9d', '#3fc9ff', '#c07bff'
];
const LANE_GLOW = [
  'rgba(255,77,126,', 'rgba(255,166,43,', 'rgba(92,255,157,',
  'rgba(63,201,255,', 'rgba(192,123,255,'
];
PX.LANE_COL_CSS = LANE_COL;

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w * .5, h * .5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

class Playfield {
  constructor() {
    this.hits = [];        // 判定エフェクト
    this.sparks = [];      // 弾ける粒
    this.laneFlash = [0, 0, 0, 0, 0];
    this.time = 0;
  }

  /* 深さ z における画面座標 */
  yAt(z, H) { const vy = VP_Y * H; return vy + (JUDGE_Y * H - vy) / z; }
  xAt(lane, z, W) { return W * .5 + (lane - (LANES - 1) / 2) * (W / LANES) / z; }
  zAt(dBeat) { return Z_NEAR + Math.max(0, dBeat) * (Z_FAR - Z_NEAR) / LOOKAHEAD; }

  addHit(lane, grade) {
    this.hits.push({ lane, grade, life: 1 });
    this.laneFlash[lane] = 1;
    const n = grade === 'PERFECT' ? 14 : grade === 'GROOVY' ? 9 : grade === 'GOOD' ? 5 : 0;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * 2.4;
      const sp = .35 + Math.random() * .95;
      this.sparks.push({ lane, x: (Math.random() - .5) * .5, y: 0,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, grade });
    }
  }

  update(dt) {
    this.time += dt;
    for (let i = 0; i < LANES; i++) this.laneFlash[i] = M.approach(this.laneFlash[i], 0, 6, dt);
    for (let i = this.hits.length - 1; i >= 0; i--) {
      this.hits[i].life -= dt * 2.6;
      if (this.hits[i].life <= 0) this.hits.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += dt * 1.9;
      s.life -= dt * 1.5;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
    if (this.sparks.length > 260) this.sparks.splice(0, this.sparks.length - 260);
  }

  /* ctx は実解像度の表示キャンバス。W,H はそのピクセルサイズ */
  render(ctx, W, H, chart, songBeat, cond, trip) {
    const u = H / 844;                       // 基準スケール
    const jy = JUDGE_Y * H;
    const beatPulse = cond ? cond.env.kick : 0;
    const lit = M.sat(.25 + (trip ? trip.level / 10 : 0) * .5);

    ctx.save();
    ctx.lineCap = 'round';

    /* ---- レーンの床（消失点 → 画面下端へ扇状に開く） ---- */
    const zBot = 0.52;
    ctx.lineWidth = Math.max(1, u * 1.2);
    for (let i = 0; i <= LANES; i++) {
      const l = i - .5;
      const x0 = this.xAt(l, Z_FAR, W), y0 = this.yAt(Z_FAR, H);
      const x1 = this.xAt(l, zBot, W), y1 = this.yAt(zBot, H);
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(.45, 'rgba(255,255,255,' + (.05 + lit * .06).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,255,255,' + (.14 + lit * .12).toFixed(3) + ')');
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }

    /* ---- 押されたレーンの光柱 ---- */
    for (let i = 0; i < LANES; i++) {
      const f = this.laneFlash[i];
      if (f <= .02) continue;
      const xa = this.xAt(i - .5, Z_NEAR, W), xb = this.xAt(i + .5, Z_NEAR, W);
      const xa2 = this.xAt(i - .5, zBot, W), xb2 = this.xAt(i + .5, zBot, W);
      const g = ctx.createLinearGradient(0, this.yAt(Z_NEAR * 1.9, H), 0, this.yAt(zBot, H));
      g.addColorStop(0, LANE_GLOW[i] + '0)');
      g.addColorStop(1, LANE_GLOW[i] + (f * .30).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(this.xAt(i - .5, Z_NEAR * 1.9, W), this.yAt(Z_NEAR * 1.9, H));
      ctx.lineTo(this.xAt(i + .5, Z_NEAR * 1.9, W), this.yAt(Z_NEAR * 1.9, H));
      ctx.lineTo(xb2, this.yAt(zBot, H));
      ctx.lineTo(xa2, this.yAt(zBot, H));
      ctx.closePath(); ctx.fill();
    }

    /* ---- 判定ライン ---- */
    const lw = Math.max(2, u * 3);
    const lx0 = this.xAt(-.5, Z_NEAR, W), lx1 = this.xAt(LANES - .5, Z_NEAR, W);
    ctx.shadowBlur = u * 10 * (.4 + beatPulse * .8);
    ctx.shadowColor = 'rgba(255,255,255,.55)';
    ctx.strokeStyle = 'rgba(255,255,255,' + (.55 + beatPulse * .4).toFixed(3) + ')';
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(lx0, jy); ctx.lineTo(lx1, jy); ctx.stroke();
    ctx.shadowBlur = 0;

    /* 受け皿（どこを押すかを色で示す） */
    for (let i = 0; i < LANES; i++) {
      const xa = this.xAt(i - .46, Z_NEAR, W), xb = this.xAt(i + .46, Z_NEAR, W);
      ctx.strokeStyle = LANE_GLOW[i] + (.45 + this.laneFlash[i] * .5).toFixed(3) + ')';
      ctx.lineWidth = Math.max(2, u * 4);
      ctx.beginPath(); ctx.moveTo(xa, jy + lw * 1.6); ctx.lineTo(xb, jy + lw * 1.6); ctx.stroke();
    }

    /* ---- ノーツ ---- */
    if (chart) {
      const notes = chart.notes;
      let lo = 0, hi = notes.length - 1, start = notes.length;
      const minB = songBeat - .35;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (notes[mid].beat >= minB) { start = mid; hi = mid - 1; } else lo = mid + 1;
      }
      for (let i = start; i < notes.length; i++) {
        const n = notes[i];
        const d = n.beat - songBeat;
        if (d > LOOKAHEAD) break;
        if (n.judged && n.hit) continue;
        const z = this.zAt(d);
        const y = this.yAt(z, H);
        const x = this.xAt(n.lane, z, W);
        const w = (W / LANES) * .82 / z;
        const h = Math.max(2, u * (n.kind === 'accent' ? 26 : 19) / z);
        const near = M.sat(1 - Math.abs(d) / .85);
        const fade = d < 0 ? M.sat(1 + d / .3) : M.sat((LOOKAHEAD - d) / .7);
        if (fade <= .01) continue;

        ctx.globalAlpha = fade;
        // 影で路面から浮かせる
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        rrect(ctx, x - w / 2, y - h / 2 + h * .5, w, h * .7, h * .3); ctx.fill();
        // 本体（上が明るいグラデーション）
        const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(.32, LANE_COL[n.lane]);
        g.addColorStop(1, LANE_GLOW[n.lane] + '.75)');
        ctx.fillStyle = g;
        if (near > .1) { ctx.shadowBlur = u * 9 * near; ctx.shadowColor = LANE_COL[n.lane]; }
        rrect(ctx, x - w / 2, y - h / 2, w, h, h * .34); ctx.fill();
        ctx.shadowBlur = 0;
        // 縁
        ctx.strokeStyle = 'rgba(255,255,255,' + (.5 + near * .5).toFixed(2) + ')';
        ctx.lineWidth = Math.max(1, u * 1.1);
        rrect(ctx, x - w / 2, y - h / 2, w, h, h * .34); ctx.stroke();
        // アクセントは中央に一本
        if (n.kind === 'accent') {
          ctx.strokeStyle = 'rgba(255,255,255,.9)';
          ctx.lineWidth = Math.max(1, u * 1.4);
          ctx.beginPath(); ctx.moveTo(x - w * .3, y); ctx.lineTo(x + w * .3, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    /* ---- 判定エフェクト ---- */
    for (const hit of this.hits) {
      const k = M.sat(hit.life);
      const x = this.xAt(hit.lane, Z_NEAR, W);
      const col = hit.grade === 'MISS' ? 'rgba(255,90,110,' : LANE_GLOW[hit.lane];
      const r = (W / LANES) * (.32 + (1 - k) * .95);
      ctx.strokeStyle = col + (k * k * .85).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.5, u * 3 * k);
      ctx.beginPath(); ctx.ellipse(x, jy, r, r * .42, 0, 0, Math.PI * 2); ctx.stroke();
      if (hit.grade === 'PERFECT') {
        ctx.strokeStyle = 'rgba(255,255,255,' + (k * .7).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1, u * 1.6 * k);
        ctx.beginPath(); ctx.ellipse(x, jy, r * .55, r * .23, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    /* ---- 粒 ---- */
    for (const s of this.sparks) {
      const k = M.sat(s.life);
      const x = this.xAt(s.lane + s.x, Z_NEAR, W);
      const y = jy + s.y * H * .10;
      const rr = u * (s.grade === 'PERFECT' ? 3.4 : 2.4) * k;
      ctx.fillStyle = (s.grade === 'PERFECT' ? 'rgba(255,255,255,' : LANE_GLOW[s.lane]) + (k * .9).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

PX.Playfield = Playfield;
PX.PF_LANES = LANES;
})(window.PX);
