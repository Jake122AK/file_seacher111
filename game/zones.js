/* ==== g_zones.js ==== */
/* 参道の区間ごとの性格。ずっと同じ密度の鳥居が続くのは実物と違うし、
   単に長いだけになる。稲荷山は 千本鳥居 → 奥社 → 新池のほとり →
   石段の登り → 四ツ辻の見晴らし → お塚群 と表情が変わる。
   build_shrineplay.py が shrineplay.html に差し込む。 */
const ZONES = [
  { t0:   0, t1:  95, name: '千本鳥居' },
  { t0:  95, t1: 150, name: '奥社奉拝所' },
  { t0: 150, t1: 215, name: '新池' },
  { t0: 215, t1: 330, name: '石段' },
  { t0: 330, t1: 385, name: '四ツ辻' },
  { t0: 385, t1: 520, name: 'お塚群' },
];
function zoneAt(t) {
  for (const z of ZONES) if (t >= z.t0 && t < z.t1) return z;
  return ZONES[ZONES.length - 1];
}
function toriiSkip(t) {
  if (t > 152 && t < 210) return Math.sin(t * 0.83) > -0.15;   // 池のほとりは疎
  if (t > 334 && t < 381) return true;                          // 四ツ辻は開ける
  if (t > 392) return Math.sin(t * 1.31) > -0.35;               // お塚の区間はまばら
  return false;
}

const POND = { x: 0, z: 182, r: 13.5, y: 0 };

/* 石段。地面そのものを段にするとカメラも参拝客も跳ねるので、当たり判定は
   滑らかな坂のまま、見た目だけ段にする。 */
function buildStepSlab() {
  return roundedBox(2.9, 0.17, 0.42, 0.035, 2, { mat: MAT.GRANITE, uScale: 2.2 });
}

/* お塚。山中に一万基以上ある小さな石の祠。石の鳥居と、その奥の塚石。 */
function buildOtsuka() {
  const g = new Geo(), m = M4.create();
  const post = roundedBox(0.085, 1.05, 0.085, 0.02, 2, { mat: MAT.GRANITE });
  for (const sx of [-0.27, 0.27]) { M4.compose(m, [sx, 0.52, 0], 0, [1, 1, 1]); g.merge(post, m); }
  M4.compose(m, [0, 1.06, 0], 0, [1, 1, 1]);
  g.merge(roundedBox(0.82, 0.09, 0.13, 0.03, 2, { mat: MAT.GRANITE }), m);
  M4.compose(m, [0, 0.88, 0], 0, [1, 1, 1]);
  g.merge(roundedBox(0.64, 0.065, 0.09, 0.02, 2, { mat: MAT.GRANITE }), m);
  M4.compose(m, [0, 0.34, -0.34], 0, [1, 1, 1]);
  g.merge(roundedBox(0.42, 0.68, 0.24, 0.05, 2, { mat: MAT.STONE }), m);
  return g;
}

function buildPondSurface() {
  const g = new Geo(), N = 56;
  const c = g.push(0, 0, 0, 0, 1, 0, 0.5, 0.5, MAT.STONE);
  const ring = [];
  for (let i = 0; i <= N; i++) {
    const a = i / N * TAU;
    const rr = POND.r * (0.80 + 0.20 * Math.sin(a * 2.3) + 0.06 * Math.sin(a * 5.1));
    ring.push(g.push(Math.cos(a) * rr, 0, Math.sin(a) * rr, 0, 1, 0,
                     Math.cos(a) * 3, Math.sin(a) * 3, MAT.STONE));
  }
  for (let i = 0; i < N; i++) g.tri(c, ring[i], ring[i + 1]);
  return g;
}

function buildZones() {
  const rn = mulberry32(20260812);
  const S = R.scene;

  const slab = new Mesh(buildStepSlab());
  const si = [];
  for (let t = 216; t < 329; t += 0.44) {
    const P = pathPos(t), T = pathTan(t), m = M4.create();
    M4.compose(m, [P[0], P[1] + 0.02, P[2]], Math.atan2(T[0], T[2]),
               [1 + (rn() - 0.5) * 0.06, 1, 1], 0, (rn() - 0.5) * 0.02);
    si.push({ m, tint: [0.86 + rn() * 0.14, 0.86 + rn() * 0.12, 0.84 + rn() * 0.12, rn()], t });
  }
  slab.setInstances(si);
  S.draws.push({ mesh: slab, name: 'steps' });
  S.shadowDraws.push({ mesh: slab });

  POND.x = pathXAt(POND.z) + 15.5;
  POND.y = pathYAt(POND.z) - 1.05;
  const pond = new Mesh(buildPondSurface());
  const pm = M4.create();
  M4.compose(pm, [POND.x, POND.y, POND.z], 0, [1, 1, 1]);
  pond.setInstances([{ m: pm, tint: [0.30, 0.36, 0.34, 0.2] }]);
  S.draws.push({ mesh: pond, name: 'pond' });

  const ot = new Mesh(buildOtsuka());
  const oi = [];
  const cluster = (t, side, n, spread) => {
    const P = pathPos(t), Rt = pathRight(t), T = pathTan(t);
    for (let i = 0; i < n; i++) {
      const u = (rn() - 0.5) * spread, v = 2.6 + rn() * spread * 0.9;
      const x = P[0] + Rt[0] * side * v + T[0] * u;
      const z = P[2] + Rt[2] * side * v + T[2] * u;
      const gy = WORLD.groundAt(x, z).y;
      const sc = 0.62 + rn() * 0.55, m = M4.create();
      M4.compose(m, [x, gy - 0.04, z], Math.atan2(T[0], T[2]) + (rn() - 0.5) * 0.5,
                 [sc, sc, sc], 0, (rn() - 0.5) * 0.03);
      oi.push({ m, tint: [0.80 + rn() * 0.18, 0.82 + rn() * 0.16, 0.78 + rn() * 0.16, rn()], t });
    }
  };
  // お塚は稲荷山の顔。実物は一万基以上あるので、斜面を埋めるくらいでちょうどいい
  for (let t = 388; t < 518; t += 2.3) {
    cluster(t, rn() < 0.5 ? -1 : 1, 3 + Math.floor(rn() * 6), 4.2);
    if (rn() < 0.45) cluster(t + 1.1, rn() < 0.5 ? -1 : 1, 2 + Math.floor(rn() * 5), 7.5);
  }
  for (let t = 152; t < 212; t += 4.0) cluster(t, -1, 2 + Math.floor(rn() * 4), 3.4);
  for (let t = 100; t < 148; t += 6.5) cluster(t, rn() < 0.5 ? -1 : 1, 2 + Math.floor(rn() * 3), 3.0);
  cluster(120, 1, 9, 5.0);
  cluster(340, -1, 6, 6.0);
  ot.setInstances(oi);
  S.draws.push({ mesh: ot, name: 'otsuka' });
  S.shadowDraws.push({ mesh: ot });
  console.log('区間 ' + ZONES.map(z => z.name).join('/') + '  石段 ' + si.length
    + ' 段  お塚 ' + oi.length + ' 基');
}
