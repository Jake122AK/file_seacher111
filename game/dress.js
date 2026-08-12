/* ==== g_dress.js ====
   落としてきた .glb を「着せて」から出す。

   このモデルには UV も頂点色も材質も入っていない（POSITION / NORMAL /
   JOINTS_0 / WEIGHTS_0 と表情のモーフだけ）。だから今までは全頂点を
   MAT.LINEN 一色で描いていて、粘土の人形にしかならなかった。

   材質が無いなら、形から決める。この関数は読み込み時に一度だけ走り、

     1. 三角形の連結で成分に分ける（このモデルは 1,412 成分ある）
     2. 頭骨の輪郭を実測する（角度32 × 高さ26 の最大半径）
     3. 輪郭より外にある頭付きの成分＝髪の房 → 三角形を落とす
        （1,395 成分・29,754 頂点。全体の 66% が髪だった）
     4. その輪郭に沿わせてボブを生成する
     5. 体の頂点を高さと骨で区分けし、白衣・緋袴・肌の材質を割り当てる
     6. 袴（スカート）を別メッシュで生成して脚を隠す

   生成した頂点の骨は、髪は head に 100%、袴は hips と thigh を高さで
   混ぜる。元の頂点は一つも消さないので（落とすのは三角形だけ）、
   表情モーフの頂点番号はそのまま生きる。 */

const DRESS = {
  hairMat: MAT.BLACK,      // 髪。黒漆の材質が黒髪に近い
  robeMat: MAT.PLASTER,    // 白衣。SILK は官服の紺なので白くならない
  hakamaMat: MAT.VERMILLION, // 緋袴。鳥居と同じ朱
  skinMat: MAT.LINEN,      // 肌。世界と同じ PBR 側に置く（トゥーンだと浮く）
  robeInflate: 0.013,      // 布の厚み。体の凹凸を布で均す
};

function dressCharacter(pos, nrm, idx, bi, bw, NV, jointNames) {
  const NT = idx.length / 3;
  const dom = i => bi[i * 4];              // いちばん重い骨（GLB は重み順）
  const headJ = Math.max(0, jointNames.indexOf('head'));
  const hipsJ = Math.max(0, jointNames.indexOf('hips'));
  const thighL = Math.max(0, jointNames.indexOf('thighL'));
  const thighR = Math.max(0, jointNames.indexOf('thighR'));

  /* ---- 1. 連結成分 ---- */
  const par = new Int32Array(NV);
  for (let i = 0; i < NV; i++) par[i] = i;
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) par[rb] = ra; };
  for (let t = 0; t < NT; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    uni(a, b); uni(b, c);
  }
  const cnt = new Map();
  for (let i = 0; i < NV; i++) {
    const r = find(i);
    cnt.set(r, (cnt.get(r) || 0) + 1);
  }
  let bodyRoot = -1, bodyN = -1;
  for (const [r, n] of cnt) if (n > bodyN) { bodyN = n; bodyRoot = r; }

  /* ---- 2. 頭骨の輪郭（体の成分だけから測る） ---- */
  const NA = 32, NB = 26, Y0 = 1.28, Y1 = 1.66;
  const prof = new Float32Array(NA * NB);
  let headCX = 0, headCZ = 0, headN = 0;
  const headBones = new Set([headJ, Math.max(0, jointNames.indexOf('neck'))]);
  for (let i = 0; i < NV; i++) {
    if (find(i) !== bodyRoot || !headBones.has(dom(i))) continue;
    const y = pos[i * 3 + 1];
    if (y < Y0 || y > Y1) continue;
    headCX += pos[i * 3]; headCZ += pos[i * 3 + 2]; headN++;
  }
  if (headN) { headCX /= headN; headCZ /= headN; }
  for (let i = 0; i < NV; i++) {
    if (find(i) !== bodyRoot || !headBones.has(dom(i))) continue;
    const y = pos[i * 3 + 1];
    if (y < Y0 || y > Y1) continue;
    const dx = pos[i * 3] - headCX, dz = pos[i * 3 + 2] - headCZ;
    const r = Math.hypot(dx, dz);
    let a = Math.floor((Math.atan2(dz, dx) / TAU + 1.0) * NA) % NA;
    const b = Math.min(NB - 1, Math.max(0, Math.floor((y - Y0) / (Y1 - Y0) * NB)));
    const k = a * NB + b;
    if (r > prof[k]) prof[k] = r;
  }
  /* 空のマスの埋め方。単純に近傍から持ってくると、頭頂より上のマス（頂点が
     無い）が下の太い値で埋まり、輪郭が円柱になる。実際それでボブが茸のように
     なった。データのある一番上のマスから上は、球で絞る。 */
  for (let a = 0; a < NA; a++) {
    let bTop = -1;
    for (let b = NB - 1; b >= 0; b--) if (prof[a * NB + b] > 0) { bTop = b; break; }
    let bBot = -1;
    for (let b = 0; b < NB; b++) if (prof[a * NB + b] > 0) { bBot = b; break; }
    if (bTop < 0) { for (let b = 0; b < NB; b++) prof[a * NB + b] = 0.10; continue; }
    const rTop = prof[a * NB + bTop];
    const cap = 4.0;                       // 何マスで 0 に絞るか
    for (let b = bTop + 1; b < NB; b++) {
      const u = Math.min(1, (b - bTop) / cap);
      prof[a * NB + b] = rTop * Math.sqrt(Math.max(0, 1 - u * u)) + 0.004;
    }
    for (let b = 0; b < bBot; b++) prof[a * NB + b] = prof[a * NB + bBot];
    for (let b = bBot; b <= bTop; b++)     // 途中の穴は上下で補間
      if (prof[a * NB + b] === 0) {
        let lo = b, hi = b;
        while (lo > bBot && prof[a * NB + lo] === 0) lo--;
        while (hi < bTop && prof[a * NB + hi] === 0) hi++;
        prof[a * NB + b] = lerp(prof[a * NB + lo], prof[a * NB + hi],
                                (b - lo) / Math.max(1, hi - lo));
      }
  }
  const profAt = (ang, y) => {
    const fa = ((ang / TAU + 1.0) % 1.0) * NA;
    const a0 = Math.floor(fa) % NA, a1 = (a0 + 1) % NA, ta = fa - Math.floor(fa);
    const fb = clamp((y - Y0) / (Y1 - Y0) * NB, 0, NB - 1.001);
    const b0 = Math.floor(fb), b1 = Math.min(NB - 1, b0 + 1), tb = fb - b0;
    return lerp(lerp(prof[a0 * NB + b0], prof[a0 * NB + b1], tb),
                lerp(prof[a1 * NB + b0], prof[a1 * NB + b1], tb), ta);
  };

  /* ---- 3. 髪の房を落とす ---- */
  const groups = new Map();
  for (let i = 0; i < NV; i++) {
    const r = find(i);
    if (r === bodyRoot) continue;
    let g = groups.get(r);
    if (!g) { g = { n: 0, out: 0, sy: 0 }; groups.set(r, g); }
    const y = pos[i * 3 + 1];
    const dx = pos[i * 3] - headCX, dz = pos[i * 3 + 2] - headCZ;
    const rr = Math.hypot(dx, dz);
    g.n++; g.sy += y;
    if (y > 1.36 && rr > profAt(Math.atan2(dz, dx), y) * 0.93) g.out++;
  }
  const isHair = new Set();
  for (const [r, g] of groups) {
    // 頭より上にあって、頭骨の輪郭より外に出ている面が多数 → 髪
    if (g.sy / g.n > 1.38 && g.out > g.n * 0.34) isHair.add(r);
  }
  const keepTri = new Uint8Array(NT).fill(1);
  let dropped = 0, droppedV = 0;
  /* 頭骨より外に出ている面。半径だけで見ると、真上に伸びる毛（アホ毛）は
     半径が小さいので残ってしまう。頭頂より上かどうかも見る。 */
  let skullTop = 0;
  for (let i = 0; i < NV; i++)
    if (find(i) === bodyRoot && headBones.has(dom(i))) skullTop = Math.max(skullTop, pos[i * 3 + 1]);
  const outside = i => {
    const y = pos[i * 3 + 1];
    if (y > skullTop - 0.004) return true;
    if (y < 1.46) return false;
    const dx = pos[i * 3] - headCX, dz = pos[i * 3 + 2] - headCZ;
    return Math.hypot(dx, dz) > profAt(Math.atan2(dz, dx), y) * 1.10;
  };
  for (let t = 0; t < NT; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    /* 房として分かれているもの、頭骨の外へ張り出す面、そして**頭頂より
       上へ伸びる面**（アホ毛。3頂点すべてを条件にすると根元が残って
       線が1本立つ）。 */
    const top = Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1]);
    if (isHair.has(find(a)) || (outside(a) && outside(b) && outside(c))
        || top > skullTop - 0.002) {
      keepTri[t] = 0; dropped++;
    }
  }
  for (const r of isHair) droppedV += cnt.get(r) || 0;

  /* ---- 5. 体の材質分け ---- */
  const mat = new Uint8Array(NV);
  const WAIST = 0.95, HEM = 1.30, SHOULDER = 1.32, WRIST_R = 0.26;
  for (let i = 0; i < NV; i++) {
    const y = pos[i * 3 + 1], x = pos[i * 3], z = pos[i * 3 + 2];
    if (find(i) !== bodyRoot) { mat[i] = DRESS.skinMat; continue; }
    if (y > SHOULDER) { mat[i] = DRESS.skinMat; continue; }        // 首から上
    const armish = Math.abs(x) > 0.115;                            // 腕
    if (y > WAIST && y < HEM) {
      // 白衣。手首から先は肌
      mat[i] = (armish && Math.abs(x) > WRIST_R) ? DRESS.skinMat : DRESS.robeMat;
    } else if (y <= WAIST) {
      mat[i] = DRESS.hakamaMat;                                     // 袴の下
    } else {
      mat[i] = DRESS.skinMat;
    }
  }
  /* 体のリカラーは布の下地。実際に着せるのは下で作る白衣なので、
     ここは隙間から覗いたときに肌が出ないようにするためだけのもの。 */

  /* 体の輪郭（角度ごとの最大半径）。胸のふくらみを布で拾わないよう、
     高さ方向に窓を取って最大値を使う＝まっすぐな silhouette になる。 */
  const TA = 28, TB = 20, TY0 = 0.94, TY1 = 1.34;
  const tprof = new Float32Array(TA * TB);
  const torsoBones = new Set([hipsJ, Math.max(0, jointNames.indexOf('spine')),
                              Math.max(0, jointNames.indexOf('chest'))]);
  let torCX = 0, torCZ = 0, tn = 0;
  for (let i = 0; i < NV; i++) {
    const y = pos[i * 3 + 1];
    if (y < TY0 || y > TY1 || find(i) !== bodyRoot || !torsoBones.has(dom(i))) continue;
    torCX += pos[i * 3]; torCZ += pos[i * 3 + 2]; tn++;
  }
  if (tn) { torCX /= tn; torCZ /= tn; }
  for (let i = 0; i < NV; i++) {
    const y = pos[i * 3 + 1];
    if (y < TY0 || y > TY1 || find(i) !== bodyRoot || !torsoBones.has(dom(i))) continue;
    const dx = pos[i * 3] - torCX, dz = pos[i * 3 + 2] - torCZ;
    const r = Math.hypot(dx, dz);
    const a = Math.floor((Math.atan2(dz, dx) / TAU + 1.0) * TA) % TA;
    const b = Math.min(TB - 1, Math.max(0, Math.floor((y - TY0) / (TY1 - TY0) * TB)));
    if (r > tprof[a * TB + b]) tprof[a * TB + b] = r;
  }
  const torsoR = (ang, y) => {
    const fa = ((ang / TAU + 1.0) % 1.0) * TA;
    const a0 = Math.floor(fa) % TA, a1 = (a0 + 1) % TA, ta = fa - Math.floor(fa);
    const fb = clamp((y - TY0) / (TY1 - TY0) * TB, 0, TB - 1.001);
    const b0 = Math.floor(fb);
    let m0 = 0, m1 = 0;
    for (let d = -3; d <= 3; d++) {          // 高さの窓で最大 = 胸を拾わない
      const b = Math.min(TB - 1, Math.max(0, b0 + d));
      m0 = Math.max(m0, tprof[a0 * TB + b]); m1 = Math.max(m1, tprof[a1 * TB + b]);
    }
    const r = lerp(m0, m1, ta);
    return r > 0.03 ? r : 0.12;
  };

  /* ---- 4/6. 生成するもの ---- */
  const ex = { pos: [], nrm: [], mat: [], bi: [], bw: [], idx: [] };
  const push = (x, y, z, nx, ny, nz, m, j0, w0, j1, w1) => {
    const id = NV + ex.pos.length / 3;
    ex.pos.push(x, y, z); ex.nrm.push(nx, ny, nz); ex.mat.push(m);
    ex.bi.push(j0, j1 || 0, 0, 0); ex.bw.push(w0, w1 || 0, 0, 0);
    return id;
  };
  const quad = (a, b, c, d) => { ex.idx.push(a, b, c, a, c, d); };

  /* --- ボブ ---
     頭骨の輪郭に沿わせた殻。裾の高さを角度で変え、前は眉の上（前髪）、
     横と後ろは顎の線まで下ろす。毛先はわずかに外へ膨らませる。 */
  const HA = 56, HB = 22;
  /* 頭頂は決め打ちにしない。実測した頭骨の最上部に合わせる。
     1.628 と決め打ちにしていたときは実際の頭（1.599）より 3cm 高く、
     さらにドームが乗って 8cm の鶏冠になっていた。 */
  const crownY = skullTop - 0.003;
  const hemAt = ang => {
    // ang: +z が正面（顔の向き）。cos で前後を補間する
    const front = Math.cos(ang - Math.PI * 0.5);      // 1 = 正面
    const side = Math.abs(Math.sin(ang - Math.PI * 0.5));
    return 1.497 * Math.max(0, front) + 1.386 * (1 - Math.max(0, front)) - side * 0.012;
  };
  const hairRows = [];
  for (let b = 0; b <= HB; b++) {
    const v = b / HB;
    const row = [];
    for (let a = 0; a < HA; a++) {
      const ang = a / HA * TAU;
      const hem = hemAt(ang);
      // 上ほど詰めて、毛先へ向けてゆっくり下ろす
      const y = lerp(crownY, hem, Math.pow(v, 0.78));
      const base = profAt(ang, Math.min(y, crownY));
      /* 毛先はわずかに外へ張ってから、いちばん下で内に入る。
         まっすぐ外へ広げるとヘルメットになる。 */
      const side = Math.abs(Math.sin(ang - Math.PI * 0.5));
      const flare = 0.012 * smoothstep(0.30, 0.72, v)
                  - (0.020 + 0.014 * side) * smoothstep(0.78, 1.0, v);
      const r = base + 0.008 + flare;
      row.push([headCX + Math.cos(ang) * r, y, headCZ + Math.sin(ang) * r]);
    }
    hairRows.push(row);
  }
  const hairIds = hairRows.map(row => row.map(p => {
    const nx = p[0] - headCX, nz = p[2] - headCZ;
    const l = Math.hypot(nx, nz) || 1;
    return push(p[0], p[1], p[2], nx / l * 0.86, 0.35, nz / l * 0.86, DRESS.hairMat, headJ, 1);
  }));
  for (let b = 0; b < HB; b++)
    for (let a = 0; a < HA; a++)
      quad(hairIds[b][a], hairIds[b][(a + 1) % HA],
           hairIds[b + 1][(a + 1) % HA], hairIds[b + 1][a]);
  /* 頭頂はドームで塞ぐ。1点への扇にすると、そこだけ角が立って角(つの)に
     見える（実際そう見えていた）。 */
  {
    const CR = 4;
    let prev = hairIds[0];
    const r0 = Math.hypot(hairRows[0][0][0] - headCX, hairRows[0][0][2] - headCZ);
    for (let k = 1; k <= CR; k++) {
      const u = k / CR;
      const ring = [];
      for (let a = 0; a < HA; a++) {
        const ang = a / HA * TAU;
        const rr = profAt(ang, crownY) * Math.cos(u * Math.PI * 0.5) + 0.008;
        const yy = crownY + Math.sin(u * Math.PI * 0.5) * (r0 * 0.30);
        const nx = Math.cos(ang) * Math.cos(u * Math.PI * 0.5);
        const nz = Math.sin(ang) * Math.cos(u * Math.PI * 0.5);
        ring.push(push(headCX + Math.cos(ang) * rr, yy, headCZ + Math.sin(ang) * rr,
                       nx, Math.sin(u * Math.PI * 0.5), nz, DRESS.hairMat, headJ, 1));
      }
      for (let a = 0; a < HA; a++)
        quad(prev[a], ring[a], ring[(a + 1) % HA], prev[(a + 1) % HA]);
      prev = ring;
    }
    const c = push(headCX, crownY + r0 * 0.31, headCZ, 0, 1, 0, DRESS.hairMat, headJ, 1);
    for (let a = 0; a < HA; a++) ex.idx.push(c, prev[a], prev[(a + 1) % HA]);
  }

  /* --- 白衣 ---
     肩から腰まで。体の輪郭に沿わせつつ、高さ方向に窓を取った最大半径を
     使うので、胸のふくらみを拾わずまっすぐに落ちる。襟は前を V に開ける。 */
  const RA = 40, RB = 14, rTop = 1.315, rBot = 0.955;
  const collarAt = ang => {
    const front = Math.max(0, Math.cos(ang - Math.PI * 0.5));
    return rTop - 0.085 * Math.pow(front, 1.6);       // 前は V に下げる
  };
  const rRows = [];
  for (let b = 0; b <= RB; b++) {
    const v = b / RB;
    const row = [];
    for (let a = 0; a < RA; a++) {
      const ang = a / RA * TAU;
      const y = lerp(collarAt(ang), rBot, v);
      const r = torsoR(ang, y) * 1.045 + 0.020;
      row.push([torCX + Math.cos(ang) * r, y, torCZ + Math.sin(ang) * r, ang]);
    }
    rRows.push(row);
  }
  const spineJ = Math.max(0, jointNames.indexOf('spine'));
  const chestJ = Math.max(0, jointNames.indexOf('chest'));
  const rIds = rRows.map((row, b) => row.map(p => {
    const v = b / RB;
    const nx = Math.cos(p[3]), nz = Math.sin(p[3]);
    // 上は chest、下は hips に寄せる
    const w = smoothstep(0.15, 0.85, v);
    return push(p[0], p[1], p[2], nx * 0.96, 0.16, nz * 0.96, DRESS.robeMat,
                chestJ, 1 - w, w > 0.5 ? hipsJ : spineJ, w);
  }));
  for (let b = 0; b < RB; b++)
    for (let a = 0; a < RA; a++)
      quad(rIds[b][a], rIds[b][(a + 1) % RA],
           rIds[b + 1][(a + 1) % RA], rIds[b + 1][a]);
  // 肩の面（襟のまわりを塞ぐ）
  {
    const inner = rRows[0].map(p => {
      const nx = Math.cos(p[3]), nz = Math.sin(p[3]);
      const r = Math.hypot(p[0] - torCX, p[2] - torCZ) * 0.62;
      return push(torCX + nx * r, p[1] + 0.012, torCZ + nz * r, 0, 1, 0,
                  DRESS.robeMat, chestJ, 1);
    });
    for (let a = 0; a < RA; a++)
      quad(inner[a], inner[(a + 1) % RA], rIds[0][(a + 1) % RA], rIds[0][a]);
  }

  /* --- 袴 ---
     腰から足首まで。裾へ向かって広がり、襞（ひだ）を刻む。 */
  const KA = 64, KB = 16, kTop = 1.02, kBot = 0.16;
  /* 腰まわりは**胴と脚の骨に付く頂点だけ**で測る。高さだけで拾うと、
     A ポーズで垂らした腕（|x|=0.3 付近）が入って半径が倍以上になり、袴が
     テントになる（実際なった）。外れ値を避けて 88 パーセンタイルを使う。 */
  const hipBones = new Set([hipsJ, thighL, thighR,
                            Math.max(0, jointNames.indexOf('spine'))]);
  let hipCX = 0, hipCZ = 0, hn = 0;
  for (let i = 0; i < NV; i++) {
    const y = pos[i * 3 + 1];
    if (y < 0.92 || y > 1.02 || find(i) !== bodyRoot || !hipBones.has(dom(i))) continue;
    hipCX += pos[i * 3]; hipCZ += pos[i * 3 + 2]; hn++;
  }
  if (hn) { hipCX /= hn; hipCZ /= hn; }
  let hipR = 0.13;
  {
    const rs = [];
    for (let i = 0; i < NV; i++) {
      const y = pos[i * 3 + 1];
      if (y < 0.92 || y > 1.02 || find(i) !== bodyRoot || !hipBones.has(dom(i))) continue;
      rs.push(Math.hypot(pos[i * 3] - hipCX, pos[i * 3 + 2] - hipCZ));
    }
    if (rs.length > 20) {
      rs.sort((a, b) => a - b);
      hipR = rs[Math.floor(rs.length * 0.88)] * 1.06;
    }
  }
  const kRows = [];
  for (let b = 0; b <= KB; b++) {
    const v = b / KB;
    const y = lerp(kTop, kBot, v);
    const row = [];
    for (let a = 0; a < KA; a++) {
      const ang = a / KA * TAU;
      const pleat = 0.006 * Math.sin(ang * 12.0) * smoothstep(0.10, 0.55, v);
      const r = hipR * (1.02 + 0.62 * Math.pow(v, 1.30)) + pleat;
      row.push([hipCX + Math.cos(ang) * r, y, hipCZ + Math.sin(ang) * r, v, ang]);
    }
    kRows.push(row);
  }
  const kIds = kRows.map(row => row.map(p => {
    const nx = Math.cos(p[4]), nz = Math.sin(p[4]);
    // 腰は hips、裾へ向かうほど脚に付ける（左右は x の符号で分ける）
    const legW = smoothstep(0.18, 0.85, p[3]);
    const thigh = p[0] - hipCX < 0 ? thighL : thighR;
    return push(p[0], p[1], p[2], nx * 0.94, 0.26, nz * 0.94, DRESS.hakamaMat,
                hipsJ, 1 - legW, thigh, legW);
  }));
  for (let b = 0; b < KB; b++)
    for (let a = 0; a < KA; a++)
      quad(kIds[b][a], kIds[b][(a + 1) % KA],
           kIds[b + 1][(a + 1) % KA], kIds[b + 1][a]);
  // 帯（腰のところで袴を締める）
  {
    const OB = 12, oy0 = 1.055, oy1 = 0.965;
    const o0 = [], o1 = [];
    for (let a = 0; a < KA; a++) {
      const ang = a / KA * TAU;
      const r = hipR * 1.06;
      o0.push(push(hipCX + Math.cos(ang) * r, oy0, hipCZ + Math.sin(ang) * r,
                   Math.cos(ang), 0.2, Math.sin(ang), DRESS.robeMat, hipsJ, 1));
      o1.push(push(hipCX + Math.cos(ang) * r, oy1, hipCZ + Math.sin(ang) * r,
                   Math.cos(ang), -0.2, Math.sin(ang), DRESS.robeMat, hipsJ, 1));
    }
    for (let a = 0; a < KA; a++) quad(o0[a], o0[(a + 1) % KA], o1[(a + 1) % KA], o1[a]);
    void OB;
  }

  console.log('着付け: 髪の房 ' + isHair.size + ' 房 / ' + droppedV.toLocaleString()
    + ' 頂点を外し、ボブと袴を ' + (ex.pos.length / 3).toLocaleString() + ' 頂点で生成'
    + '（落とした三角形 ' + dropped.toLocaleString() + '）');
  return { mat, keepTri, ex };
}
