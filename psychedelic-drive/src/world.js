/* =====================================================================
   world.js — ワールド重みブレンド / 多重パララックス背景 / 路肩オブジェクト
   ---------------------------------------------------------------------
   ワールドは「切り替える」のではなく「重みを移す」。
   ・パレットは重み平均 → 色が連続的に溶ける
   ・背景レイヤーは重みをアルファに → 山が溶けてビル群が浮かぶ
   ・路肩オブジェクトは "kind" だけ持ち、見た目は毎フレーム現在の重みから
     決まる → すでに生えている街路樹がその場でヤシの木になる
   これが「気づいたら別世界」の正体。
   ===================================================================== */
(function (PX) {
'use strict';
const M = PX.M, C = PX.C, D = PX.draw;

const MAX_DRAW = 150;   // 1フレームに描く路肩オブジェクトの上限

const WORLDS = ['suburb', 'night', 'weird', 'tropical', 'space', 'city', 'jungle', 'ocean', 'abstract', 'climax', 'white'];

/* 各ワールドの路肩オブジェクト出現テーブル（kind: 重み） */
const SPAWN = {
  suburb:   { house: 34, flora: 26, pole: 16, light: 14, sign: 6, figure: 4 },
  night:    { house: 36, flora: 24, pole: 16, light: 18, sign: 4, figure: 2 },
  weird:    { house: 28, flora: 26, pole: 14, light: 16, sign: 10, figure: 6 },
  tropical: { flora: 34, figure: 46, rock: 8, sign: 4, light: 8 },
  space:    { crystal: 34, flora: 16, island: 22, figure: 14, monolith: 14 },
  city:     { house: 52, light: 16, sign: 10, figure: 12, crystal: 10 },
  jungle:   { flora: 54, figure: 14, rock: 14, monolith: 18 },
  ocean:    { coral: 46, flora: 18, rock: 18, figure: 18 },
  abstract: { monolith: 30, crystal: 28, figure: 22, flora: 20 },
  climax:   { figure: 44, flora: 20, crystal: 14, house: 10, island: 12 },
  white:    { flora: 40, house: 40, light: 20 }
};

class World {
  constructor(road) {
    this.road = road;
    this.w = {}; this.target = {};
    for (const k of WORLDS) { this.w[k] = 0; this.target[k] = 0; }
    this.w.suburb = 1; this.target.suburb = 1;
    this.objects = [];
    this.nextZ = 6;
    this.spawnGap = 5.0;
    this.density = 1;          // グルーヴで増える（フラダンサーが増殖する）
    this.time = 0;
    this.props = [];           // 空を漂うもの
    this.rng = M.rng(7331);
    this.starField = [];
    for (let i = 0; i < 220; i++) {
      this.starField.push({
        x: this.rng(), y: this.rng(), s: this.rng(), p: this.rng()
      });
    }
    this.clouds = [];
    for (let i = 0; i < 7; i++) this.clouds.push({ x: this.rng() * 1.4 - .2, y: .08 + this.rng() * .26, s: .5 + this.rng() * .9, v: .004 + this.rng() * .01 });
    this.pendingForced = [];
    this.crowdRows = 0;
    this.moonFace = 0;
    this.sunGlasses = 0;
  }

  setTarget(weights) {
    for (const k of WORLDS) this.target[k] = weights[k] || 0;
  }
  weight(k) { return this.w[k] || 0; }
  normWeights() {
    let s = 0; for (const k of WORLDS) s += this.w[k];
    if (s <= 0) return { suburb: 1 };
    const o = {}; for (const k of WORLDS) if (this.w[k] > .001) o[k] = this.w[k] / s;
    return o;
  }

  forceSpawn(kind, dz, side, extra) {
    this.pendingForced.push({ kind, z: this.road.z + dz, side, extra: extra || {} });
  }

  update(dt, cond, trip) {
    this.time += dt;
    const rate = 0.55;
    for (const k of WORLDS) this.w[k] = M.approach(this.w[k], this.target[k], rate, dt);

    // 密度: トリップ強度とグルーヴで路肩が賑やかになる
    this.density = M.lerp(1, 2.8, M.sat(trip.level / 10)) * M.lerp(.8, 1.5, trip.groove);
    // 対称性: 深いほど左右が鏡像になる
    this.symmetry = M.sat((trip.level - 5.5) / 3.5);
    this.spawnGap = M.lerp(5.2, 1.5, M.sat((this.density - 1) / 3.4));

    // スポーン
    const ahead = this.road.z + 90;
    let guard = 0;
    while (this.nextZ < ahead && guard++ < 40) {
      this._spawnAt(this.nextZ);
      this.nextZ += this.spawnGap * (0.75 + this.rng() * .5);
    }
    for (const f of this.pendingForced) {
      this.objects.push(this._mk(f.kind, f.z, f.side, f.extra));
    }
    this.pendingForced.length = 0;

    // 掃除
    const back = this.road.z - 6;
    if (this.objects.length && this.objects[0].z < back) {
      let i = 0; while (i < this.objects.length && this.objects[i].z < back) i++;
      this.objects.splice(0, i);
    }
    this.objects.sort((a, b) => a.z - b.z);

    // 空の漂流物
    this._updateProps(dt, trip);
  }

  _pickKind() {
    /* トリップが深いところでは種類を絞る。
       いろいろな物を同時に出すほど「使い回しを適当に置いた」感が出る。
       主役を2種に決め、それを左右対称に並べたほうが美しい。 */
    if (this.symmetry > .5) {
      const r = this.rng();
      if (this.w.climax > .3) return r < .62 ? 'figure' : 'crystal';
      if (this.w.abstract > .3) return r < .5 ? 'crystal' : 'monolith';
    }
    const tbl = {};
    let tot = 0;
    for (const wname of WORLDS) {
      const ww = this.w[wname];
      if (ww < .02) continue;
      const t = SPAWN[wname];
      for (const k in t) { tbl[k] = (tbl[k] || 0) + t[k] * ww; tot += t[k] * ww; }
    }
    if (tot <= 0) return 'flora';
    let r = this.rng() * tot;
    for (const k in tbl) { r -= tbl[k]; if (r <= 0) return k; }
    return 'flora';
  }

  _mk(kind, z, side, extra) {
    return {
      kind, z, side,
      seed: this.rng() * 1000,
      sc: .8 + this.rng() * .5,
      phase: this.rng(),
      extra: extra || {}
    };
  }

  /* 種別ごとの「道路の内側エッジからの最小クリアランス」(world units)。
     建物のように幅のあるものは外側へ伸ばすので、ここで road にはみ出さない。 */
  _clearance(kind) {
    switch (kind) {
      case 'house':                return 1.30;
      case 'island':               return 2.20;
      case 'monolith': case 'rock': return 1.45;
      case 'crystal': case 'coral': return 1.35;
      case 'flora':                return 1.32;
      case 'figure':               return 1.24;
      default:                     return 1.20;   // pole / light / sign
    }
  }

  _spawnAt(z) {
    /* トリップが深いほど左右対称に配置する。
       サイケデリックの視覚は対称で構成されるので、
       ここをランダムのままにすると「適当に置いただけ」に見える。 */
    const sym = M.sat((this.symmetry || 0));
    const mirror = this.rng() < sym;
    let mKind = null, mNear = 0, mZ = 0, mSeed = 0;
    for (let s = -1; s <= 1; s += 2) {
      if (!mirror && this.rng() > .90) continue;
      let kind, near, zz;
      if (mirror && s > 0 && mKind) { kind = mKind; near = mNear; zz = mZ; }
      else {
        kind = this._pickKind();
        near = this._clearance(kind) + this.rng() * .95;
        zz = z + this.rng() * 1.5;
        mKind = kind; mNear = near; mZ = zz;
      }
      const o = this._mk(kind, zz, s * near);
      if (mirror && s > 0) { o.seed = mSeed; o.sc = this.mSc; o.phase = this.mPhase; }
      else { mSeed = o.seed; this.mSc = o.sc; this.mPhase = o.phase; }
      this.objects.push(o);
      // 群衆: figure は密度に応じて横一列に増える（10人→100人）
      if (kind === 'figure') {
        const extra = Math.floor(M.lerp(0, 5, M.sat((this.density - 1) / 2.6)) + this.rng() * 2);
        for (let i = 1; i <= extra; i++) {
          const o2 = this._mk('figure', z + this.rng() * 2.2, s * (near + i * (.58 + this.rng() * .35)));
          o2.sc *= .96;
          this.objects.push(o2);
        }
      }
    }
  }

  /* ------------------------------------------------- 空を漂うものたち */
  _updateProps(dt, trip) {
    const want = [];
    const t = this.w.tropical, sp = this.w.space, ab = this.w.abstract, cl = this.w.climax, oc = this.w.ocean, ci = this.w.city;
    /* 同時に出す種類を絞る。全部いっぺんに出すと散らかって見える。
       主役を1〜2種類に決め、それを対称に配置する。 */
    if (t > .12 || oc > .12) want.push('fish', 'fish');
    if (t > .3 || cl > .35) want.push('whale');
    if (sp > .3) want.push('ufo');
    if (ab > .35) want.push('eye');
    if (cl > .45) want.push('record');
    if (sp > .35 || ab > .3) want.push('island', 'island');

    // 足りない分を足す
    const counts = {};
    for (const p of this.props) counts[p.kind] = (counts[p.kind] || 0) + 1;
    const need = {};
    for (const k of want) need[k] = (need[k] || 0) + 1;
    for (const k in need) {
      while ((counts[k] || 0) < need[k]) {
        this.props.push({
          kind: k,
          x: this.rng() * 1.3 - .15,
          y: .06 + this.rng() * .34,
          v: (this.rng() < .5 ? -1 : 1) * (.012 + this.rng() * .035),
          s: .7 + this.rng() * .9,
          ph: this.rng(),
          life: 0
        });
        counts[k] = (counts[k] || 0) + 1;
      }
    }
    // 深部では漂流物を減らす（構造を見せたいので）
    if (trip.level > 8.2 && this.props.length > 3) this.props.length = 3;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      p.life += dt;
      p.x += p.v * dt;
      p.y += Math.sin(this.time * .5 + p.ph * 9) * .00035;
      if (p.x < -.35 || p.x > 1.35) { p.x = p.v > 0 ? -.3 : 1.3; p.y = .05 + this.rng() * .35; }
      if (!need[p.kind]) { if (this.rng() < dt * .5) this.props.splice(i, 1); }
    }
  }

  /* ================================================== 背景レンダリング */
  render(p, pal, cond, trip, road) {
    const hz = road.horizonY(p);
    this._sky(p, pal, cond, trip, hz, road);
    this._farLayer(p, pal, cond, trip, hz, road);
    this._midLayer(p, pal, cond, trip, hz, road);
    // 対称構造は最後に描く。空の主役にする。
    const geo = M.sat(this.w.abstract * 1.2 + this.w.climax * .9);
    if (geo > .03) this._geoOverlay(p, pal, cond, trip, hz, geo);
    this._props(p, pal, cond, trip, hz);
  }

  /* ------ 空 ------------------------------------------------------- */
  _sky(p, pal, cond, trip, hz, road) {
    const ctx = p.ctx;
    const env = cond.env;
    const skyH = Math.max(1, hz + 2);
    // グラデーション（ビートで少しだけ持ち上がる）
    const lift = env.kick * .06 * M.sat(trip.level / 4);
    const top = C.mix(pal.skyTop, pal.skyMid, lift);
    const bot = pal.skyLow;
    p.vgrad(0, 0, p.w, skyH, top, bot, true);

    // 星
    const starA = M.sat(this.w.space * 1.2 + this.w.night * .8 + this.w.weird * .5 + this.w.climax * .5 + trip.starBoost);
    if (starA > .02) {
      const sc = road.z * .012;
      for (let i = 0; i < this.starField.length; i++) {
        const s = this.starField[i];
        const x = M.mod(s.x + sc * (.2 + s.s * .5), 1) * p.w;
        const y = s.y * skyH * .92;
        const tw = .5 + .5 * Math.sin(this.time * (1 + s.p * 3) + s.p * 30 + cond.beat * Math.PI * (s.s > .7 ? 1 : .25));
        const a = starA * (.35 + tw * .65) * (.4 + s.s * .6);
        if (a < .05) continue;
        const col = s.s > .85 ? pal.accentB : (s.s > .6 ? pal.accentA : [255, 255, 255]);
        if (s.s > .93 && starA > .5) D.star(p, x, y, 1 + s.s * 2, C.css(col), a);
        else { ctx.globalAlpha = a; ctx.fillStyle = C.css(col); ctx.fillRect(x | 0, y | 0, 1, 1); ctx.globalAlpha = 1; }
      }
    }

    // 太陽 / 月
    const sunA = M.sat(this.w.suburb + this.w.tropical + this.w.weird * .6);
    const moonA = M.sat(this.w.night + this.w.weird * .5 + this.w.space * .5 + this.w.climax * .4);
    const sx = p.w * .68, sy = hz - p.h * .10;
    if (sunA > .03) {
      const r = p.w * (.085 + this.w.tropical * .05) * (1 + env.kick * .05 * trip.level / 10);
      if (this.sunGlasses > .5 && PX.SPR.sunGlasses) {
        p.sprite(PX.SPR.sunGlasses, sx, sy + r, { scale: Math.max(1, Math.round(r / 5)), ax: .5, ay: .5, alpha: sunA });
      } else {
        p.circle(sx, sy, r * 1.5, C.cssa(pal.sun, .10 * sunA));
        p.circle(sx, sy, r, C.cssa(pal.sun, sunA));
        // レトロな横縞
        ctx.globalAlpha = sunA * .6;
        ctx.fillStyle = C.css(pal.skyLow);
        for (let i = 0; i < 6; i++) {
          const yy = sy + r * (i / 6) * 1.0;
          ctx.fillRect(Math.round(sx - r), Math.round(yy), Math.round(r * 2), Math.max(1, Math.round(1 + i * .35)));
        }
        ctx.globalAlpha = 1;
      }
    }
    if (moonA > .03) {
      const mx = p.w * .26, my = hz - p.h * .22;
      const r = p.w * (.055 + trip.moonSize * .05);
      if (this.moonFace > .5 && PX.SPR.moonFace) {
        p.sprite(PX.SPR.moonFace, mx, my + r, { scale: Math.max(1, Math.round(r / 5)), ax: .5, ay: .5, alpha: moonA, hue: trip.hueSpin });
      } else {
        p.circle(mx, my, r * 1.7, C.cssa(pal.lightGlow, .07 * moonA));
        p.circle(mx, my, r, C.cssa(pal.sun, moonA));
        p.circle(mx - r * .35, my - r * .2, r * .22, C.cssa(C.scale(pal.sun, .86), moonA));
        p.circle(mx + r * .3, my + r * .3, r * .16, C.cssa(C.scale(pal.sun, .88), moonA));
      }
    }

    // 雲（顔になる）
    const cloudA = M.sat(this.w.suburb + this.w.tropical * 1.1 + this.w.weird + this.w.night * .5)
      * M.lerp(1, .25, M.sat((trip.level - 6) / 4));
    if (cloudA > .03) {
      for (const c of this.clouds) {
        c.x += c.v * .016 + road.z * 0;
        if (c.x > 1.3) c.x = -.3;
        const face = M.sat(trip.cloudFace) * (c.s > .8 ? 1 : .3);
        D.cloud(p, c.x * p.w, c.y * skyH, p.w * .22 * c.s, p.h * .028 * c.s,
          C.mix(pal.cloud, pal.accentA, trip.level / 22), face, cloudA * .85);
      }
    }

    // 逆さまの都市（抽象ゾーン）
    if (this.w.abstract > .3) {
      const a = M.sat((this.w.abstract - .3) / .5) * .5;
      ctx.save();
      ctx.globalAlpha = a;
      for (let i = 0; i < 9; i++) {
        const x = M.mod(i * 23 - road.z * .35, p.w + 40) - 20;
        const h = 12 + M.hash(i * 5.3) * 26;
        D.building(p, x, -1 + h, 9 + M.hash(i) * 6, h, 1,
          { alpha: a, body: pal.near, win: pal.accentA, winOff: pal.mid, seed: i + 3, beatWin: cond.env.hat * .4 });
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  /*
    サイケデリック層 — ランダムな散らかしではなく、対称と再帰で構成する。
      ・曼荼羅（N回対称・等比半径・リングごとに逆回転）
      ・入れ子多角形（消失点へ無限後退）
    どちらも消失点を中心に置くので、道路の一点透視と構図が一致する。
  */
  _geoOverlay(p, pal, cond, trip, hz, amt) {
    const cx = p.w * .5, cy = hz * .62;
    const beat = cond.env.kick;
    const lvl = M.sat(trip.level / 10);
    const hue = trip.hueSpin * .35 + this.w.abstract * .2;

    // 入れ子の多角形（奥へ吸い込まれる）
    D.recursiveFrames(p, cx, cy, p.w * .62, {
      sides: 6 + Math.floor(lvl * 3) * 2,
      depth: 10, ratio: .76,
      twist: .16 + lvl * .18,
      rot: this.time * .06,
      phase: M.mod(this.time * .22, 1),
      squash: .62,
      hue: hue + .5,
      alpha: M.sat(amt * (.5 + beat * .2))
    });

    // 曼荼羅
    D.mandala(p, cx, cy, p.w * (.42 + lvl * .22), {
      fold: 6 + Math.floor(lvl * 3) * 2,
      rings: 5, ratio: .66,
      rot: this.time * .10,
      squash: .78,
      motif: Math.floor(this.time * .12) % 4,
      hue: hue,
      beat: beat,
      alpha: M.sat(amt * (1.15 + beat * .45))
    });
  }

  /* ------ 遠景 ---------------------------------------------------- */
  _farLayer(p, pal, cond, trip, hz, road) {
    const ctx = p.ctx;
    const scroll = road.z * 1.1;
    const wSub = this.w.suburb + this.w.night + this.w.weird;
    const wTro = this.w.tropical, wCity = this.w.city, wJun = this.w.jungle,
          wOc = this.w.ocean, wSp = this.w.space, wAb = this.w.abstract, wCl = this.w.climax;

    // 海の水平線（南国/海底）
    if (wTro + wOc > .04) {
      const a = M.sat(wTro + wOc);
      const y0 = hz - Math.round(p.h * .012);
      ctx.globalAlpha = a;
      D.water(p, y0, hz + 2, p.w / 2, C.mix(pal.far, pal.accentA, .25), pal.near, this.time, cond.env.bass);
      ctx.globalAlpha = 1;
    }
    // 山（住宅街の遠景）
    if (wSub > .04) D.mountains(p, hz + 1, p.h * .05, C.mix(pal.far, pal.fog, .4), 0, scroll * .05, M.sat(wSub) * .9);
    // ジャングルの樹冠
    if (wJun > .04) D.mountains(p, hz + 2, p.h * .085, C.mix(pal.far, [20, 60, 40], .3), 3.7, scroll * .07, M.sat(wJun));
    // 巨大都市のスカイライン
    if (wCity > .04) {
      const a = M.sat(wCity);
      for (let i = 0; i < 26; i++) {
        const bx = M.mod(i * 15.5 - scroll * .06, p.w + 60) - 30;
        const h = 10 + M.hash(i * 3.1) * p.h * .22;
        D.building(p, bx, hz + 2, 8 + M.hash(i * 7.7) * 9, h, 1, {
          alpha: a * .85, body: C.mix(pal.far, pal.fog, .35), win: pal.accentA, winOff: C.mix(pal.far, [0, 0, 0], .3),
          seed: i + 1, beatWin: cond.env.hat * .5, blink: (i % 5 === 0) ? .1 : 0, antenna: pal.accentC
        });
      }
    }
    // 星雲（宇宙）
    if (wSp > .05) {
      const a = M.sat(wSp);
      ctx.globalAlpha = a * .30;
      for (let i = 0; i < 5; i++) {
        const x = M.mod(i * 47 - scroll * .02, p.w + 90) - 45;
        const y = hz * (.25 + M.hash(i * 2.7) * .5);
        const r = 16 + M.hash(i * 5.1) * 26;
        p.circle(x, y, r, C.cssa(C.rainbow(i * .21 + this.time * .03, .4), .10 * a));
        p.circle(x + 4, y - 3, r * .6, C.cssa(C.rainbow(i * .21 + .3, .45), .10 * a));
      }
      ctx.globalAlpha = 1;
    }
    // 抽象: 巨大な目
    if (wAb > .18 && PX.SPR.eye) {
      const a = M.sat((wAb - .18) / .4);
      const s = Math.max(1, Math.round(p.w / 60 + trip.level * .25));
      const blink = (Math.sin(this.time * .7) > .96) ? .25 : 1;
      p.sprite(PX.SPR.eye, p.w * .5, hz * .55, {
        scale: s, ax: .5, ay: .5, alpha: a * .85, squash: blink, hue: trip.hueSpin
      });
    }
    // クライマックス: 全部の地平線が重なる
    if (wCl > .1) {
      /* クライマックスの遠景は「重ねる」のではなく「対称に置く」。
         消失点を軸に左右鏡像のシルエットを並べると構図が締まる。 */
      const a = M.sat(wCl);
      D.mountains(p, hz + 1, p.h * .055, C.mix(pal.far, pal.accentB, .35), 1.3, scroll * .05, a * .45);
      const n = 5;
      for (let i = 1; i <= n; i++) {
        const dx = i * (p.w * .105);
        const h = p.h * (.20 - i * .028);
        const w2 = 9 + (n - i) * 2;
        for (const sgn of [-1, 1]) {
          D.building2(p, p.w * .5 + sgn * dx, hz + 2, {
            w: w2, h, tall: 1, alpha: a * .5,
            vx: p.w * .5, vy: hz, k: .28, dir: sgn,
            body: C.mix(pal.mid, pal.accentC, .18),
            win: [255, 255, 255], winOff: pal.near, seed: i + 9,
            beatWin: cond.env.kick, antenna: pal.accentA
          });
        }
      }
    }
  }

  /* ------ 中景（地平線に沿う帯） ------------------------------------ */
  _midLayer(p, pal, cond, trip, hz, road) {
    const ctx = p.ctx;
    const scroll = road.z * 2.6;
    // 群衆バンド: 南国/クライマックスで地平線までフラダンサー
    const crowd = M.sat((this.w.tropical + this.w.climax) * (0.4 + trip.groove * .9) * (trip.level / 6))
      * M.lerp(1, .28, M.sat((trip.level - 7.5) / 2.5));
    if (crowd > .06 && PX.SPR.hula1) {
      const rows = 1 + Math.floor(crowd * 1.6);
      for (let r = 0; r < rows; r++) {
        const yy = hz + 1 + r * 2;
        const sc = 1;
        const a = crowd * (1 - r * .18);
        const count = Math.floor(p.w / 11) + 2;
        const beatOff = (cond.env.kick > .4 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const x = M.mod(i * 11 - scroll * (.02 + r * .004) + r * 5.5, p.w + 22) - 11;
          const ph = M.hash2(i * 1.7, r * 3.1);
          const f = (Math.floor(cond.beat * 2 + ph * 2) % 2) ? PX.SPR.hula2 : PX.SPR.hula1;
          // 地平線の群衆は 1px スケール。sway は使わず描画コールを 1 回に抑える
          p.sprite(f, x, yy + 1 - beatOff, {
            scale: sc + (r === 0 ? 1 : 0), ax: .5, ay: 1, alpha: a * .9, hue: trip.hueSpin + ph * .3
          });
        }
      }
    }
    // ヤシ並木のシルエット（地平線）
    const tro = M.sat(this.w.tropical);
    if (tro > .08) {
      for (let i = 0; i < 14; i++) {
        const x = M.mod(i * 17 - scroll * .012, p.w + 40) - 20;
        const h = 14 + M.hash(i * 6.1) * 10;
        D.tree(p, x, hz + 2, h, 1, Math.sin(this.time * 1.3 + i) * 1.6,
          C.mix(pal.near, [0, 0, 0], .18), C.mix(pal.mid, [0, 0, 0], .12), tro * .8);
      }
    }
  }

  /* ------ 空の漂流物（魚・クジラ・UFO・レコード・浮島） -------------- */
  _props(p, pal, cond, trip, hz) {
    const S = PX.SPR;
    for (const q of this.props) {
      const x = q.x * p.w, y = q.y * hz;
      const flip = q.v < 0;
      const bob = Math.sin(this.time * 2 + q.ph * 12) * 2;
      const hue = trip.hueSpin + q.ph * .25;
      switch (q.kind) {
        case 'fish':
          p.sprite((q.ph > .5 ? S.fish2 : S.fish), x, y + bob, {
            scale: Math.max(1, Math.round(1 + q.s)), ax: .5, ay: .5, flip, hue,
            alpha: .9, sway: Math.sin(this.time * 6 + q.ph * 9) * 1.4
          });
          break;
        case 'whale':
          p.sprite(S.whale, x, y + bob * 1.6, {
            scale: Math.max(1, Math.round(1 + q.s * 1.6)), ax: .5, ay: .5, flip, hue, alpha: .82,
            sway: Math.sin(this.time * 1.2 + q.ph * 5) * 2
          });
          break;
        case 'ufo': {
          const s = Math.max(1, Math.round(1 + q.s));
          p.sprite(S.ufo, x, y + bob, { scale: s, ax: .5, ay: .5, flip, hue, alpha: .9 });
          if (cond.env.kick > .3) p.circle(x, y + 6 * s, 3 * s * cond.env.kick, C.cssa(pal.accentA, .18 * cond.env.kick));
          break;
        }
        case 'record':
          p.sprite(S.record, x, M.mod(q.life * 26 + q.ph * 200, hz + 30) - 10, {
            scale: Math.max(1, Math.round(1 + q.s)), ax: .5, ay: .5, hue, alpha: .9,
            squash: .6 + .4 * Math.abs(Math.sin(this.time * 4 + q.ph * 8))
          });
          break;
        case 'island':
          D.island(p, x, y, 14 + q.s * 22, C.mix(pal.accentA, pal.mid, .4), C.mix(pal.near, [0, 0, 0], .2), .8);
          if (q.ph > .5) D.tree(p, x + 3, y + 1, 9 + q.s * 6, 1, Math.sin(this.time + q.ph * 7) * 1.2, pal.accentA, pal.accentC, .8);
          break;
        case 'eye':
          p.sprite(S.eye, x, y, { scale: Math.max(1, Math.round(1 + q.s * 2)), ax: .5, ay: .5, hue, alpha: .7 });
          break;
      }
    }
  }

  /* ================================================ 路肩オブジェクト */
  renderObjects(p, pal, cond, trip, road) {
    const S = PX.SPR;
    const hz = road.horizonY(p);
    const q = {};
    const env = cond.env;
    // objects は z 昇順（先頭が最も近い）。描画は近い順に上限を設けて打ち切る。
    let end = 0;
    const far = road.z + 86;
    while (end < this.objects.length && this.objects[end].z <= far) end++;
    if (end > MAX_DRAW) end = MAX_DRAW;
    // 遠 → 近（ペインターズ）
    for (let i = end - 1; i >= 0; i--) {
      const o = this.objects[i];
      const dz = o.z - road.z;
      if (dz < .6) continue;
      road.project(p, dz, o.side, q);
      if (q.sy < hz - 60 || q.sy > p.h + 40) continue;
      if (q.sx < -130 || q.sx > p.w + 130) continue;
      const unit = q.sc * p.w * .58;               // 1 world unit あたりのピクセル数
      if (unit < .6) continue;
      /* 近距離フェード。大きい物ほど早く消す。
         これが無いと、巨大化した建物が至近距離で画面を塞ぐ「壁」になる。 */
      const big = (o.kind === 'house' || o.kind === 'island' || o.kind === 'monolith');
      const nearFade = big ? M.smooth((dz - 3.1) / 2.4) : M.smooth((dz - 1.3) / 1.3);
      if (nearFade <= .01) continue;
      const fade = M.sat((86 - dz) / 26) * nearFade;
      const beat = env.kick, hat = env.hat;
      const ph = o.phase;
      const groove = trip.groove;
      const dance = Math.sin(cond.beat * Math.PI + ph * 6.28) * (0.5 + groove) * M.sat(trip.level / 3);

      this._drawObject(p, pal, cond, trip, o, q, unit, fade, dance, dz);
    }
  }

  _drawObject(p, pal, cond, trip, o, q, unit, fade, dance, dz) {
    const S = PX.SPR, env = cond.env;
    const x = q.sx, base = q.sy;
    const lvl = trip.level;
    const hue = trip.hueSpin + o.phase * .2;
    const breathe = M.sat(lvl / 4) * (0.5 + .5 * Math.sin(this.time * 2.2 + o.phase * 8));
    const sway = dance * unit * .05;

    switch (o.kind) {
      case 'flora': {
        // 街路樹 → ヤシ → 星（世界の重みで連続変形）
        const palm = M.sat(this.w.tropical * 1.3 + this.w.climax * .6 + this.w.jungle * .4);
        const star = M.sat(this.w.space * 1.4 + this.w.abstract * .8);
        const m = palm + star;
        const h = unit * (1.35 + o.sc * .75);
        // 葉の色: サイケでない間はちゃんと緑にする（普通の街路樹に見せる）
        const natural = 1 - M.sat(this.w.abstract + this.w.climax + this.w.space * .7);
        const lit = M.sat((pal.skyLow[0] + pal.skyLow[1] + pal.skyLow[2]) / 520);
        const colA = C.mix(C.mix(pal.accentA, pal.mid, .3), C.mix(C.scale([92, 162, 78], .42 + lit * .5), pal.fog, .22), natural * .88);
        const colB = C.mix(C.mix(pal.accentC, pal.near, .3), C.mix(C.scale([52, 110, 58], .42 + lit * .5), pal.fog, .25), natural * .88);
        if (this.w.jungle > .3 && o.seed % 2 < 1) {
          D.fern(p, x, base, h * .8, sway * 2, C.mix(pal.accentA, [30, 120, 60], .5), C.mix(pal.accentC, [20, 90, 50], .5), fade);
        } else {
          D.tree2(p, x, base, h, {
            m, species: Math.floor(o.seed * 1.7) % 3,
            sway: sway * (1 + palm), colA, colB,
            trunk: C.mix([78, 56, 42], pal.near, .35),
            alpha: fade
          });
        }
        break;
      }
      case 'house': {
        const tall = M.sat(this.w.city * 1.4 + this.w.climax * .25);
        const melt = M.sat(this.w.space * 1.2 + this.w.abstract * .9);
        // 建物の種類でシルエットを変える（同じ箱の羅列にしない）
        const type = Math.floor(o.seed) % 3;
        const wMul = type === 0 ? .95 : type === 1 ? 1.35 : .70;
        const hMul = type === 0 ? 1.0 : type === 1 ? .78 : 1.45;
        const w = unit * (.80 + o.sc * .45) * wMul * (1 + tall * .1);
        const h = unit * (1.45 + o.sc * .75) * hMul * M.lerp(1, 3.2, tall);
        const bodyTint = C.mix(C.mix(pal.near, pal.mid, .3), pal.accentC, (o.seed % 7) / 7 * .18);
        D.building2(p, x, base, {
          w, h, tall, melt, alpha: fade,
          vx: p.w * .5, vy: this.road.horizonY(p),
          k: M.sat((w / unit * .85) / (dz + w / unit * .85)),
          dir: o.side > 0 ? 1 : -1,
          body: bodyTint,
          roof: C.mix(pal.accentC, pal.near, .35 + (o.seed % 5) / 5 * .3),
          win: C.mix(pal.lightGlow, pal.accentA, .3),
          winOff: C.mix(pal.mid, [0, 0, 0], .4),
          seed: o.seed,
          beatWin: env.hat * .7 * M.sat(lvl / 3),
          blink: M.sat((lvl - 2) / 5) * .35,      // 窓が目のようにまばたき
          breathe: breathe * M.sat(lvl / 3),
          antenna: pal.accentB
        });
        break;
      }
      case 'pole': {
        const h = unit * (1.5 + o.sc * .5) * (1 + breathe * .04);
        D.pole(p, x, base, h, C.mix(pal.near, pal.mid, .3), breathe);
        break;
      }
      case 'light': {
        const h = unit * (1.6 + o.sc * .4);
        const g = M.sat(.35 + env.hat * .9 * M.sat(lvl / 2) + env.kick * .5);
        D.streetlight(p, x, base, h, C.mix(pal.near, pal.mid, .2), pal.lightGlow, g * fade);
        break;
      }
      case 'sign': {
        const words = trip.signWords;
        const w = words[Math.floor(M.mod(o.seed + Math.floor(this.time * .35), words.length))];
        D.sign(p, x, base, unit * 1.0, w,
          C.mix(pal.near, pal.accentC, .25 + trip.level * .04),
          C.mix(pal.line, pal.accentA, trip.level * .06), pal.mid);
        break;
      }
      case 'figure': {
        // 住宅街では通行人、南国以降はフラダンサー
        const hula = M.sat(this.w.tropical * 1.5 + this.w.climax * 1.2 + this.w.abstract * .6 + this.w.jungle * .4);
        const s = Math.max(1, Math.round(unit * .027));
        const v = Math.floor(o.seed * 3.1) % 3;          // 個体差（毎フレーム同じ）
        const odd = M.sat(this.w.abstract + this.w.climax * .8 + this.w.space * .7);
        const frame = Math.floor(cond.beat * 2 + o.phase * 2) % 2;
        if (odd > .45 && (o.seed % 5) < 2.2) {
          // サイケゾーンの住人（ローブ・宇宙人・二足歩行の猫）
          const spr = (o.seed % 3 < 1) ? S.robed : (o.seed % 3 < 2 ? S.alien : S.catStand);
          p.sprite(spr, x, base, {
            scale: s, ax: .5, ay: 1, alpha: fade, hue,
            sway: dance * s * 1.8,
            squash: 1 + Math.sin(cond.beat * Math.PI * 2 + o.phase * 6) * .08
          });
        } else if (hula > .4) {
          const set = v === 0 ? [S.hula1, S.hula2] : v === 1 ? [S.hula1b, S.hula2b] : [S.hula1c, S.hula2c];
          p.sprite(set[frame], x, base, {
            scale: s, ax: .5, ay: 1, alpha: fade, hue,
            sway: dance * s * 1.5,
            squash: 1 + Math.sin(cond.beat * Math.PI * 2 + o.phase * 6) * .07 * (0.4 + trip.groove)
          });
          // 手を振る（グルーヴが高いほど）
          if (trip.groove > .72 && s > 1 && Math.sin(this.time * 3 + o.phase * 10) > .5) {
            p.rect(x + s * 4, base - s * 12, s, s, C.css(pal.accentA));
          }
        } else {
          const wf = Math.floor(this.time * 4 + o.phase * 3) % 2;
          let set;
          if (o.seed % 11 < 1.4) set = [S.kid, S.kid];
          else set = v === 0 ? [S.walk1, S.walk2] : v === 1 ? [S.walk1b, S.walk2b] : [S.walk1c, S.walk2c];
          p.sprite(set[wf], x, base, {
            scale: s, ax: .5, ay: 1, alpha: fade,
            hue: trip.level > 3 ? hue : 0, flip: o.side > 0
          });
        }
        break;
      }
      case 'rock': {
        const w = unit * (.45 + o.sc * .3), h = unit * (.26 + o.sc * .2);
        const col = C.mix(pal.near, pal.mid, .3);
        p.ctx.globalAlpha = fade;
        for (let i = 0; i < h; i++) {
          const t = i / h;
          const ww = w * (1 - t * t * .8);
          p.ctx.fillStyle = C.css(C.mix(col, pal.accentC, t * .2));
          p.ctx.fillRect(Math.round(x - ww / 2), Math.round(base - i), Math.max(1, Math.round(ww)), 1);
        }
        p.ctx.globalAlpha = 1;
        break;
      }
      case 'coral': {
        const h = unit * (.6 + o.sc * .45);
        const c1 = C.mix(pal.accentB, pal.accentA, .3), c2 = pal.accentC;
        D.fern(p, x, base, h, sway * 1.6 + Math.sin(this.time * 1.6 + o.phase * 6) * 2, c1, c2, fade);
        break;
      }
      case 'crystal': {
        const h = unit * (.9 + o.sc * .7);
        const w = unit * (.26 + o.sc * .16);
        const col = C.rainbow(o.phase + this.time * .1, .6);
        const ctx = p.ctx;
        ctx.globalAlpha = fade;
        const steps = Math.max(3, Math.round(h));
        for (let i = 0; i < steps; i++) {
          const t = i / steps;
          const ww = w * (1 - t) * (1 + Math.sin(t * 9 + this.time * 3) * .12);
          ctx.fillStyle = C.css(C.mix(col, pal.lightGlow, t * .5 + env.kick * .2));
          ctx.fillRect(Math.round(x - ww / 2 + sway * t), Math.round(base - i), Math.max(1, Math.round(ww)), 1);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'monolith': {
        const h = unit * (1.4 + o.sc * 1.0);
        const w = unit * (.30 + o.sc * .2);
        const ctx = p.ctx;
        ctx.globalAlpha = fade;
        ctx.fillStyle = C.css(C.mix(pal.near, [0, 0, 0], .45));
        ctx.fillRect(Math.round(x - w / 2), Math.round(base - h), Math.max(1, Math.round(w)), Math.round(h));
        // 表面に流れる幾何紋様
        /* 表面の紋様は左右対称のひし形を縦に積む。
           虹の横縞にするとバーコードのようで美しくないため。 */
        const gap = Math.max(3, Math.round(unit * .22));
        const n = Math.max(2, Math.round(h / gap));
        const baseHue = (o.seed % 100) / 100;
        for (let i = 0; i < n; i++) {
          const yy = base - h + i * gap + gap * .5;
          if (yy > base - 1) continue;
          const k = 1 - Math.abs(i / (n - 1) - .5) * 2;      // 中央が太い
          const ww = Math.max(1, Math.round((w - 2) * (.25 + k * .6)));
          const col = D.harmony(baseHue + this.time * .04, i % 3, .55);
          ctx.fillStyle = C.css(col);
          ctx.fillRect(Math.round(x - ww / 2), Math.round(yy), ww, Math.max(1, Math.round(gap * .34)));
        }
        // 縁を締める
        ctx.fillStyle = C.css(C.mix(pal.lightGlow, [255, 255, 255], .4));
        ctx.globalAlpha = fade * .5;
        ctx.fillRect(Math.round(x - w / 2), Math.round(base - h), 1, Math.round(h));
        ctx.fillRect(Math.round(x + w / 2) - 1, Math.round(base - h), 1, Math.round(h));
        ctx.globalAlpha = fade;
        ctx.globalAlpha = 1;
        break;
      }
      case 'island': {
        D.island(p, x, base - unit * 1.3, unit * (.9 + o.sc * .6), C.mix(pal.accentA, pal.mid, .4), pal.near, fade);
        break;
      }
      case 'cat': {
        const s = Math.max(1, Math.round(unit * .022));
        const spr = o.extra.sit ? S.catSit : S.cat;
        const rainbow = o.extra.rainbow ? (Math.sin(this.time * 14) * .5 + .5) : 0;
        p.sprite(spr, x, base, {
          scale: s, ax: .5, ay: 1, alpha: fade,
          hue: o.extra.rainbow ? this.time * .9 : (trip.level > 4 ? hue : 0),
          flip: o.side > 0
        });
        if (rainbow > .5) {
          p.circle(x, base - s * 4, s * 6, C.cssa(C.rainbow(this.time * 1.2, .6), .22));
        }
        break;
      }
    }
  }
}

PX.World = World;
PX.WORLD_LIST = WORLDS;
})(window.PX);
