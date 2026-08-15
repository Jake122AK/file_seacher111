/* ==== combo.js ==== */
/* =========================================================================
   鳥居くぐり

   千本鳥居を「くぐった数」で数える。連続でくぐるほど速くなり、画角が開き、
   音が上がっていく。止まれば切れる。

   数え方は幾何そのままで、当たり判定を別に置いたりはしない。鳥居は参道の
   媒介変数 t の上に並んでいるので、プレイヤーの t が鳥居の t をまたいだ
   瞬間に1本。横位置 s が離れていれば（脇を通ったなら）数えない。

   音は全部その場で合成する。単一 HTML で配る以上、外部ファイルは持てない。
   ========================================================================= */

/* ---------------------------------------------------------------- 音 --- */
const SND = { ctx: null, master: null, verb: null, on: true, ready: false };

function sndInit() {
  if (SND.ready || SND.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { SND.on = false; return; }
  try {
    const c = new AC();
    SND.ctx = c;
    SND.master = c.createGain();
    SND.master.gain.value = 0.34;
    SND.master.connect(c.destination);
    /* 山の中の残響。畳み込みの応答は雑音を減衰させて自前で作る。
       これが無いと、どの音も「画面の手前」で鳴って世界から浮く。 */
    const len = Math.floor(c.sampleRate * 1.35);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const k = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.6) * (i < 90 ? i / 90 : 1);
      }
    }
    const cv = c.createConvolver(); cv.buffer = buf;
    const wet = c.createGain(); wet.gain.value = 0.30;
    cv.connect(wet); wet.connect(SND.master);
    SND.verb = cv;
    SND.ready = true;
  } catch (e) { SND.on = false; }
}

function sndVoice(wet) {
  if (!SND.ready || !SND.on) return null;
  const c = SND.ctx, g = c.createGain();
  g.connect(SND.master);
  if (SND.verb) { const w = c.createGain(); w.gain.value = wet === undefined ? 0.5 : wet; g.connect(w); w.connect(SND.verb); }
  return { c, g, t: c.currentTime };
}

/* 音は最初の操作まで出せない（どのブラウザも自動再生を止める）。
   叩かれたら開き、以後は外す。M で入り切り。 */
function setupSound() {
  const wake = () => {
    sndInit();
    if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
    if (SND.ready) for (const ev of ['pointerdown', 'keydown', 'touchstart'])
      removeEventListener(ev, wake);
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, wake);
  addEventListener('keydown', e => {
    if (e.key !== 'm' && e.key !== 'M') return;
    SND.on = !SND.on;
    if (SND.master) SND.master.gain.value = SND.on ? 0.34 : 0.0;
  });
}

/* 木を打つ音。鳥居をくぐるたびに1つ。音程は連続数で上がる。 */
function sndPluck(freq, vol) {
  const v = sndVoice(0.35); if (!v) return;
  const { c, g, t } = v;
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.004;
  const g2 = c.createGain(); g2.gain.value = 0.22;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(freq * 7, t);
  lp.frequency.exponentialRampToValueAtTime(freq * 1.6, t + 0.14);
  o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3);
}

/* 鈴。FM で 1 本。節目でだけ鳴らす。 */
function sndBell(freq, vol) {
  const v = sndVoice(0.75); if (!v) return;
  const { c, g, t } = v;
  const car = c.createOscillator(); car.type = 'sine'; car.frequency.value = freq;
  const mod = c.createOscillator(); mod.type = 'sine'; mod.frequency.value = freq * 3.17;
  const mg = c.createGain();
  mg.gain.setValueAtTime(freq * 5.2, t);
  mg.gain.exponentialRampToValueAtTime(freq * 0.12, t + 0.5);
  mod.connect(mg); mg.connect(car.frequency);
  car.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.32, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  car.start(t); mod.start(t); car.stop(t + 1.6); mod.stop(t + 1.6);
}

/* 狐の声。短い上がり下がりを2回。 */
function sndYip(up) {
  const v = sndVoice(0.4); if (!v) return;
  const { c, g, t } = v;
  const o = c.createOscillator(); o.type = 'sawtooth';
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3.2; bp.frequency.value = 1500;
  const f0 = up ? 620 : 700;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * (up ? 2.1 : 1.5), t + 0.045);
  o.frequency.exponentialRampToValueAtTime(f0 * (up ? 1.5 : 0.82), t + 0.13);
  o.connect(bp); bp.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
  o.start(t); o.stop(t + 0.2);
}

const SND_SCALE = [0, 3, 5, 7, 10];         // 都節に近い5音。外れない。
function sndFanfare(base) {
  if (!SND.ready) return;
  const b = base || 392;
  [0, 2, 4, 7].forEach((k, i) => setTimeout(() => sndPluck(b * Math.pow(2, k / 12), 0.5), i * 82));
  setTimeout(() => sndBell(b * 2, 0.34), 300);
}

function sndBreak() {
  if (!SND.ready) return;
  sndPluck(330, 0.24);
  setTimeout(() => sndPluck(247, 0.20), 90);
}

/* ------------------------------------------------------------ コンボ --- */
const COMBO = {
  n: 0, best: 0, total: 0, boost: 1, fovAdd: 0, rush: 0,
  lastT: -99, popT: -99, popText: '', popSub: '', bump: 0, vis: 0,
  prevT: undefined, slow: 0, list: null, cur: 0, session: 0, conf: [],
};

const COMBO_MARKS = [
  { n: 10, t: 'いいね！', s: 'とまるな', kon: 'いいちょうし！' },
  { n: 25, t: '快 調', s: 'もっと はやく', kon: 'もっといける！' },
  { n: 50, t: '五十本', s: 'まだ いける', kon: 'はやいはやい！' },
  { n: 100, t: '百 本', s: 'ここからが 本番', kon: 'すごい！ひゃくぼん！', big: 1 },
  { n: 200, t: '二百本', s: '足が 軽い', kon: 'とまらないで！' },
  { n: 300, t: '三百本', s: '四ツ辻は すぐそこ', kon: 'もうすぐ四ツ辻！' },
  { n: 500, t: '五百本', s: '山頂まで あと半分', kon: 'ごひゃく！！', big: 1 },
  { n: 1000, t: '千本走破', s: 'よくぞ ここまで', kon: 'せんぼん！！！', big: 2 },
];

/* 速度線の実体。中心から外へ伸びる棒を並べ、束ごと ゆっくり回す。 */
function comboSpokes() {
  const host = document.getElementById('rush');
  if (!host || host.childElementCount) return;
  /* 疎に置くと、走っている感じではなく画面の引っかき傷に見える。
     本数で押し切り、長さと太さを散らして束にする。 */
  const N = 72;
  for (let i = 0; i < N; i++) {
    const d = document.createElement('i');
    const j = (i * 37) % 11;                     // 見た目の乱数（毎回同じ並び）
    d.style.height = (11 + j * 2.4) + 'vmax';
    d.style.width = (1.2 + (j % 3) * 0.7).toFixed(1) + 'px';
    d.style.opacity = (0.45 + (j % 4) * 0.18).toFixed(2);
    d.style.transform = 'rotate(' + (i * (360 / N) + (j - 5) * 1.6).toFixed(2)
      + 'deg) translateY(' + (21 + (j % 5) * 3.4).toFixed(1) + 'vmax)';
    host.appendChild(d);
  }
}

function initCombo() {
  comboSpokes();
  /* 鳥居の並び。中心線のぶんと分岐のぶんを t で1本に並べ直す。 */
  const a = (R.toriiPass || []).slice();
  a.sort((x, y) => x.t - y.t);
  COMBO.list = a;
  COMBO.cur = 0;
  try {
    COMBO.best = parseInt(localStorage.getItem('kon.best') || '0', 10) || 0;
    COMBO.total = parseInt(localStorage.getItem('kon.total') || '0', 10) || 0;
  } catch (e) { /* プライベートモードでは黙って諦める */ }
  comboHud();
}

function comboSave() {
  try {
    localStorage.setItem('kon.best', String(COMBO.best));
    localStorage.setItem('kon.total', String(COMBO.total));
  } catch (e) { /* 同上 */ }
}

function comboPop(text, sub, big) {
  COMBO.popText = text; COMBO.popSub = sub || ''; COMBO.popT = R.time;
  COMBO.popBig = big || 0;
  const el = document.getElementById('pop');
  if (el) el.innerHTML = '<b>' + text + '</b>' + (sub ? '<i>' + sub + '</i>' : '');
  if (big >= 1) comboConfetti(big >= 2 ? 130 : 70);
}

/* 紙吹雪。落下は CSS の keyframes ではなく、こちらの毎フレームで回す。
   描画が詰まっている場面では合成側のアニメーションが1度も進まないことが
   あり、そうなると紙が画面の上端に貼り付いたまま消える。 */
function comboConfetti(n) {
  const host = document.getElementById('conf');
  if (!host) return;
  const cols = ['#e0442f', '#f2b134', '#f6f0e2', '#d9762c', '#c7972f'];
  const W = innerWidth;
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i');
    d.style.background = cols[(Math.random() * cols.length) | 0];
    d.style.width = (5 + Math.random() * 6).toFixed(1) + 'px';
    d.style.height = (9 + Math.random() * 9).toFixed(1) + 'px';
    host.appendChild(d);
    COMBO.conf.push({
      el: d, x: Math.random() * W, y: -30 - Math.random() * 160,
      vx: (Math.random() - 0.5) * 140, vy: 120 + Math.random() * 200,
      r: Math.random() * 360, vr: (Math.random() - 0.5) * 900,
      ph: Math.random() * 6.283,
    });
  }
}

function comboConfStep(dt) {
  const L = COMBO.conf;
  if (!L.length) return;
  const H = innerHeight + 60, t = R.time;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i];
    p.vy += 620 * dt;
    p.vy *= 1 - Math.min(0.9, 1.4 * dt);        // 紙なので、すぐ終速に達する
    p.x += (p.vx + Math.sin(t * 6.0 + p.ph) * 55) * dt;
    p.y += p.vy * dt;
    p.r += p.vr * dt;
    if (p.y > H) { p.el.remove(); L.splice(i, 1); continue; }
    p.el.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1)
      + 'px,0) rotate(' + p.r.toFixed(0) + 'deg)';
  }
}

function comboBreak() {
  if (COMBO.n >= 5) {
    sndBreak();
    if (COMBO.n >= 20 && typeof konSay === 'function') konSay('あー、とまっちゃった', 'brk');
  }
  COMBO.n = 0;
}

function comboAdd(k) {
  COMBO.n += k;
  COMBO.session += k;
  COMBO.total += k;
  COMBO.lastT = R.time;
  COMBO.bump = 1;
  if (COMBO.n > COMBO.best) { COMBO.best = COMBO.n; COMBO.newBest = 1; }
  /* 音程は5音階を登る。オクターブ2つで頭打ちにして、耳に痛くしない。 */
  const step = (COMBO.n - 1) % 5, oct = Math.min(2, ((COMBO.n - 1) / 5) | 0);
  sndPluck(196 * Math.pow(2, (SND_SCALE[step] + oct * 12) / 12), 0.34);
  for (const M of COMBO_MARKS) if (COMBO.n === M.n) {
    comboPop(M.t, M.s, M.big);
    sndFanfare(M.big >= 2 ? 523 : 392);
    if (typeof konSay === 'function') konSay(M.kon, 'm' + M.n, 3.0);
    if (typeof KON !== 'undefined' && KON.ready) { KON.cheer = 1.1; sndYip(1); }
  }
  if (COMBO.n % 100 === 0 && !COMBO_MARKS.some(M => M.n === COMBO.n)) {
    comboPop(COMBO.n + '本', '', 1);
    sndFanfare(392);
  }
}

function updateCombo(dt) {
  if (!COMBO.list) return;
  const a = (typeof PLAY !== 'undefined' && PLAY.ready)
    ? PLAY.pos : [CAM.pos[0], CAM.pos[1] - CFG.eyeHeight, CAM.pos[2]];
  const g = WORLD.groundAt(a[0], a[2]);
  const spd = Math.hypot(CAM.vel[0], CAM.vel[2]);

  if (g.t !== undefined) {
    const t0 = COMBO.prevT, t1 = g.t;
    if (t0 !== undefined && Math.abs(t1 - t0) < 6.0) {
      /* またいだ鳥居を数える。真下を通ったものだけ。 */
      const lo = Math.min(t0, t1), hi = Math.max(t0, t1);
      let hit = 0;
      const L = COMBO.list;
      /* 一覧は t で並んでいるので、前回の位置から線形に進める。 */
      let i = COMBO.cur;
      while (i > 0 && L[i - 1].t >= lo) i--;
      while (i < L.length && L[i].t < lo) i++;
      while (i < L.length && L[i].t <= hi) {
        if (Math.abs(g.s - L[i].s) < 1.55) hit++;
        i++;
      }
      COMBO.cur = i;
      if (hit && t1 > t0) comboAdd(hit);            // 登る向きにだけ数える
      else if (hit && t1 < t0 && COMBO.n > 0) comboBreak();
    } else if (t0 !== undefined) {
      COMBO.cur = 0;                                 // 飛んだ。数え直す。
    }
    COMBO.prevT = t1;
  }

  /* 途切れる条件。「止まったら切れる」が分かりやすいので、そこを主にする。 */
  COMBO.slow = spd < 1.0 ? COMBO.slow + dt : 0;
  /* 12 秒。四ツ辻の開けた区間は鳥居が 47m ぶん無いので、7 秒だと
     走り抜けただけで切れてしまう。切れるのは「止まったとき」でいい。 */
  if (COMBO.n > 0 && (COMBO.slow > 0.85 || R.time - COMBO.lastT > 12.0)) comboBreak();

  /* 速さ・画角・カメラ距離。数が伸びるほど画面が広がって前へ出る。 */
  const k = Math.min(COMBO.n, 50) / 50;
  const want = 1 + k * 0.45;
  COMBO.boost += (want - COMBO.boost) * Math.min(1, dt * 2.4);
  COMBO.fovAdd += (k * 7.5 / 57.3 - COMBO.fovAdd) * Math.min(1, dt * 2.0);
  COMBO.rush += (Math.max(0, k - 0.12) - COMBO.rush) * Math.min(1, dt * 3.0);
  CFG.camDist = 3.1 + (COMBO.boost - 1) * 1.9;
  COMBO.bump *= Math.exp(-dt * 9);
  COMBO.vis += ((COMBO.n > 0 ? 1 : 0) - COMBO.vis) * Math.min(1, dt * 9);
  comboConfStep(dt);
  comboHud();
}

function comboHud() {
  const el = document.getElementById('cmb');
  if (!el) return;
  /* 出し入れは CSS の transition に任せない。描画が詰まっている場面で
     開始が飛び、0 のまま残ることがある。毎フレーム自分で値を書く。 */
  const show = COMBO.vis > 0.004;
  el.style.opacity = COMBO.vis.toFixed(3);
  if (show) {
    const nEl = document.getElementById('cmbN');
    if (nEl && nEl.__v !== COMBO.n) { nEl.textContent = COMBO.n; nEl.__v = COMBO.n; }
    el.style.transform = 'translateY(-50%) scale(' + (1 + COMBO.bump * 0.16).toFixed(3) + ')';
    /* 端数のある rgb() は不正な値として丸ごと捨てられる。必ず整数で組む。 */
    const hue = Math.min(COMBO.n, 100) / 100;
    el.style.color = 'rgb(255,' + Math.round(238 - hue * 60) + ',' + Math.round(214 - hue * 130) + ')';
  }
  const r = document.getElementById('rush');
  if (r) r.style.opacity = (COMBO.rush * 0.80).toFixed(3);
  const p = document.getElementById('pop');
  if (p) {
    const age = R.time - COMBO.popT, hold = COMBO.popBig ? 2.4 : 1.5;
    if (age > hold) p.style.opacity = '0';
    else {
      const inK = Math.min(1, age * 8);
      p.style.opacity = (inK * (1 - smoothstep(hold - 0.5, hold, age))).toFixed(3);
      p.style.transform = 'translate(-50%,-50%) scale(' +
        (0.7 + inK * 0.3 + Math.max(0, 1 - age * 4) * 0.22).toFixed(3) + ')';
    }
  }
  const s = document.getElementById('stats');
  if (s) {
    const txt = '通算 ' + COMBO.total + ' 本 ／ 最高 ' + COMBO.best + ' 連';
    if (s.__v !== txt) { s.textContent = txt; s.__v = txt; }
  }
}

/* 記録は落ちるときに書く。毎本 localStorage を叩くと、走っている間ずっと
   同期I/Oが混ざってフレームが飛ぶ。 */
addEventListener('visibilitychange', () => { if (document.hidden) comboSave(); });
addEventListener('pagehide', comboSave);
