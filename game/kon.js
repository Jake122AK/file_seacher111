/* ==== kon.js ==== */
/* =========================================================================
   子ぎつねの「コン」

   参道を先導する相棒。無言の山に返事をする者を一匹置くだけで、同じ地形が
   まるで別の場所になる。

   作りは3段：
     * 骨 —— 18本。姿勢はすべてこの局所空間で解き、世界へは配置行列1枚で運ぶ
     * 皮 —— 部位ごとに「効いてよい骨」を指定してから距離で重みを配る。
              全身から最近傍を採ると、尻尾が後脚に、耳が首に滲む
     * 歩容 —— 足の**接地点**を先に決め、そこへ2骨のIKで脚を通す。
              関節角を直接振ると、走るたびに足が地面を滑る

   スキニングは CPU で回して Mesh.updateVerts に流す。頂点は 2 千に満たない
   ので、GPU スキニング（ボーンテクスチャ）を1匹のために足す価値がない。
   ========================================================================= */

/* --- 脚の関節。バインド姿勢からして**曲げて**置く。
   まっすぐな脚で束ねると、股から足までの距離が骨の合計と一致してしまい、
   IK は必ず伸びきった解を返す。どんな歩容を書いても膝が曲がらない。 --- */
const KON_LEGS = [
  { n: 'fl', hip: [0.070, 0.268, 0.172], knee: [0.070, 0.150, 0.118], foot: [0.070, 0.018, 0.176], front: 1, ph: 0.00 },
  { n: 'fr', hip: [-0.070, 0.268, 0.172], knee: [-0.070, 0.150, 0.118], foot: [-0.070, 0.018, 0.176], front: 1, ph: 0.13 },
  { n: 'bl', hip: [0.076, 0.270, -0.058], knee: [0.076, 0.152, 0.006], foot: [0.076, 0.018, -0.062], front: 0, ph: 0.52 },
  { n: 'br', hip: [-0.076, 0.270, -0.058], knee: [-0.076, 0.152, 0.006], foot: [-0.076, 0.018, -0.062], front: 0, ph: 0.63 },
];

/* --- 骨。位置は「バインド姿勢での局所座標」。前が +Z、足が y≈0.018 --- */
const KON_BONES = [
  /*  0 */['root', -1, [0, 0.300, -0.020]],
  /*  1 */['spine', 0, [0, 0.310, 0.085]],
  /*  2 */['chest', 1, [0, 0.318, 0.185]],
  /*  3 */['neck', 2, [0, 0.356, 0.250]],
  /*  4 */['head', 3, [0, 0.420, 0.306]],
  /*  5 */['earL', 4, [0.045, 0.486, 0.308]],
  /*  6 */['earR', 4, [-0.045, 0.486, 0.308]],
  /*  7 */['tail1', 0, [0, 0.312, -0.100]],
  /*  8 */['tail2', 7, [0, 0.352, -0.178]],
  /*  9 */['tail3', 8, [0, 0.412, -0.234]],
  /* 10 */['flU', 2, KON_LEGS[0].hip],
  /* 11 */['flD', 10, KON_LEGS[0].knee],
  /* 12 */['frU', 2, KON_LEGS[1].hip],
  /* 13 */['frD', 12, KON_LEGS[1].knee],
  /* 14 */['blU', 0, KON_LEGS[2].hip],
  /* 15 */['blD', 14, KON_LEGS[2].knee],
  /* 16 */['brU', 0, KON_LEGS[3].hip],
  /* 17 */['brD', 16, KON_LEGS[3].knee],
];
const KB = {};
KON_BONES.forEach((b, i) => { KB[b[0]] = i; });
KON_LEGS.forEach(L => {
  L.u = KB[L.n + 'U']; L.d = KB[L.n + 'D'];
  L.home = L.foot.slice();
  L.l1 = Math.hypot(L.knee[1] - L.hip[1], L.knee[2] - L.hip[2]);
  L.l2 = Math.hypot(L.foot[1] - L.knee[1], L.foot[2] - L.knee[2]);
  /* バインドでの角度。(0,-1,0) から測った、脚の平面内の向き。 */
  const s = L.front ? 1 : -1;
  const r0 = Math.hypot(L.foot[1] - L.hip[1], L.foot[2] - L.hip[2]);
  const a0 = Math.atan2(-(L.foot[2] - L.hip[2]), -(L.foot[1] - L.hip[1]));
  const al0 = Math.acos(clamp((L.l1 * L.l1 + r0 * r0 - L.l2 * L.l2) / (2 * L.l1 * r0), -1, 1));
  const be0 = Math.acos(clamp((L.l2 * L.l2 + r0 * r0 - L.l1 * L.l1) / (2 * L.l2 * r0), -1, 1));
  L.a0U = a0 + s * al0;
  L.a0D = a0 - s * be0;
});

/* 骨の「先端」。重みを配るときの線分の終点で、子があるならその位置。
   末端の骨は伸びていく先を手で書く。 */
const KON_TIPS = {
  head: [0, 0.408, 0.450], earL: [0.068, 0.616, 0.298], earR: [-0.068, 0.616, 0.298],
  tail3: [0, 0.478, -0.282],
  flD: KON_LEGS[0].foot, frD: KON_LEGS[1].foot,
  blD: KON_LEGS[2].foot, brD: KON_LEGS[3].foot,
};

/* --- 色。sRGB で書いて線形へ落とす（albedo は線形で渡す） --- */
function konSrgb(hex) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
const KON_COL = {
  fur: konSrgb(0xd9762c),      // 背の赤茶
  belly: konSrgb(0xf3e8d8),    // 腹・胸・頬・尾の先
  sock: konSrgb(0x3f2a20),     // 足先と耳の先
  pink: konSrgb(0xe0a096),     // 耳の内
  eye: konSrgb(0x120d0a),
  spark: konSrgb(0xffffff),
  nose: konSrgb(0x2b1c17),
  bib: konSrgb(0xc4382a),      // 前掛け
  bell: konSrgb(0xc7972f),
};

/* 部位を積むための入れ物。頂点の範囲と、そこに効いてよい骨を覚えておく。 */
function konPart(K, sub, bones, colour, xform) {
  const v0 = K.geo.vcount;
  K.geo.merge(sub, xform);
  K.parts.push({ v0, v1: K.geo.vcount, bones, colour });
}

/* 節。曲がったバインドに沿って、太さを変えながら1本通す。 */
function konLimb(a, b, r0, r1, mat) {
  const rings = [];
  for (let i = 0; i <= 3; i++) {
    const k = i / 3;
    rings.push({
      p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
      rx: r0 + (r1 - r0) * k, ry: r0 + (r1 - r0) * k,
    });
  }
  return loft(rings, 12, { mat, uScale: 1, vScale: 2, up: [0, 0, 1] });
}

function buildKon() {
  const K = { geo: new Geo(), parts: [] };
  const g = K.geo;
  const SP = KB.spine, CH = KB.chest, NK = KB.neck, HD = KB.head, RT = KB.root;
  const BODY = [RT, SP, CH, NK], TAIL = [KB.tail1, KB.tail2, KB.tail3, RT];
  const M = MAT.FUR;

  /* 胴。尻から首の付け根まで一続きに通す。継ぎ目のある胴は、どれだけ
     きれいに陰影を付けても「積んだ筒」に見える。 */
  konPart(K, loft([
    { p: [0, 0.300, -0.205], rx: 0.024, ry: 0.028 },
    { p: [0, 0.308, -0.162], rx: 0.064, ry: 0.072 },
    { p: [0, 0.314, -0.086], rx: 0.088, ry: 0.094 },
    { p: [0, 0.316, 0.008], rx: 0.092, ry: 0.097 },
    { p: [0, 0.318, 0.102], rx: 0.089, ry: 0.094 },
    { p: [0, 0.324, 0.186], rx: 0.084, ry: 0.090 },
    { p: [0, 0.340, 0.236], rx: 0.067, ry: 0.072 },
    { p: [0, 0.370, 0.276], rx: 0.057, ry: 0.061 },
    { p: [0, 0.400, 0.300], rx: 0.054, ry: 0.056 },
  ], 18, { mat: M, uScale: 1, vScale: 2.2, up: [0, 1, 0] }), BODY, 'body');

  /* 頭。仔なので大きめに、鼻先は短く。狐は口吻を伸ばすと途端に大人になり、
     もっと伸ばすと蟻食いになる。 */
  const m = M4.create();
  konPart(K, ellipsoid(0.084, 0.079, 0.081, 20, { rows: 12, mat: M, uScale: 1, vScale: 1 }),
    [HD, NK], 'head', M4.compose(m, [0, 0.432, 0.330], 0, [1, 1, 1]));
  for (const sx of [-1, 1])
    konPart(K, ellipsoid(0.029, 0.036, 0.030, 14, { rows: 8, mat: M }),
      [HD], 'head', M4.compose(m, [sx * 0.058, 0.410, 0.322], 0, [1, 1, 1], 0, sx * 0.28));
  /* 鼻筋 */
  konPart(K, loft([
    { p: [0, 0.422, 0.362], rx: 0.045, ry: 0.040 },
    { p: [0, 0.417, 0.400], rx: 0.036, ry: 0.031 },
    { p: [0, 0.411, 0.430], rx: 0.023, ry: 0.020 },
    { p: [0, 0.408, 0.444], rx: 0.012, ry: 0.011 },
  ], 14, { mat: M, uScale: 1, vScale: 2, up: [0, 1, 0] }), [HD], 'muzzle');
  konPart(K, ellipsoid(0.015, 0.012, 0.011, 12, { rows: 7, mat: MAT.BLACK }),
    [HD], 'nose', M4.compose(m, [0, 0.408, 0.447], 0, [1, 1, 1]));

  /* 目。頭の球の上に載せる。白いハイライトが一点入るだけで顔になる。 */
  K.eyes = [];
  const HC = [0, 0.432, 0.330];
  const onHead = (d, r) => {
    const l = Math.hypot(d[0], d[1], d[2]);
    return [HC[0] + d[0] / l * r, HC[1] + d[1] / l * r, HC[2] + d[2] / l * r];
  };
  for (const sx of [-1, 1]) {
    const c = onHead([sx * 0.50, 0.28, 0.82], 0.081);
    const v0 = g.vcount;
    konPart(K, ellipsoid(0.0195, 0.021, 0.014, 14, { rows: 8, mat: MAT.BLACK }),
      [HD], 'eye', M4.compose(m, c, 0, [1, 1, 1], 0, 0));
    K.eyes.push({ v0, v1: g.vcount, cy: c[1] });
    konPart(K, ellipsoid(0.0062, 0.0062, 0.0052, 8, { rows: 5, mat: MAT.BLACK }),
      [HD], 'spark', M4.compose(m, [c[0] + sx * 0.005, c[1] + 0.007, c[2] + 0.010], 0, [1, 1, 1]));
    /* 眉の点。柴犬や狐にある斑で、これがあると表情が出る。 */
    konPart(K, ellipsoid(0.011, 0.006, 0.009, 10, { rows: 6, mat: M }),
      [HD], 'brow', M4.compose(m, onHead([sx * 0.46, 0.62, 0.74], 0.079), 0, [1, 1, 1]));
  }

  /* 耳。大きく立てる。外は毛、先は黒、内は薄桃。 */
  for (const sx of [-1, 1]) {
    konPart(K, loft([
      { p: [sx * 0.043, 0.474, 0.320], rx: 0.036, ry: 0.023 },
      { p: [sx * 0.050, 0.518, 0.314], rx: 0.032, ry: 0.020 },
      { p: [sx * 0.058, 0.566, 0.306], rx: 0.022, ry: 0.014 },
      { p: [sx * 0.064, 0.608, 0.300], rx: 0.006, ry: 0.004 },
    ], 12, { mat: M, uScale: 1, vScale: 2, up: [0, 0, 1] }),
      [sx > 0 ? KB.earL : KB.earR, HD], 'ear');
    konPart(K, loft([
      { p: [sx * 0.045, 0.484, 0.334], rx: 0.026, ry: 0.007 },
      { p: [sx * 0.052, 0.524, 0.328], rx: 0.022, ry: 0.006 },
      { p: [sx * 0.059, 0.568, 0.320], rx: 0.013, ry: 0.004 },
      { p: [sx * 0.064, 0.602, 0.314], rx: 0.004, ry: 0.002 },
    ], 10, { mat: M, uScale: 1, vScale: 2, up: [0, 0, 1] }),
      [sx > 0 ? KB.earL : KB.earR, HD], 'earin');
  }

  /* 脚。曲げたバインドのまま2節を通す。後脚は腿を太らせる。 */
  for (const L of KON_LEGS) {
    konPart(K, konLimb(L.hip, L.knee, L.front ? 0.037 : 0.050, L.front ? 0.026 : 0.027, M),
      [L.u, L.d], 'leg');
    konPart(K, ellipsoid(0.027, 0.027, 0.027, 12, { rows: 7, mat: M }),
      [L.d, L.u], 'leg', M4.compose(m, L.knee, 0, [1, 1, 1]));
    konPart(K, konLimb(L.knee, L.foot, 0.026, 0.019, M), [L.d, L.u], 'leg');
    konPart(K, ellipsoid(0.025, 0.018, 0.030, 12, { rows: 7, mat: M }),
      [L.d], 'paw', M4.compose(m, [L.foot[0], L.foot[1] + 0.008, L.foot[2] + 0.012], 0, [1, 1, 1]));
  }

  /* 尾。太く、後ろへ持ち上がる。先は白。 */
  konPart(K, loft([
    { p: [0, 0.310, -0.108], rx: 0.040, ry: 0.044 },
    { p: [0, 0.334, -0.158], rx: 0.062, ry: 0.065 },
    { p: [0, 0.372, -0.202], rx: 0.071, ry: 0.072 },
    { p: [0, 0.416, -0.238], rx: 0.065, ry: 0.065 },
    { p: [0, 0.456, -0.266], rx: 0.046, ry: 0.046 },
    { p: [0, 0.482, -0.288], rx: 0.018, ry: 0.018 },
  ], 16, { mat: M, uScale: 1, vScale: 1.6, up: [0, 1, 0] }), TAIL, 'tail');

  /* 前掛けと鈴。首もとに赤が一点あるだけで、遠くからでも「稲荷の狐」に
     見える。鈴は、この作品でいちばんよく鳴る音の出どころでもある。 */
  konPart(K, loft([
    { p: [0, 0.322, 0.194], rx: 0.086, ry: 0.092 },
    { p: [0, 0.330, 0.222], rx: 0.079, ry: 0.085 },
    { p: [0, 0.344, 0.246], rx: 0.070, ry: 0.075 },
    { p: [0, 0.358, 0.266], rx: 0.060, ry: 0.064 },
  ], 18, { mat: MAT.LINEN, uScale: 1, vScale: 2, up: [0, 1, 0], capStart: false, capEnd: false }),
    [NK, CH], 'bib');
  konPart(K, ellipsoid(0.017, 0.017, 0.017, 12, { rows: 7, mat: MAT.BRONZE }),
    [CH, NK], 'bell', M4.compose(m, [0, 0.254, 0.240], 0, [1, 1, 1]));

  konSkin(K);
  konColour(K);
  /* まばたきは目玉をバインド姿勢のうちに潰してから骨に通す。骨を足すより
     安く、瞼を作らずに済む（狐に瞼を作ると、まず十中八九ぶきみになる）。 */
  K.eyeFlag = new Uint8Array(g.vcount);
  K.eyeCy = new Float32Array(g.vcount);
  for (const e of K.eyes) for (let v = e.v0; v < e.v1; v++) { K.eyeFlag[v] = 1; K.eyeCy[v] = e.cy; }
  return K;
}

/* --- 重み配り ---
   部位ごとに許した骨のうち、線分までの距離が近い3本を採る。距離の -3 乗で
   重み付けすると、骨の近くではその骨に張り付き、関節では滑らかに混ざる。 */
function konSkin(K) {
  const nv = K.geo.vcount;
  K.bi = new Float32Array(nv * 3);
  K.bw = new Float32Array(nv * 3);
  const segs = KON_BONES.map((b, i) => {
    const a = b[2];
    let e = KON_TIPS[b[0]];
    if (!e) {
      const kids = KON_BONES.filter(c => c[1] === i);
      e = kids.length
        ? kids.reduce((s, c) => [s[0] + c[2][0] / kids.length, s[1] + c[2][1] / kids.length,
        s[2] + c[2][2] / kids.length], [0, 0, 0])
        : [a[0], a[1] - 0.1, a[2]];
    }
    return [a, e];
  });
  const distSeg = (p, s) => {
    const ax = s[0][0], ay = s[0][1], az = s[0][2];
    const bx = s[1][0] - ax, by = s[1][1] - ay, bz = s[1][2] - az;
    const ll = bx * bx + by * by + bz * bz || 1e-9;
    let u = ((p[0] - ax) * bx + (p[1] - ay) * by + (p[2] - az) * bz) / ll;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    return Math.hypot(p[0] - ax - bx * u, p[1] - ay - by * u, p[2] - az - bz * u);
  };
  for (const part of K.parts) {
    for (let v = part.v0; v < part.v1; v++) {
      const p = [K.geo.p[v * 3], K.geo.p[v * 3 + 1], K.geo.p[v * 3 + 2]];
      const cand = part.bones.map(b => ({ b, w: 1 / Math.pow(Math.max(distSeg(p, segs[b]), 0.012), 3) }));
      cand.sort((a, b) => b.w - a.w);
      const take = cand.slice(0, 3);
      let s = 0; for (const c of take) s += c.w;
      for (let k = 0; k < 3; k++) {
        K.bi[v * 3 + k] = take[k] ? take[k].b : take[0].b;
        K.bw[v * 3 + k] = take[k] ? take[k].w / s : 0;
      }
    }
  }
}

/* --- 色を頂点に置く ---
   世界の材質は風化と汚しが乗る（石や木のための処理）。それを生き物に掛けると
   泥をかぶった狐になるので、色だけこちらで持ち、材質からは粗さと法線だけ貰う。 */
function konColour(K) {
  const nv = K.geo.vcount;
  K.col = new Float32Array(nv * 3);
  const put = (v, c) => { K.col[v * 3] = c[0]; K.col[v * 3 + 1] = c[1]; K.col[v * 3 + 2] = c[2]; };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const C = KON_COL;
  for (const part of K.parts) {
    for (let v = part.v0; v < part.v1; v++) {
      const x = K.geo.p[v * 3], y = K.geo.p[v * 3 + 1], z = K.geo.p[v * 3 + 2];
      let c = C.fur;
      switch (part.colour) {
        case 'body':
          /* 腹は白。境目は側面でぼかす。 */
          c = mix(C.fur, C.belly, smoothstep(0.272, 0.234, y - Math.abs(x) * 0.45));
          break;
        case 'head':
          c = mix(C.fur, C.belly, smoothstep(0.428, 0.400, y - Math.abs(x) * 0.30));
          break;
        case 'muzzle': c = C.belly; break;
        case 'brow': c = C.belly; break;
        case 'nose': c = C.nose; break;
        case 'eye': c = C.eye; break;
        case 'spark': c = C.spark; break;
        case 'ear': c = mix(C.fur, C.sock, smoothstep(0.545, 0.600, y)); break;
        case 'earin': c = C.pink; break;
        case 'leg': c = mix(C.fur, C.sock, smoothstep(0.108, 0.052, y)); break;
        case 'paw': c = C.sock; break;
        case 'tail': c = mix(C.fur, C.belly, smoothstep(-0.208, -0.262, z)); break;
        case 'bib': c = C.bib; break;
        case 'bell': c = C.bell; break;
      }
      put(v, c);
    }
  }
}

/* =========================================================================
   姿勢
   ========================================================================= */
const KON = {
  ready: false, mesh: null, draw: null, K: null,
  pos: [0, 0, 0], yaw: 0, vel: [0, 0], spd: 0, gy: 0,
  phase: 0, sit: 0, sitWant: 0, still: 0, jumpY: 0, vy: 0,
  wag: 0, blink: 0, blinkNext: 2, earFlick: 0, earNext: 3,
  lookYaw: 0, lookPitch: 0, headYaw: 0, headPitch: 0,
  turn: 0, prevYaw: 0, tailY: [0, 0, 0], tailV: [0, 0, 0],
  cheer: 0, sayT: -99, sayText: '', sayKey: '', sayHold: 2.6,
  m: null, pose: null, bind: null, skinP: null, skinN: null, euler: null,
  rootOff: [0, 0, 0], blinkT: 0, earSide: 0, sitSide: 1, tPrev: undefined,
};

function initKon() {
  if (KON.ready) return;
  const K = buildKon();
  KON.K = K;
  KON.mesh = new Mesh(K.geo, { dynamic: true });
  /* 頂点色は 12 番。Mesh は 0〜3 番しか作らないので、ここで足す。
     VAO ごとの状態なので、他の描画には漏れない。 */
  gl.bindVertexArray(KON.mesh.vao);
  const cb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cb);
  gl.bufferData(gl.ARRAY_BUFFER, K.col, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(12);
  gl.vertexAttribPointer(12, 3, gl.FLOAT, false, 12, 0);
  gl.bindVertexArray(null);

  const nb = KON_BONES.length, nv = K.geo.vcount;
  KON.pose = []; KON.bind = [];
  for (let i = 0; i < nb; i++) { KON.pose.push(M4.create()); KON.bind.push(KON_BONES[i][2]); }
  KON.euler = KON_BONES.map(() => [0, 0, 0]);
  KON.skinP = new Float32Array(nv * 3);
  KON.skinN = new Float32Array(nv * 3);
  KON.m = M4.create();
  KON.foot = KON_LEGS.map(L => L.home.slice());

  KON.draw = { mesh: KON.mesh, name: 'kon', vcol: 1 };
  R.scene.draws.push(KON.draw);
  R.scene.shadowDraws.push({ mesh: KON.mesh });
  if (R.baseDraws) R.baseDraws.push(KON.draw);
  if (R.shadowBase) R.shadowBase.push({ mesh: KON.mesh });
  KON.mesh.setInstances([{ m: KON.m, tint: [1, 1, 1, 0] }]);
  konPlaceInitial();
  KON.ready = true;
}

function konAnchor() {
  /* プレイヤーが読み込まれていなければカメラの足元を主人公と見なす。 */
  if (typeof PLAY !== 'undefined' && PLAY.ready) return [PLAY.pos[0], PLAY.pos[1], PLAY.pos[2]];
  return [CAM.pos[0], CAM.pos[1] - CFG.eyeHeight, CAM.pos[2]];
}

function konPlaceInitial() {
  const a = konAnchor();
  KON.pos[0] = a[0] + 1.1; KON.pos[2] = a[2] + 1.4;
  KON.pos[1] = WORLD.groundAt(KON.pos[0], KON.pos[2]).y;
}

/* 骨を組む。親 → T(骨の差分) → R(オイラー)。バインドは無回転なので、
   スキン行列は pose * T(-bind) で済み、逆行列を持たなくてよい。 */
function konBuildPose() {
  const tmp = M4.create();
  for (let i = 0; i < KON_BONES.length; i++) {
    const par = KON_BONES[i][1];
    const e = KON.euler[i];
    let ox, oy, oz;
    if (par < 0) {
      ox = KON.bind[i][0] + KON.rootOff[0];
      oy = KON.bind[i][1] + KON.rootOff[1];
      oz = KON.bind[i][2] + KON.rootOff[2];
      M4.compose(KON.pose[i], [ox, oy, oz], e[1], [1, 1, 1], e[0], e[2]);
    } else {
      ox = KON.bind[i][0] - KON.bind[par][0];
      oy = KON.bind[i][1] - KON.bind[par][1];
      oz = KON.bind[i][2] - KON.bind[par][2];
      M4.compose(tmp, [ox, oy, oz], e[1], [1, 1, 1], e[0], e[2]);
      M4.mul(KON.pose[i], KON.pose[par], tmp);
    }
  }
}

function konSkinMesh() {
  const K = KON.K, nv = K.geo.vcount;
  const P = K.geo.p, N = K.geo.n, bi = K.bi, bw = K.bw;
  const oP = KON.skinP, oN = KON.skinN, pose = KON.pose, bind = KON.bind;
  const blink = KON.blink, eyeF = K.eyeFlag, eyeC = K.eyeCy;
  for (let v = 0; v < nv; v++) {
    const px = P[v * 3], pz = P[v * 3 + 2];
    let py = P[v * 3 + 1];
    if (blink > 0.001 && eyeF[v]) py = eyeC[v] + (py - eyeC[v]) * (1 - blink * 0.94);
    const nx0 = N[v * 3], ny0 = N[v * 3 + 1], nz0 = N[v * 3 + 2];
    let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
    for (let k = 0; k < 3; k++) {
      const w = bw[v * 3 + k];
      if (w <= 0) continue;
      const b = bi[v * 3 + k] | 0, M = pose[b], B = bind[b];
      const lx = px - B[0], ly = py - B[1], lz = pz - B[2];
      ax += w * (M[0] * lx + M[4] * ly + M[8] * lz + M[12]);
      ay += w * (M[1] * lx + M[5] * ly + M[9] * lz + M[13]);
      az += w * (M[2] * lx + M[6] * ly + M[10] * lz + M[14]);
      bx += w * (M[0] * nx0 + M[4] * ny0 + M[8] * nz0);
      by += w * (M[1] * nx0 + M[5] * ny0 + M[9] * nz0);
      bz += w * (M[2] * nx0 + M[6] * ny0 + M[10] * nz0);
    }
    oP[v * 3] = ax; oP[v * 3 + 1] = ay; oP[v * 3 + 2] = az;
    const l = 1 / (Math.hypot(bx, by, bz) || 1);
    oN[v * 3] = bx * l; oN[v * 3 + 1] = by * l; oN[v * 3 + 2] = bz * l;
  }
  KON.mesh.updateVerts(oP, oN);
}

/* 2骨のIK。すべて局所空間（狐の足もと原点、前が +Z）で解く。
   足の**接地点**を先に決めてから脚を通す。関節角を直接振ると、走るたびに
   足が地面を滑って、いくら胴を揺らしても走っているように見えない。 */
function konLegIK(L, target) {
  const par = KON_BONES[L.u][1];
  const Mp = KON.pose[par];
  const hu = KON.bind[L.u], hp = KON.bind[par];
  /* 親の姿勢が乗った股関節の位置 */
  const ox = hu[0] - hp[0], oy = hu[1] - hp[1], oz = hu[2] - hp[2];
  const hx = Mp[0] * ox + Mp[4] * oy + Mp[8] * oz + Mp[12];
  const hy = Mp[1] * ox + Mp[5] * oy + Mp[9] * oz + Mp[13];
  const hz = Mp[2] * ox + Mp[6] * oy + Mp[10] * oz + Mp[14];
  /* 目標を親の回転系へ持ち込む（親は剛体なので転置でよい） */
  const dx = target[0] - hx, dy = target[1] - hy, dz = target[2] - hz;
  const ly = Mp[1] * dx + Mp[5] * dy + Mp[9] * dz;
  const lz = Mp[2] * dx + Mp[6] * dy + Mp[10] * dz;
  const l1 = L.l1, l2 = L.l2;
  let r = Math.hypot(ly, lz);
  r = clamp(r, Math.abs(l1 - l2) + 0.012, (l1 + l2) * 0.994);
  const a = Math.atan2(-lz, -ly);
  const s = L.front ? 1 : -1;      // 前脚は肘が後ろ、後脚は膝が前
  const alpha = Math.acos(clamp((l1 * l1 + r * r - l2 * l2) / (2 * l1 * r), -1, 1));
  const beta = Math.acos(clamp((l2 * l2 + r * r - l1 * l1) / (2 * l2 * r), -1, 1));
  /* 解いた絶対角から、バインドの絶対角を引いたものがオイラー角。
     バインドが曲がっているので、この引き算を省くと脚が一段折れる。 */
  const eU = (a + s * alpha) - L.a0U;
  const eD = (a - s * beta) - L.a0D;
  KON.euler[L.u][0] = eU;
  KON.euler[L.u][1] = 0; KON.euler[L.u][2] = 0;
  KON.euler[L.d][0] = eD - eU;
  KON.euler[L.d][1] = 0; KON.euler[L.d][2] = 0;
}

/* =========================================================================
   毎フレーム
   ========================================================================= */
function konSay(text, key, hold) {
  if (key && KON.sayKey === key && R.time - KON.sayT < 6) return;
  KON.sayText = text; KON.sayKey = key || ''; KON.sayT = R.time;
  KON.sayHold = hold || 2.6;
}

/* 参道の中心線に沿って「少し先」を取る。分岐区間では横位置もそのまま
   持ち越すので、第2の参道に入れば狐もそちらへ行く。 */
function konLeadTarget(g, ahead, side) {
  const t = clamp(g.t + ahead, 1.0, PATH_LEN - 1);
  const P = pathPos(t), Rt = pathRight(t);
  const s = clamp(g.s + side, -CFG.corridorHalf * 0.72,
    (typeof branchOffsetAt === 'function' ? branchOffsetAt(t) : 0) + CFG.corridorHalf * 0.72);
  return [P[0] + Rt[0] * s, 0, P[2] + Rt[2] * s];
}

function updateKon(dt) {
  if (!KON.ready) return;
  dt = Math.min(dt, 0.05);
  const a = konAnchor();
  const pspd = Math.hypot(CAM.vel[0], CAM.vel[2]);

  /* 検証用の固定。位置・向き・速さを外から与えて、歩容だけを回す。
     寄ると逃げていくのでは、姿を確かめようがない。 */
  if (KON.pin) {
    KON.pos[0] = KON.pin[0]; KON.gy = KON.pin[1]; KON.pos[2] = KON.pin[2];
    KON.yaw = KON.pin[3] || 0;
    KON.spd = KON.pin[4] === undefined ? 0 : KON.pin[4];
    KON.vel[0] = KON.vel[1] = KON.turn = 0;
    KON.sit = KON.pin[5] || 0;
    return konPoseAndDraw(dt, a);
  }

  /* --- どこへ行くか --- */
  const g = WORLD.groundAt(a[0], a[2]);
  let tgt;
  const moving = pspd > 1.0;
  if (moving && g.t !== undefined && g.t > 2 && g.t < PATH_LEN - 2) {
    /* 走っているときは前に出る。速いほど遠くへ。行ったり来たりの
       蛇行を少し混ぜると、置物ではなく生き物に見える。 */
    const dir = (KON.tPrev !== undefined && g.t < KON.tPrev - 0.001) ? -1 : 1;
    KON.tPrev = g.t;
    const ahead = dir * (2.4 + pspd * 0.62);
    tgt = konLeadTarget(g, ahead, Math.sin(R.time * 0.62) * 0.85);
  } else {
    KON.tPrev = g.t;
    /* 止まっていれば、横に来て座る。 */
    const fy = KON.sitSide;
    const c = Math.cos(CAM.yaw), s2 = Math.sin(CAM.yaw);
    tgt = [a[0] + c * 0.85 * fy + s2 * 0.55, 0, a[2] + s2 * 0.85 * fy - c * 0.55];
  }

  /* 遠すぎたら追いつけないので、後ろから出し直す。 */
  const far = Math.hypot(KON.pos[0] - a[0], KON.pos[2] - a[2]);
  if (far > 26) {
    KON.pos[0] = a[0] - CAM.vel[0] * 0.25 + 0.8;
    KON.pos[2] = a[2] - CAM.vel[2] * 0.25 + 0.8;
    konSay('まってー！', 'lost');
  }

  /* --- 進む --- */
  const dx = tgt[0] - KON.pos[0], dz = tgt[2] - KON.pos[2];
  const d = Math.hypot(dx, dz);
  const maxSpd = Math.max(pspd * 1.55 + 0.6, 2.4);
  const want = d < 0.22 ? 0 : Math.min(d * 3.0, maxSpd);
  const wx = d > 1e-4 ? dx / d * want : 0, wz = d > 1e-4 ? dz / d * want : 0;
  const k = Math.min(1, dt * 5.0);
  KON.vel[0] += (wx - KON.vel[0]) * k;
  KON.vel[1] += (wz - KON.vel[1]) * k;
  KON.pos[0] += KON.vel[0] * dt;
  KON.pos[2] += KON.vel[1] * dt;
  KON.spd += (Math.hypot(KON.vel[0], KON.vel[1]) - KON.spd) * Math.min(1, dt * 8);

  const gk = WORLD.groundAt(KON.pos[0], KON.pos[2]);
  KON.gy += (gk.y - KON.gy) * Math.min(1, dt * 14);
  if (Math.abs(gk.y - KON.gy) > 2) KON.gy = gk.y;

  /* 跳ねる（はしゃぐとき） */
  if (KON.jumpY > 0 || KON.vy > 0) {
    KON.vy -= 15.0 * dt;
    KON.jumpY += KON.vy * dt;
    if (KON.jumpY <= 0) { KON.jumpY = 0; KON.vy = 0; }
  }
  if (KON.cheer > 0) {
    KON.cheer -= dt;
    if (KON.jumpY === 0 && KON.cheer > 0.35) { KON.vy = 3.1; KON.jumpY = 0.001; }
  }

  /* --- 向き --- */
  let wantYaw = KON.yaw;
  if (KON.spd > 0.35) wantYaw = Math.atan2(KON.vel[0], KON.vel[1]);
  else wantYaw = Math.atan2(a[0] - KON.pos[0], a[2] - KON.pos[2]);
  let dyw = wantYaw - KON.yaw;
  while (dyw > PI) dyw -= TAU; while (dyw < -PI) dyw += TAU;
  const turn = dyw * Math.min(1, dt * 7);
  KON.yaw += turn;
  KON.turn += (clamp(turn / Math.max(dt, 1e-3), -5, 5) - KON.turn) * Math.min(1, dt * 6);

  /* --- 座る／立つ --- */
  KON.still = pspd < 0.4 ? KON.still + dt : 0;
  KON.sitWant = (KON.still > 2.0 && KON.spd < 0.35 && KON.cheer <= 0) ? 1 : 0;
  KON.sit += (KON.sitWant - KON.sit) * Math.min(1, dt * (KON.sitWant ? 3.2 : 9));

  return konPoseAndDraw(dt, a);
}

/* 位置と速さが決まったあとの、姿勢づくりと描き込み。 */
function konPoseAndDraw(dt, a) {
  /* --- 歩容 --- */
  const sn = clamp(KON.spd / 7.0, 0, 1);
  const stride = 0.30 + sn * 0.34;
  const freq = KON.spd > 0.25 ? clamp(KON.spd / stride * 0.5, 0.6, 4.2) : 0;
  KON.phase = (KON.phase + freq * dt) % 1;
  const amp = smoothstep(0.15, 1.2, KON.spd) * (1 - KON.sit);
  const lift = (0.045 + sn * 0.055) * amp;
  const duty = 0.56;
  const ph = KON.phase;

  /* 胴。跳ねと、背のうねり。走る獣は背骨で走る。 */
  const bnd = Math.sin(ph * TAU) * amp;
  const bnd2 = Math.sin(ph * TAU + 1.1) * amp;
  KON.rootOff[0] = 0;
  KON.rootOff[1] = (0.011 + sn * 0.026) * bnd + KON.jumpY - KON.sit * 0.155;
  KON.rootOff[2] = 0;
  KON.euler[KB.root][0] = -0.05 * sn + 0.09 * bnd - KON.sit * 0.48;
  KON.euler[KB.root][1] = 0;
  KON.euler[KB.root][2] = clamp(-KON.turn * 0.022, -0.10, 0.10);
  KON.euler[KB.spine][0] = -0.13 * bnd2 - KON.sit * 0.06;
  KON.euler[KB.spine][2] = clamp(-KON.turn * 0.014, -0.07, 0.07);
  KON.euler[KB.chest][0] = -0.10 * bnd2 - KON.sit * 0.04;
  KON.euler[KB.chest][2] = clamp(-KON.turn * 0.010, -0.05, 0.05);

  /* 首と頭。走っているときは進む先を、止まっているときは主人公を見る。 */
  const hx = a[0] - KON.pos[0], hz = a[2] - KON.pos[2];
  const hy = (a[1] + 1.25) - (KON.gy + 0.55);
  let ly = Math.atan2(hx, hz) - KON.yaw;
  while (ly > PI) ly -= TAU; while (ly < -PI) ly += TAU;
  const lp = Math.atan2(hy, Math.max(Math.hypot(hx, hz), 0.2));
  const look = 1 - smoothstep(1.2, 3.4, KON.spd);
  KON.headYaw += (clamp(ly, -1.15, 1.15) * look - KON.headYaw) * Math.min(1, dt * 5);
  KON.headPitch += (clamp(lp, -0.5, 0.65) * look - KON.headPitch) * Math.min(1, dt * 5);
  KON.euler[KB.neck][0] = 0.03 + 0.10 * sn - KON.headPitch * 0.35 + KON.sit * 0.22;
  KON.euler[KB.neck][1] = KON.headYaw * 0.40;
  KON.euler[KB.head][0] = -0.02 - KON.headPitch * 0.55 + 0.05 * bnd + KON.sit * 0.10;
  KON.euler[KB.head][1] = KON.headYaw * 0.60;
  KON.euler[KB.head][2] = clamp(-KON.turn * 0.018, -0.09, 0.09);

  /* 耳。速いと寝る。ときどき片方だけぴくりと動かす。 */
  KON.earNext -= dt;
  if (KON.earNext < 0) { KON.earFlick = 0.35; KON.earNext = 1.6 + Math.random() * 4.0; KON.earSide = Math.random() < 0.5 ? 0 : 1; }
  if (KON.earFlick > 0) KON.earFlick -= dt;
  const fl = KON.earFlick > 0 ? Math.sin(clamp(KON.earFlick / 0.35, 0, 1) * PI) : 0;
  for (let i = 0; i < 2; i++) {
    const b = i === 0 ? KB.earL : KB.earR, sx = i === 0 ? 1 : -1;
    KON.euler[b][0] = -0.06 + 0.34 * sn - (KON.sit * 0.10) + (KON.earSide === i ? fl * 0.55 : 0);
    KON.euler[b][2] = sx * (0.16 + 0.10 * sn + (KON.earSide === i ? fl * 0.30 : 0));
  }

  /* 尾。ばね。振り向きと上下動に遅れて付いてきて、機嫌がよいと振る。 */
  KON.wag += ((KON.cheer > 0 ? 1 : (KON.sit > 0.5 ? 0.45 : 0.18)) - KON.wag) * Math.min(1, dt * 4);
  const wagA = KON.wag * (0.16 + 0.34 * (KON.cheer > 0 ? 1 : 0));
  const wagS = Math.sin(R.time * (KON.cheer > 0 ? 15 : 7.5)) * wagA;
  for (let i = 0; i < 3; i++) {
    const b = [KB.tail1, KB.tail2, KB.tail3][i];
    const drive = -KON.turn * (0.030 + i * 0.012) + wagS * (0.6 + i * 0.25);
    KON.tailV[i] += (drive - KON.tailY[i]) * 60 * dt - KON.tailV[i] * 9 * dt;
    KON.tailY[i] += KON.tailV[i] * dt;
    KON.euler[b][1] = clamp(KON.tailY[i], -0.42, 0.42);
    KON.euler[b][0] = (i === 0 ? 0.06 : 0.04) - 0.12 * bnd * (i + 1) * 0.4
      + KON.sit * (i === 0 ? 0.64 : (i === 1 ? 0.16 : 0.08));
  }

  /* まばたき */
  KON.blinkNext -= dt;
  if (KON.blinkNext < 0) { KON.blinkT = 0.15; KON.blinkNext = 2.0 + Math.random() * 4.0; }
  if (KON.blinkT > 0) { KON.blinkT -= dt; KON.blink = Math.sin(clamp(KON.blinkT / 0.15, 0, 1) * PI); }
  else KON.blink = 0;

  konBuildPose();

  /* --- 足を地面に置いてから、脚を通す --- */
  const cy = Math.cos(KON.yaw), sy = Math.sin(KON.yaw);
  for (let i = 0; i < KON_LEGS.length; i++) {
    const L = KON_LEGS[i], H = L.home;
    let u = (ph + L.ph) % 1, fz = H[2], fy = H[1];
    if (amp > 0.001) {
      if (u < duty) { fz = H[2] + stride * (0.5 - u / duty) * amp; }
      else {
        const s2 = (u - duty) / (1 - duty);
        fz = H[2] + stride * (-0.5 + s2) * amp;
        fy = H[1] + lift * Math.sin(PI * s2);
      }
    }
    /* 座る。後脚を体の下へ畳み、前脚は肩の真下へ引き寄せる。 */
    if (KON.sit > 0.01) {
      if (L.front) fz = lerp(fz, H[2] - 0.020, KON.sit);
      else { fz = lerp(fz, H[2] + 0.105, KON.sit); fy = lerp(fy, H[1] + 0.030, KON.sit); }
    }
    /* 世界の地面を拾って上下だけ合わせる。斜面で足が浮かない。 */
    const wx = KON.pos[0] + (cy * H[0] + sy * fz);
    const wz = KON.pos[2] + (-sy * H[0] + cy * fz);
    const gyf = WORLD.groundAt(wx, wz).y;
    const rel = clamp(gyf - KON.gy, -0.18, 0.18);
    KON.foot[i][0] = H[0]; KON.foot[i][1] = fy + rel * (1 - KON.sit) - KON.jumpY;
    KON.foot[i][2] = fz;
    konLegIK(L, KON.foot[i]);
  }
  konBuildPose();     // 脚の角度を入れて組み直す
  konSkinMesh();

  M4.compose(KON.m, [KON.pos[0], KON.gy, KON.pos[2]], KON.yaw, [1, 1, 1]);
  KON.mesh.updateInstances([{ m: KON.m, tint: [1, 1, 1, 0] }]);
  konBubble();
}

/* --- ふきだし --- */
function konBubble() {
  const el = document.getElementById('konSay');
  if (!el) return;
  const age = R.time - KON.sayT;
  if (!KON.sayText || age > KON.sayHold) { el.style.opacity = '0'; return; }
  /* 頭の骨の原点（狐の局所座標）を世界へ持ち上げる。 */
  const M = KON.pose[KB.head];
  const hx = M[12], hy = M[13] + 0.20, hz = M[14];
  const cy = Math.cos(KON.yaw), sy = Math.sin(KON.yaw);
  const wx = KON.pos[0] + (cy * hx + sy * hz);
  const wy = KON.gy + hy;
  const wz = KON.pos[2] + (-sy * hx + cy * hz);
  const V = CAM.viewProj;
  const cw = V[3] * wx + V[7] * wy + V[11] * wz + V[15];
  if (cw < 0.08) { el.style.opacity = '0'; return; }
  const cx = (V[0] * wx + V[4] * wy + V[8] * wz + V[12]) / cw;
  const cyy = (V[1] * wx + V[5] * wy + V[9] * wz + V[13]) / cw;
  if (cx < -1.35 || cx > 1.35 || cyy < -1.35 || cyy > 1.35) { el.style.opacity = '0'; return; }
  const sx = (cx * 0.5 + 0.5) * innerWidth, sy2 = (0.5 - cyy * 0.5) * innerHeight;
  el.textContent = KON.sayText;
  el.style.left = sx.toFixed(0) + 'px';
  el.style.top = sy2.toFixed(0) + 'px';
  const fade = Math.min(1, age * 7) * (1 - smoothstep(KON.sayHold - 0.45, KON.sayHold, age));
  el.style.opacity = fade.toFixed(3);
  el.style.transform = 'translate(-50%,-100%) scale(' + (0.86 + Math.min(1, age * 9) * 0.14).toFixed(3) + ')';
}
