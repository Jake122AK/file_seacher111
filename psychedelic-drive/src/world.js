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

const MAX_DRAW = 200;   // 1フレームに描く路肩オブジェクトの上限

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
    this.density = M.lerp(1, 3.4, M.sat(trip.level / 10)) * M.lerp(.75, 1.75, trip.groove);
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

  _spawnAt(z) {
    // 両サイド
    for (let s = -1; s <= 1; s += 2) {
      if (this.rng() > .92) continue;
      const kind = this._pickKind();
      const near = 1.05 + this.rng() * 1.35;
      const o = this._mk(kind, z + this.rng() * 1.5, s * near);
      this.objects.push(o);
      // 群衆: figure は密度に応じて横一列に増える（10人→100人）
      if (kind === 'figure') {
        const extra = Math.floor(M.lerp(0, 5, M.sat((this.density - 1) / 2.6)) + this.rng() * 2);
        for (let i = 1; i <= extra; i++) {
          const o2 = this._mk('figure', z + this.rng() * 2.2, s * (near + i * (.62 + this.rng() * .4)));
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
    if (t > .12 || oc > .12 || cl > .1) want.push('fish', 'fish', 'fish');
    if (t > .25 || sp > .2 || cl > .2) want.push('whale');
    if (sp > .2 || ab > .2 || cl > .2) want.push('ufo');
    if (ab > .25 || cl > .3) want.push('eye');
    if (cl > .3 || ab > .3) want.push('record', 'record');
    if (sp > .25 || ab > .2) want.push('island', 'island');

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
    const cloudA = M.sat(this.w.suburb + this.w.tropical * 1.1 + this.w.weird + this.w.night * .5 + this.w.climax * .6);
    if (cloudA > .03) {
      for (const c of this.clouds) {
        c.x += c.v * .016 + road.z * 0;
        if (c.x > 1.3) c.x = -.3;
        const face = M.sat(trip.cloudFace) * (c.s > .8 ? 1 : .3);
        D.cloud(p, c.x * p.w, c.y * skyH, p.w * .22 * c.s, p.h * .028 * c.s,
          C.mix(pal.cloud, pal.accentA, trip.level / 22), face, cloudA * .85);
      }
    }

    // 万華鏡的な幾何オーバーレイ（抽象/クライマックス）
    const geo = M.sat(this.w.abstract * 1.2 + this.w.climax * .8);
    if (geo > .03) this._geoOverlay(p, pal, cond, trip, hz, geo);

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

  _geoOverlay(p, pal, cond, trip, hz, amt) {
    const ctx = p.ctx;
    const cx = p.w * .5, cy = hz * .62;
    const n = 5;
    ctx.globalAlpha = amt * (.18 + cond.env.kick * .22);
    for (let i = 0; i < n; i++) {
      const r = ((this.time * 26 + i * 40) % 190) * (.4 + trip.level / 22);
      const col = C.rainbow(i * .17 + this.time * .12, .6);
      p.ring(cx, cy, r, C.css(col), amt * (1 - r / 200) * .5, 1 + (i % 2));
    }
    // 六角の格子
    ctx.globalAlpha = amt * .16;
    const seg = 6;
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2 + this.time * .12;
      const L = p.w * .8;
      p.line(cx, cy, cx + Math.cos(a) * L, cy + Math.sin(a) * L, C.css(C.rainbow(i / seg + this.time * .2, .65)), amt * .3);
    }
    ctx.globalAlpha = 1;
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
      const a = M.sat(wCl);
      D.mountains(p, hz + 1, p.h * .06, C.mix(pal.far, pal.accentB, .3), 1.3, scroll * .05, a * .5);
      for (let i = 0; i < 16; i++) {
        const bx = M.mod(i * 22 - scroll * .05, p.w + 50) - 25;
        const h = 8 + M.hash(i * 4.4) * p.h * .16;
        D.building(p, bx, hz + 2, 7 + M.hash(i * 2.2) * 7, h, 1,
          { alpha: a * .45, body: C.mix(pal.mid, pal.accentC, .2), win: [255, 255, 255], winOff: pal.near, seed: i + 9, beatWin: cond.env.kick });
      }
    }
  }

  /* ------ 中景（地平線に沿う帯） ------------------------------------ */
  _midLayer(p, pal, cond, trip, hz, road) {
    const ctx = p.ctx;
    const scroll = road.z * 2.6;
    // 群衆バンド: 南国/クライマックスで地平線までフラダンサー
    const crowd = M.sat((this.w.tropical + this.w.climax) * (0.4 + trip.groove * .9) * (trip.level / 6));
    if (crowd > .06 && PX.SPR.hula1) {
      const rows = 1 + Math.floor(crowd * 2.4);
      for (let r = 0; r < rows; r++) {
        const yy = hz + 1 + r * 2;
        const sc = 1;
        const a = crowd * (1 - r * .18);
        const count = Math.floor(p.w / 6) + 3;
        const beatOff = (cond.env.kick > .4 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const x = M.mod(i * 5 - scroll * (.02 + r * .004) + r * 2.5, p.w + 12) - 6;
          const ph = M.hash2(i * 1.7, r * 3.1);
          const f = (Math.floor(cond.beat * 2 + ph * 2) % 2) ? PX.SPR.hula2 : PX.SPR.hula1;
          p.sprite(f, x, yy + 1 - beatOff, {
            scale: sc, ax: .5, ay: 1, alpha: a * .9,
            hue: trip.hueSpin + ph * .3, sway: Math.sin(cond.beat * Math.PI + ph * 6) * 1.2
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
      const fade = M.sat((86 - dz) / 26) * M.sat((dz - .6) / 1.2);
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
          D.tree(p, x, base, h, m, sway * (1 + palm), colA, colB, fade, hue);
        }
        break;
      }
      case 'house': {
        const tall = M.sat(this.w.city * 1.4 + this.w.climax * .5);
        const melt = M.sat(this.w.space * 1.2 + this.w.abstract * .9);
        const w = unit * (.85 + o.sc * .5) * (1 + tall * .1);
        const h = unit * (1.5 + o.sc * .8) * M.lerp(1, 3.2, tall);
        D.building(p, x, base, w, h, tall, {
          alpha: fade, melt,
          body: C.mix(pal.near, pal.mid, .3),
          roof: C.mix(pal.accentC, pal.near, .4),
          win: C.mix(pal.lightGlow, pal.accentA, .3),
          winOff: C.mix(pal.mid, [0, 0, 0], .35),
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
        if (hula > .4) {
          const f = (Math.floor(cond.beat * 2 + o.phase * 2) % 2) ? S.hula2 : S.hula1;
          p.sprite(f, x, base, {
            scale: s, ax: .5, ay: 1, alpha: fade, hue,
            sway: dance * s * 1.5,
            squash: 1 + Math.sin(cond.beat * Math.PI * 2 + o.phase * 6) * .07 * (0.4 + trip.groove)
          });
          // 手を振る（グルーヴが高いほど）
          if (trip.groove > .72 && s > 1 && Math.sin(this.time * 3 + o.phase * 10) > .5) {
            p.rect(x + s * 4, base - s * 12, s, s, C.css(pal.accentA));
          }
        } else {
          const f = (Math.floor(this.time * 4 + o.phase * 3) % 2) ? S.walk2 : S.walk1;
          p.sprite(f, x, base, { scale: s, ax: .5, ay: 1, alpha: fade, hue: trip.level > 3 ? hue : 0, flip: o.side > 0 });
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
        const gap = Math.max(2, Math.round(unit * .13));
        const n = Math.max(2, Math.round(h / gap));
        for (let i = 0; i < n; i++) {
          const yy = base - h + i * gap + M.mod(this.time * gap * 2, gap);
          if (yy > base) continue;
          ctx.fillStyle = C.css(C.rainbow(i * .08 + this.time * .25, .55));
          ctx.fillRect(Math.round(x - w / 2 + 1), Math.round(yy), Math.max(1, Math.round(w - 2)), Math.max(1, Math.round(gap * .45)));
        }
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
