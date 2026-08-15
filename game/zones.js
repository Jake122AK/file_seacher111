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
  if (t > 152 && t < 246) return Math.sin(t * 0.83) > -0.15;   // 池と沢のほとりは疎
  if (t > 334 && t < 381) return true;                          // 四ツ辻は開ける
  if (t > 392) return Math.sin(t * 1.31) > -0.35;               // お塚の区間はまばら
  return false;
}

/* ---------------------------------------------------------------------------
   参道の分岐
   実物の千本鳥居は途中で2本に分かれ、しばらく並んで走ってからまた合流する。
   第2経路は「中心線から横に off(t) だけ寄った道」として持つ。地形のほうは
   bankHeight() が2本のうち近いほうからの距離で土手を作るので、間に土手が
   1本残り、それがそのまま2本を隔てる仕切りになる。
   --------------------------------------------------------------------------- */
const BRANCH = { t0: 30, t1: 75, off: 5.6, ramp: 0.30 };

/* 分かれ目と合流点で 0、途中は平行。両端は smoothstep なので傾きも 0 になり、
   地形にも道にも折れ目が出ない。 */
function branchOffsetAt(t) {
  if (t <= BRANCH.t0 || t >= BRANCH.t1) return 0;
  const u = (t - BRANCH.t0) / (BRANCH.t1 - BRANCH.t0);
  return BRANCH.off * smoothstep(0, BRANCH.ramp, u) * smoothstep(0, BRANCH.ramp, 1 - u);
}
function pathXAt2(t) { return pathXAt(t) + branchOffsetAt(t) * pathRight(t)[0]; }
function branchPos(t) {
  const P = pathPos(t), R = pathRight(t), o = branchOffsetAt(t);
  return [P[0] + R[0] * o, P[1], P[2] + R[2] * o];
}
function branchTan(t) {
  const a = branchPos(t - 0.3), b = branchPos(t + 0.3);
  return norm(sub(b, a));
}

/* ---------------------------------------------------------------------------
   水 — 新池と、そこへ落ちる沢
   もとの POND は路面から 15m 横・1m 下に水面の円盤を置いていただけで、その
   高さの地形は路面より 10.7m 高い。つまり池は山の中に完全に埋まっていて、
   一度も見えていなかった。地形のほうに窪地を掘って、そこに水を張る。
   --------------------------------------------------------------------------- */
/* 窪地は「池の中心からの半径」で掘ってはいけない。参道は池から 16m 離れて
   いるので、半径で掘ると路肩の手前で効果が消え、参道と水面のあいだに高さ 5m
   の壁が残る。池は見えないままになる。
   掘るのは断面で決める: 路肩から水際へ向かってなだらかに落ちる形を、t の窓
   （新池の区間）で掛ける。参道そのものは、素の地面のほうが低いので掘れない。 */
/* 池を大きく取ると対岸が遠くなる。木の散らしは中心線から 24m までしか
   届かないので、それを越えたところに斜面を露出させると、陽の当たった苔の
   面がのっぺりした壁として立つ（実際そうなった）。対岸は木立の中に収める。 */
const POND = {
  x: 0, z: 182, r: 7.5, y: 0, s: 13.5, bedRel: -1.35, waterRel: -0.75,
  tflat: 11.0, trim: 26.0,      // 参道に沿った池の長さ
  shoreY: 0.55, shore0: 1.6, shore1: 9.0,   // 路肩から水際までの落とし方
  far0: 19.0, far1: 36.0,       // 対岸。ここから山へ戻す
};
/* 沢は t=242 で止める。そこから先（248〜）は見晴らしのために斜面を落として
   あるので、溝を伸ばすと川床のほうが下流より低くなり、水が坂を登る。

   水面の高さは**路面からの相対**で決める（-0.35m）。参道自体が下っていくので
   これだけで下流方向へ必ず下がる。溝を地形に彫って水を張る方式だと、土手の
   上（目線より 4m 高いところ）に水面が来て、手前の縁に隠れて見えなかった。 */
const STREAM = {
  t0: 193, t1: 242, half: 1.10, lip: 4.6,
  waterRel: -0.35, bedRel: -0.62,   // 路面から見た水面と川床
  shore0: 1.9, shoreY: 0.45,        // 路肩からの落とし始め
  far: 5.0,                         // 対岸が山へ戻るまで
};

/* 沢の中心線（参道からの横距離）。下流（池側）で外へ開き、上流では参道の
   すぐ脇を流れる。歩いていて目に入る位置に置くのが狙い。 */
function streamSAt(t) {
  const u = (t - STREAM.t0) / (STREAM.t1 - STREAM.t0);
  return 8.0 - 3.4 * u + 0.55 * Math.sin(t * 0.115) + 0.25 * Math.sin(t * 0.31);
}
function nearStream(s, t) {
  if (t < STREAM.t0 - 3 || t > STREAM.t1 + 3) return false;
  return Math.abs(s - streamSAt(t)) < STREAM.half + 2.2;
}

/* 水の上。樹冠を抜く範囲はこれより広く取る（幹より梢のほうが張り出す）。
   ただし**水面のぶんだけ**にすること。窪地ぜんぶ（far1=42m まで）を抜いた
   ときは対岸の木も消えて、陽の当たった苔の斜面がのっぺりした明るい壁として
   残った。対岸に木があることが、水面の向こうの奥行きになる。 */
function overWater(s, t) {
  if (s < 3.0) return false;
  if (t >= STREAM.t0 - 4 && t <= STREAM.t1 + 4 && Math.abs(s - streamSAt(t)) < 5.0) return true;
  return Math.abs(t - POND.z) < 11.0 && s > 5.5 && s < POND.s + POND.r * 0.9;
}

/* ---------------------------------------------------------------------------
   四ツ辻の見晴らし
   京都盆地は WNW。参道は ENE に登るので、世界座標では **+X・-Z**、つまり
   登っていく自分から見て「右うしろ」にある（実行時の R.cityDir が
   (+0.707, 0, -0.707) を返す）。その側の斜面を落としておかないと、目の前の
   土手で視線が止まる。t の窓を広く取るのは、斜めに振り返る視線が隣の区間の
   土手に当たるため。
   --------------------------------------------------------------------------- */
/* s0/s1 は効き始めと効き切りの横距離。ここを 3.0→8.0 にしていたときは、
   路肩に高さ 2m の土手が残り、それが仰角 +5° を塞いでいた。街の帯は地平の
   すぐ下（-0.3°〜-2.2°）なので、路肩が目の高さを越えた時点で何も見えない。 */
const VIEW = { t0: 248, t1: 300, t2: 402, t3: 444, s0: 2.1, s1: 5.2, fall: 0.55 };
function viewOpenAt(t) {
  return smoothstep(VIEW.t0, VIEW.t1, t) * (1 - smoothstep(VIEW.t2, VIEW.t3, t));
}

/* 木を伐り開ける範囲。斜面を落としただけでは木立が視線を塞ぐし、かといって
   区間まるごと坊主にすると伐採跡にしか見えない。四ツ辻から街の方角（斜め
   うしろ・+X / -Z）へ開く扇形だけを抜く。扇は遠いほど広い。 */
const LOOKOUT = { t: 352, half: 15.0, spread: 0.44 };
function viewClearAt(s, t) {
  if (s <= 1.5) return 0;
  const half = LOOKOUT.half + s * LOOKOUT.spread;
  const d = Math.abs(t - (LOOKOUT.t - s));      // 45度で下がっていく扇の中心
  return (1 - smoothstep(half * 0.62, half, d)) * smoothstep(1.5, 5.0, s);
}

/* 四ツ辻の展望台。実物は参道が広がった平場で、崖側に黒い金属の手すりが
   立っている。斜面を落としただけでは「道の脇が切れている」だけなので、
   立ち止まって眺める場所として平場を作る。 */
const LOOK = { t: 352, tflat: 7.5, trim: 12.0, s0: 7.6, s1: 9.6, y: 0.06 };
function lookoutAt(s, t) {
  if (s < 0.8) return 0;
  return (1 - smoothstep(LOOK.tflat, LOOK.trim, Math.abs(t - LOOK.t)))
       * (1 - smoothstep(LOOK.s0, LOOK.s1, s));
}

/* 地形に掘るもの一式。bankHeight() の素の高さ h を受けて、掘ったあとの高さを
   返す。掘るだけで盛らない（min を取る）ので、既存の地形とは必ず繋がる。 */
function terrainCarve(s, t, h) {
  // 新池の窪地
  if (s > 0) {
    const w = (1 - smoothstep(POND.tflat, POND.trim, Math.abs(t - POND.z)))
            * (1 - smoothstep(POND.far0, POND.far1, s));
    if (w > 0.001) {
      const bed = POND.bedRel + (pathYAt(POND.z) - pathYAt(t));   // 水平な池底
      const target = lerp(POND.shoreY, bed, smoothstep(POND.shore0, POND.shore1, s));
      if (target < h) h += (target - h) * w;
    }
  }
  // 沢。路肩から水際へ落として、対岸で山へ戻す
  if (s > 0 && t > STREAM.t0 - STREAM.lip && t < STREAM.t1 + STREAM.lip) {
    const ends = smoothstep(STREAM.t0 - STREAM.lip, STREAM.t0 + 1.5, t)
               * (1 - smoothstep(STREAM.t1 - 1.5, STREAM.t1 + STREAM.lip, t));
    if (ends > 0.001) {
      const sc = streamSAt(t);
      const target = s <= sc
        ? lerp(STREAM.shoreY, STREAM.bedRel, smoothstep(STREAM.shore0, sc, s))
        : lerp(STREAM.bedRel, h, smoothstep(sc, sc + STREAM.far, s));
      if (target < h) h += (target - h) * ends;
    }
  }
  // 四ツ辻の見晴らし。街のある側（+X）だけ落とす
  if (s > VIEW.s0) {
    const vo = viewOpenAt(t);
    if (vo > 0.001) {
      const fall = -VIEW.fall * (s - VIEW.s0);
      const w = vo * smoothstep(VIEW.s0, VIEW.s1, s);
      if (fall < h) h += (fall - h) * w;
    }
  }
  // 展望台の平場。落としたあとに持ち上げるので、掘る順序の最後に置く
  const lw = lookoutAt(s, t);
  if (lw > 0.001) h += (LOOK.y - h) * lw;
  return h;
}

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

/* 展望台の手すり。黒い金属の柵。柱と横木2本だけの、実物どおりの簡素なもの。 */
function buildRailPost() {
  const g = new Geo(), m = M4.create();
  M4.compose(m, [0, 0.52, 0], 0, [1, 1, 1]);
  g.merge(roundedBox(0.05, 1.04, 0.05, 0.012, 1, { mat: MAT.BLACK }), m);
  M4.compose(m, [0, 1.03, 0], 0, [1, 1, 1]);
  g.merge(roundedBox(0.075, 0.05, 0.075, 0.018, 1, { mat: MAT.BLACK }), m);
  return g;
}
function buildRailSpan() {
  const g = new Geo(), m = M4.create();
  for (const y of [0.98, 0.62]) {
    M4.compose(m, [0, y, 0], 0, [1, 1, 1]);
    g.merge(roundedBox(0.042, 0.042, 1.42, 0.010, 1, { mat: MAT.BLACK }), m);
  }
  return g;
}

/* 分岐した道の敷石。本体の舗装は中心線の ±1.45m にしか敷かれていないので、
   第2の道はそのままだと苔の上を歩くことになる。分かれ目と合流点では2本が
   重なるので、離れている区間だけ、幅を絞りながら敷く（重ねると z 争いで
   ちらつく）。 */
function buildBranchPath() {
  const g = new Geo();
  const rows = [];
  for (let t = BRANCH.t0; t <= BRANCH.t1; t += 0.5) {
    const off = branchOffsetAt(t);
    const hw = 1.45 * smoothstep(1.9, 3.1, off);
    if (hw <= 0.02) continue;
    const P = pathPos(t), Rt = pathRight(t);
    const row = [];
    for (let i = 0; i <= 6; i++) {
      const s = off + lerp(-hw, hw, i / 6);
      row.push({ x: P[0] + Rt[0] * s, y: P[1] + bankHeight(s, t), z: P[2] + Rt[2] * s, s, t });
    }
    rows.push(row);
  }
  const ids = [];
  for (let r = 0; r < rows.length; r++) {
    const row = [];
    for (let i = 0; i < rows[r].length; i++) {
      const c = rows[r][i];
      row.push(g.push(c.x, c.y, c.z, 0, 1, 0, (c.s - branchOffsetAt(c.t)) * 0.60, c.t * 0.60,
                      MAT.STONE));
    }
    ids.push(row);
  }
  for (let r = 0; r < ids.length - 1; r++)
    for (let i = 0; i < ids[r].length - 1; i++)
      g.quad(ids[r][i], ids[r + 1][i], ids[r + 1][i + 1], ids[r][i + 1]);
  return g;
}

/* 沢の水面。地形に掘った溝の底を追いかけるリボン。下流へ向かって高さが
   単調に下がるように締める（1箇所でも上を向くと水が坂を登って見える）。 */
function buildStreamWater() {
  const g = new Geo();
  const rows = [];
  for (let t = STREAM.t1; t >= STREAM.t0 - 1.5; t -= 0.8) {
    const sc = streamSAt(t);
    const P = pathPos(t), Rt = pathRight(t), T = pathTan(t);
    const y = P[1] + STREAM.waterRel;
    const ends = smoothstep(STREAM.t0 - 1.5, STREAM.t0 + 2.0, t)
               * (1 - smoothstep(STREAM.t1 - 3.0, STREAM.t1, t));
    const hw = STREAM.half * (0.55 + 0.45 * ends);
    rows.push({ cx: P[0] + Rt[0] * sc, cz: P[2] + Rt[2] * sc, y, hw,
                rx: Rt[0], rz: Rt[2], t });
  }
  const ids = [];
  for (const r of rows) {
    const row = [];
    for (const k of [-1, 0, 1]) {
      row.push(g.push(r.cx + r.rx * r.hw * k, r.y - (k === 0 ? 0.015 : 0),
                      r.cz + r.rz * r.hw * k, 0, 1, 0, k * 2.0, r.t * 0.5, MAT.WATER));
    }
    ids.push(row);
  }
  for (let i = 0; i < ids.length - 1; i++)
    for (let k = 0; k < 2; k++)
      g.quad(ids[i][k], ids[i][k + 1], ids[i + 1][k + 1], ids[i + 1][k]);
  return g;
}

/* 沢べりの石。水際の継ぎ目はここで隠れる。 */
function buildStreamStone() {
  return roundedBox(0.62, 0.42, 0.55, 0.13, 2, { mat: MAT.GRANITE, uScale: 1.6 });
}

/* 見晴らしの裾。地形メッシュは横 46m で終わるので、そのままだと四ツ辻から
   見たときに切り口が直線で空に接する。落ちていく斜面をもう一枚伸ばして、
   霧に溶けるところまで持っていく。 */
function buildViewSkirt() {
  const g = new Geo();
  const rows = [];
  for (let t = 226; t <= 458; t += 5.0) {
    const P = pathPos(t), Rt = pathRight(t);
    const vo = viewOpenAt(t);
    const row = [];
    for (let i = 0; i <= 6; i++) {
      /* 見晴らしが開いている t だけ外へ伸ばす。開いていないところまで一律に
         伸ばすと、そこは掘られていないので土手がそのまま伸び、100m 先に
         高さ 50m の壁が立つ。四ツ辻から街を見ると、それが視界の下半分を
         霞んだ茶色で埋めていた。開いていない t では幅 0 に畳む。 */
      const s = 46.0 + i * 13.0 * vo;
      // 起伏は本体メッシュの切り口（s=46）から効かせる。ここで段差を作ると
      // 継ぎ目に隙間が開く
      const fade = smoothstep(46.0, 64.0, s);
      const h = bankHeight(s, t) + (Math.sin(s * 0.21 + t * 0.13) * 0.9
              + Math.sin(t * 0.07 - s * 0.05) * 1.6) * fade;
      row.push({ x: P[0] + Rt[0] * s, y: P[1] + h, z: P[2] + Rt[2] * s, s, t });
    }
    rows.push(row);
  }
  const ids = [];
  for (let r = 0; r < rows.length; r++) {
    const row = [];
    for (let i = 0; i < rows[r].length; i++) {
      const c = rows[r][i];
      const cL = rows[r][Math.max(i - 1, 0)], cR = rows[r][Math.min(i + 1, rows[r].length - 1)];
      const cD = rows[Math.max(r - 1, 0)][i], cU = rows[Math.min(r + 1, rows.length - 1)][i];
      const n = norm(cross([cU.x - cD.x, cU.y - cD.y, cU.z - cD.z],
                           [cR.x - cL.x, cR.y - cL.y, cR.z - cL.z]));
      if (n[1] < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
      row.push(g.push(c.x, c.y, c.z, n[0], n[1], n[2], c.s * 0.10, c.t * 0.10, MAT.MOSS));
    }
    ids.push(row);
  }
  for (let r = 0; r < ids.length - 1; r++)
    for (let i = 0; i < ids[r].length - 1; i++)
      g.quad(ids[r][i], ids[r + 1][i], ids[r + 1][i + 1], ids[r][i + 1]);
  return g;
}

function buildPondSurface() {
  const g = new Geo(), N = 56;
  const c = g.push(0, 0, 0, 0, 1, 0, 0.5, 0.5, MAT.WATER);
  const ring = [];
  for (let i = 0; i <= N; i++) {
    const a = i / N * TAU;
    const rr = POND.r * (0.80 + 0.20 * Math.sin(a * 2.3) + 0.06 * Math.sin(a * 5.1));
    ring.push(g.push(Math.cos(a) * rr, 0, Math.sin(a) * rr, 0, 1, 0,
                     0.5 + Math.cos(a) * 1.6, 0.5 + Math.sin(a) * 1.6, MAT.WATER));
  }
  /* 巻き方向。(中心, ring[i], ring[i+1]) の順だと面法線が -Y を向き、上から
     見ると裏面カリングで消える。頂点法線が +Y を向いていても、カリングは
     三角形の巻きだけを見る。池が一度も見えなかったのは、山に埋まっていた
     ことに加えてこれが理由。 */
  for (let i = 0; i < N; i++) g.tri(c, ring[i + 1], ring[i]);
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

  /* 新池。窪地の底に張るので、水面は路面のすこし下に来る。 */
  const Pp = pathPos(POND.z), Rp = pathRight(POND.z);
  POND.x = Pp[0] + Rp[0] * POND.s;
  const pondZ = Pp[2] + Rp[2] * POND.s;
  POND.y = Pp[1] + POND.waterRel;
  const pond = new Mesh(buildPondSurface());
  const pm = M4.create();
  M4.compose(pm, [POND.x, POND.y, pondZ], 0, [1, 1, 1]);
  pond.setInstances([{ m: pm, tint: [1, 1, 1, 0.2] }]);      // w=0.2 : 静水
  S.draws.push({ mesh: pond, name: 'pond' });

  /* 沢。池に注ぐところまで一続き。
     （溝を細かい帯で描き足す仕掛けは要らなくなった。断面で掘るようにして
       中心線を横 4.6〜8m へ寄せたので、土手のメッシュ（横 13m まで 0.73m
       刻み）がそのまま溝の形を持てる。） */
  const stream = new Mesh(buildStreamWater());
  const sm = M4.create();
  M4.compose(sm, [0, 0, 0], 0, [1, 1, 1]);
  stream.setInstances([{ m: sm, tint: [1, 1, 1, 0.6] }]);    // w=0.6 : 流水
  S.draws.push({ mesh: stream, name: 'stream' });

  const rock = new Mesh(buildStreamStone());
  const ri = [];
  for (let t = STREAM.t0 - 1; t < STREAM.t1 + 1; t += 0.85) {
    const sc = streamSAt(t), P = pathPos(t), Rt = pathRight(t), T = pathTan(t);
    for (const sgn of [-1, 1]) {
      if (rn() < 0.28) continue;
      const off = sgn * (1.15 + rn() * 1.5);
      const x = P[0] + Rt[0] * (sc + off) + T[0] * (rn() - 0.5) * 0.8;
      const z = P[2] + Rt[2] * (sc + off) + T[2] * (rn() - 0.5) * 0.8;
      const sk = 0.55 + rn() * 1.35, m = M4.create();
      M4.compose(m, [x, WORLD.groundAt(x, z).y - 0.10 * sk, z], rn() * TAU,
                 [sk, sk * (0.6 + rn() * 0.6), sk], (rn() - 0.5) * 0.4, (rn() - 0.5) * 0.4);
      ri.push({ m, tint: [0.74 + rn() * 0.24, 0.76 + rn() * 0.22, 0.74 + rn() * 0.22, rn()], t });
    }
  }
  rock.setInstances(ri);
  S.draws.push({ mesh: rock, name: 'stream_rocks' });
  S.shadowDraws.push({ mesh: rock });

  /* 展望台の手すり。平場の崖側の縁に沿って立てる。 */
  {
    const post = new Mesh(buildRailPost()), span = new Mesh(buildRailSpan());
    const pi = [], si = [];
    const edge = LOOK.s0 - 0.45;
    for (let t = LOOK.t - LOOK.tflat - 1.5; t <= LOOK.t + LOOK.tflat + 1.5; t += 1.30) {
      const P = pathPos(t), Rt = pathRight(t), T = pathTan(t);
      const x = P[0] + Rt[0] * edge, z = P[2] + Rt[2] * edge;
      const gy = WORLD.groundAt(x, z).y;
      const ry = Math.atan2(T[0], T[2]);
      const m = M4.create();
      M4.compose(m, [x, gy - 0.04, z], ry, [1, 1, 1]);
      pi.push({ m, tint: [0.92 + rn() * 0.14, 0.92 + rn() * 0.12, 0.94 + rn() * 0.12, rn()], t });
      const P2 = pathPos(t + 0.65), R2 = pathRight(t + 0.65);
      const x2 = P2[0] + R2[0] * edge, z2 = P2[2] + R2[2] * edge;
      const m2 = M4.create();
      M4.compose(m2, [x2, WORLD.groundAt(x2, z2).y - 0.04, z2],
                 Math.atan2(pathTan(t + 0.65)[0], pathTan(t + 0.65)[2]), [1, 1, 1]);
      si.push({ m: m2, tint: [0.92, 0.92, 0.94, rn()], t });
    }
    post.setInstances(pi); span.setInstances(si);
    S.draws.push({ mesh: post, name: 'rail' });
    S.draws.push({ mesh: span, name: 'rail' });
    S.shadowDraws.push({ mesh: post });
  }

  /* 見晴らしの裾。土手のメッシュと同じくインスタンスを付けずに置く
     （付けると色の扱いが変わって、そこだけ質感が浮く）。 */
  const skirt = new Mesh(buildViewSkirt());
  S.draws.push({ mesh: skirt, name: 'view_skirt' });
  S.shadowDraws.push({ mesh: skirt });

  /* 分岐した第2の参道の鳥居。中心線の鳥居とぶつからないよう、十分に
     離れたところからだけ立てる。太陽の遮蔽モデルが読むのは中心線の
     R.toriiTs なので、こちらは別のメッシュにして混ぜない。 */
  const bt = new Mesh(buildTorii(true));
  const btLow = new Mesh(buildTorii(false));
  const bi = [];
  for (let t = BRANCH.t0; t < BRANCH.t1; t += 0.545 + rn() * 0.14) {
    if (branchOffsetAt(t) < 2.6) continue;
    const P = branchPos(t), T = branchTan(t), m = M4.create();
    const big = rn() < 0.07;
    const sc = (big ? 1.14 + rn() * 0.12 : 0.93 + rn() * 0.14) * 1.26;
    M4.compose(m, [P[0], P[1] - 0.03, P[2]], Math.atan2(T[0], T[2]),
               [sc * (0.96 + rn() * 0.11), sc, sc], 0, (rn() - 0.5) * 0.014);
    const age = Math.pow(rn(), 0.8);
    bi.push({ m, t, tint: [1.06 - age * 0.36 + (rn() - 0.5) * 0.10,
                           1.00 - age * 0.16 + (rn() - 0.5) * 0.09,
                           0.98 - age * 0.06 + (rn() - 0.5) * 0.09, rn()] });
  }
  const bpath = new Mesh(buildBranchPath());
  S.draws.push({ mesh: bpath, name: 'branch_path' });
  S.shadowDraws.push({ mesh: bpath });

  /* くぐり判定には分岐のぶんも入れる。第2の参道を選んでも数が途切れない
     ようにしたいので、横位置を添えて同じ一覧に混ぜる。 */
  R.toriiPass = (R.toriiPass || []).concat(bi.map(o => ({ t: o.t, s: branchOffsetAt(o.t) })));

  bt.setInstances(bi); btLow.setInstances(bi);
  S.draws.push({ mesh: bt, name: 'torii_branch' });
  S.shadowDraws.push({ mesh: btLow });

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
    + ' 段  お塚 ' + oi.length + ' 基  分岐鳥居 ' + bi.length + ' 基  沢の石 '
    + ri.length + ' 個');
}
