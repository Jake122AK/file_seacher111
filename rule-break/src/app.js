// app.js -- title, stage map, and the playing screen.
// The engine knows the rules; this file only knows how to show them and how
// to turn fingers into actions.

import { Game } from './engine.js';
import { STAGES, stageById, registerStages } from './stages/index.js';
import { Renderer } from './render.js';
import { play as sfx, setMuted, isMuted } from './audio.js';
import { load, save, saveNow } from './save.js';

const S = load();
setMuted(!!S.muted);

const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};

// Stages written in the editor live in their own slot and are merged in here.
try {
  const custom = JSON.parse(localStorage.getItem('rulebreak.custom.v1') || '[]');
  registerStages(custom.map((st) => ({ ...st, level: st.level ?? 11, custom: true })));
} catch { /* malformed custom stages are ignored, never fatal */ }

const MAIN = STAGES.filter((s) => !s.hidden);
const MAIN_IDS = MAIN.map((s) => s.id);
const HIDDEN = STAGES.filter((s) => s.hidden);

// ---------------------------------------------------------------- progress

function playable(id) {
  const st = stageById(id);
  if (!st) return false;
  if (st.hidden) return !!S.unlocked[id];
  const i = MAIN_IDS.indexOf(id);
  if (i <= 0) return true;
  return !!S.cleared[MAIN_IDS[i - 1]];
}

function allMainCleared() { return MAIN_IDS.every((id) => S.cleared[id]); }
function percent() {
  const total = STAGES.length;
  const done = STAGES.filter((s) => S.cleared[s.id]).length;
  return Math.round((done / total) * 100);
}
function surgeryUnlocked() { return !!S.cleared['46'] || !!S.titleBroken || !!S.cleared['FINAL']; }

function rootFlags() {
  const f = {};
  if (S.rootRules.wallSoft) f.rootWallSoft = true;
  return f;
}

// ---------------------------------------------------------------- screens

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
  $('screen-' + name).classList.add('active');
  if (name === 'select') buildMap();
  if (name === 'title') refreshTitle();
}

function overlay(build) {
  const o = $('overlay');
  o.innerHTML = '';
  const card = el('div', 'card');
  build(card, () => { o.classList.add('hidden'); o.innerHTML = ''; });
  o.appendChild(card);
  o.classList.remove('hidden');
}

// ---------------------------------------------------------------- title

function refreshTitle() {
  const slash = $('logo-slash');
  const done = allMainCleared();
  slash.classList.toggle('live', done && !S.titleBroken);
  slash.classList.toggle('gone', !!S.titleBroken);
  $('title-sub').textContent = S.titleBroken
    ? 'ROOT ACCESS'
    : (done ? '100%' : `${percent()}%`);
  $('btn-sound').textContent = 'SOUND: ' + (isMuted() ? 'OFF' : 'ON');
  $('title-foot').textContent = S.titleBroken
    ? 'STAGE NULL 解放済み'
    : '盤面を解くな。ルールを解け。';
  $('root-panel').classList.toggle('hidden', !S.titleBroken);
  if (S.titleBroken) buildRootPanel();
}

const ROOT_RULES = [
  { key: 'wallSoft', text: 'WALL IS SOLID', invert: true },
  { key: 'noUndo', text: 'UNDO EXISTS', invert: true },
];

function buildRootPanel() {
  const list = $('root-list');
  list.innerHTML = '';
  for (const r of ROOT_RULES) {
    const on = !S.rootRules[r.key];
    const row = el('div', 'root-rule' + (on ? '' : ' off'));
    row.appendChild(el('span', 'txt', r.text));
    row.appendChild(el('span', 'state', on ? 'TRUE' : 'DELETED'));
    row.onclick = () => {
      S.rootRules[r.key] = !S.rootRules[r.key];
      save(); sfx('low'); buildRootPanel();
    };
    list.appendChild(row);
  }
}

$('logo-slash').onclick = () => {
  if (!allMainCleared() || S.titleBroken) return;
  S.titleBroken = true;
  for (const st of HIDDEN) if (st.nullStage) S.unlocked[st.id] = true;
  saveNow();
  sfx('discover');
  overlay((card, close) => {
    card.classList.add('discovered');
    card.appendChild(el('h2', null, 'RULE BREAK'));
    card.appendChild(el('div', 'big-word', '//'));
    card.appendChild(el('p', null,
      'タイトルから区切りが外れた。\nこの世界の根本規則が編集可能になり、STAGE NULL が姿を現した。'));
    const row = el('div', 'row');
    const b = el('button', 'btn', 'OK');
    b.onclick = () => { close(); refreshTitle(); };
    row.appendChild(b); card.appendChild(row);
  });
};

$('btn-start').onclick = () => {
  const next = MAIN_IDS.find((id) => !S.cleared[id]) || S.lastStage || '1';
  startStage(playable(next) ? next : '1');
};
$('btn-map').onclick = () => show('select');
$('btn-sound').onclick = () => { setMuted(!isMuted()); S.muted = isMuted(); save(); refreshTitle(); sfx('ui'); };
$('sel-back').onclick = () => show('title');

// ---------------------------------------------------------------- stage map

let pickedDigit = null;

function buildMap() {
  const map = $('node-map');
  map.innerHTML = '';
  $('sel-progress').textContent = percent() + '%';

  const groups = [
    ['LEVEL 1  観測', (s) => s.level === 1],
    ['LEVEL 2  利用', (s) => s.level === 2],
    ['LEVEL 3  干渉', (s) => s.level === 3],
    ['LEVEL 4  時間', (s) => s.level === 4],
    ['LEVEL 5  画面', (s) => s.level === 5],
    ['LEVEL 6-7  文章', (s) => s.level === 6 || s.level === 7],
    ['LEVEL 8  ステージ', (s) => s.level === 8],
    ['FINAL', (s) => s.level === 9],
    ['NULL', (s) => s.level === 10],
    ['CUSTOM', (s) => s.custom],
  ];

  for (const [label, filter] of groups) {
    const list = STAGES.filter(filter).filter((s) => !s.hidden || S.unlocked[s.id]);
    if (!list.length) continue;
    map.appendChild(el('div', 'node-group', label));
    const row = el('div', 'node-row');
    for (const st of list) row.appendChild(makeNode(st));
    map.appendChild(row);
  }

  $('sel-foot').textContent = surgeryUnlocked()
    ? 'ステージ番号を長押しすると数字を取り外せる。'
    : 'クリアしたステージから順に進める。';
}

function makeNode(st) {
  const open = playable(st.id);
  const n = el('button', 'node' + (open ? '' : ' locked')
    + (S.cleared[st.id] ? ' cleared' : '') + (st.hidden ? ' hiddenstage' : '')
    + (surgeryUnlocked() ? ' surgery' : ''));
  n.appendChild(el('span', 'digit', st.id));
  if (pickedDigit && pickedDigit.from !== st.id) n.classList.add('picked');

  let timer = null;
  const longPress = () => {
    timer = null;
    if (!surgeryUnlocked()) return;
    askDigit(st);
  };
  n.addEventListener('pointerdown', () => { timer = setTimeout(longPress, 480); });
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  n.addEventListener('pointerup', () => {
    if (!timer) return;         // long press already handled it
    cancel();
    if (pickedDigit) { applyDigit(st); return; }
    if (!open) { sfx('err'); n.classList.add('shake'); setTimeout(() => n.classList.remove('shake'), 200); return; }
    startStage(st.id);
  });
  n.addEventListener('pointerleave', cancel);
  n.addEventListener('pointercancel', cancel);
  return n;
}

function askDigit(st) {
  const digits = String(st.id).split('').filter((c) => /[0-9]/.test(c));
  if (!digits.length) { sfx('err'); return; }
  sfx('ui');
  overlay((card, close) => {
    card.appendChild(el('h2', null, 'STAGE ' + st.id));
    card.appendChild(el('p', null, 'どの数字を取り外す？ 取り外した数字は、別のステージ番号へ重ねられる。'));
    const row = el('div', 'row');
    for (const d of digits) {
      const b = el('button', 'btn big', d);
      b.onclick = () => { pickedDigit = { d, from: st.id }; close(); buildMap(); sfx('warp'); };
      row.appendChild(b);
    }
    const c = el('button', 'btn', 'やめる');
    c.onclick = () => { pickedDigit = null; close(); buildMap(); };
    card.appendChild(row); card.appendChild(el('div', 'row')).appendChild(c);
  });
}

function applyDigit(target) {
  const d = pickedDigit.d;
  pickedDigit = null;
  const cands = [d + target.id, target.id + d];
  const found = cands.map((id) => stageById(id)).find((s) => s && s.hidden);
  buildMap();
  if (!found) { sfx('err'); return; }
  const already = S.unlocked[found.id];
  S.unlocked[found.id] = true;
  saveNow();
  sfx('discover');
  buildMap();
  overlay((card, close) => {
    card.classList.add('discovered');
    card.appendChild(el('h2', null, already ? 'STAGE ' + found.id : 'STAGE ' + found.id + ' 生成'));
    card.appendChild(el('div', 'big-word', found.id));
    card.appendChild(el('p', null, '存在しないはずのステージが、ステージ選択画面に現れた。'));
    const row = el('div', 'row');
    const go = el('button', 'btn', 'ENTER');
    go.onclick = () => { close(); startStage(found.id); };
    const no = el('button', 'btn', 'あとで');
    no.onclick = close;
    row.appendChild(go); row.appendChild(no); card.appendChild(row);
  });
}

// ---------------------------------------------------------------- play

const canvas = $('board');
const renderer = new Renderer(canvas);
let game = null;
let stage = null;
let selectedWord = null;
let guessTokens = [];

function startStage(id) {
  stage = stageById(id);
  if (!stage) return;
  S.lastStage = id;
  save();
  newGame();
  show('play');
  requestAnimationFrame(() => { renderer.resize(); draw(); });
}

function newGame(keepNote = false) {
  selectedWord = null;
  guessTokens = [];
  game = new Game(stage, {
    globals: S.globals,
    discovered: S.discovered,
    rootFlags: rootFlags(),
  });
  if (!keepNote) S.notes[stage.id] = S.notes[stage.id] || [];
  drainEvents();
  buildHud();
  buildTray();
  buildNote();
  draw();
}

function buildHud() {
  renderChip($('hud-stage'), 'STAGE ' + stage.id, 'stage');
  const t = $('hud-title');
  t.innerHTML = '';
  t.appendChild(el('span', null, stage.title));
  t.onclick = () => doUI('tapTitle');
  renderChip($('hud-moves'), 'MOVES ' + game.s.turn, 'moves');
}

// Each character is its own element so the player can pull one out.
function renderChip(node, text, kind) {
  node.innerHTML = '';
  node.dataset.kind = kind;
  const grabbable = game.allows('dropChar');
  for (const ch of text) {
    const c = el('span', 'ch' + (grabbable && /[0-9]/.test(ch) ? ' grabbable' : ''), ch);
    if (grabbable && /[0-9]/.test(ch)) {
      c.dataset.char = ch;
      c.addEventListener('pointerdown', (e) => beginDrag(e, { type: 'char', value: ch }));
    }
    node.appendChild(c);
  }
}

function buildTray() {
  const tray = $('tray');
  tray.innerHTML = '';
  const words = stage.ui_words || [];
  if (game.allows('dropUI')) {
    for (const w of words) {
      const chip = el('div', 'word-chip', w);
      chip.addEventListener('pointerdown', (e) => beginDrag(e, { type: 'item', value: w }));
      tray.appendChild(chip);
    }
  }
  if (selectedWord && game.allows('splitWord')) {
    const o = game.byRef('#' + selectedWord);
    if (o && o.text.length > 1) {
      for (let i = 1; i < o.text.length; i++) {
        const chip = el('div', 'word-chip', o.text.slice(0, i) + '|' + o.text.slice(i));
        chip.onclick = () => splitAt(o, i);
        tray.appendChild(chip);
      }
    }
  }
}

function splitAt(o, i) {
  const spot = freeNeighbour(o.x, o.y);
  if (!spot) { sfx('err'); return; }
  doAction({ type: 'ui', name: 'splitWord', args: { ref: '#' + o.id, at: i, x: spot.x, y: spot.y } });
  selectedWord = null;
  buildTray();
}

function freeNeighbour(x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (!game.solidFor(nx, ny, null) && !game.objsAt(nx, ny).length) return { x: nx, y: ny };
  }
  return null;
}

// ---------------------------------------------------------------- note

function buildNote() {
  const obs = $('note-obs');
  obs.innerHTML = '';
  const list = S.notes[stage.id] || [];
  if (!list.length) obs.appendChild(el('div', 'empty', '観測記録なし。動かせば増える。'));
  for (const line of list.slice(-8)) obs.appendChild(el('div', null, line));
  $('note-count').textContent = list.length ? `(${list.length})` : '';

  const pool = $('token-pool');
  pool.innerHTML = '';
  for (const tk of stage.tokens || []) {
    const b = el('button', 'token' + (guessTokens.includes(tk) ? ' picked' : ''), tk);
    b.onclick = () => {
      const i = guessTokens.indexOf(tk);
      if (i >= 0) guessTokens.splice(i, 1); else guessTokens.push(tk);
      sfx('ui'); buildNote();
    };
    pool.appendChild(b);
  }
  const line = $('guess-line');
  line.innerHTML = '';
  if (!guessTokens.length) line.appendChild(el('span', 'guess-empty', '単語を選んで法則を組み立てる'));
  else for (const tk of guessTokens) line.appendChild(el('span', 'token picked', tk));

  const known = $('known-rules');
  known.innerHTML = '';
  const laws = [...(stage.hidden_rules || []), ...(stage.laws || [])].filter((r) => r.answer);
  const got = laws.filter((r) => S.discovered[r.id]);
  if (got.length) {
    known.appendChild(el('div', 'head', 'DISCOVERED'));
    for (const r of got) known.appendChild(el('div', null, r.name));
  }
}

$('btn-guess').onclick = () => {
  if (!guessTokens.length) return;
  const laws = [...(stage.hidden_rules || []), ...(stage.laws || [])].filter((r) => r.answer);
  const key = [...guessTokens].sort().join('|');
  const hit = laws.find((r) => [...r.answer].sort().join('|') === key && !S.discovered[r.id]);
  if (hit) {
    S.discovered[hit.id] = true;
    saveNow();
    guessTokens = [];
    ruleDiscovered(hit);
  } else {
    sfx('err');
    $('guess-line').classList.add('shake');
    setTimeout(() => $('guess-line').classList.remove('shake'), 200);
  }
  buildNote();
};
$('btn-guess-clear').onclick = () => { guessTokens = []; buildNote(); };

$('note-close').onclick = () => {
  const n = $('note');
  n.classList.toggle('closed');
  if (game && game.allows('closeNote')) doUI('closeNote');
  else sfx('ui');
};

function ruleDiscovered(rule) {
  sfx('discover');
  overlay((card, close) => {
    card.classList.add('discovered');
    card.appendChild(el('h2', null, 'RULE DISCOVERED'));
    card.appendChild(el('div', 'big-word', rule.name));
    card.appendChild(el('p', null, 'この法則は RULE NOTE に記録された。'));
    const row = el('div', 'row');
    const b = el('button', 'btn', 'OK');
    b.onclick = close;
    row.appendChild(b); card.appendChild(row);
  });
}

// ---------------------------------------------------------------- hints

$('btn-hint').onclick = () => {
  const used = S.hints[stage.id] || 0;
  overlay((card, close) => {
    card.appendChild(el('h2', null, 'HINT'));
    const tiers = [stage.hint_1, stage.hint_2, stage.hint_3];
    let shown = used;
    const body = el('div');
    const render = () => {
      body.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const t = el('div', 'hint-tier');
        t.appendChild(el('span', 'lbl', 'HINT ' + (i + 1)));
        t.appendChild(el('span', null, i < shown ? tiers[i] : '- - - - -'));
        body.appendChild(t);
      }
    };
    render();
    card.appendChild(body);
    card.appendChild(el('p', null, '答えそのものは出さない。最後の一歩は自分で踏め。'));
    const row = el('div', 'row');
    const more = el('button', 'btn', shown >= 3 ? '全て表示済み' : '次のヒントを開く');
    more.onclick = () => {
      if (shown >= 3) return;
      shown++;
      S.hints[stage.id] = Math.max(S.hints[stage.id] || 0, shown);
      save(); sfx('low'); render();
      more.textContent = shown >= 3 ? '全て表示済み' : '次のヒントを開く';
    };
    const cl = el('button', 'btn', '閉じる');
    cl.onclick = close;
    row.appendChild(more); row.appendChild(cl);
    card.appendChild(row);
  });
};

$('btn-back').onclick = () => show('select');
$('btn-undo').onclick = () => {
  if (S.rootRules.noUndo && !stage.nullStage) { sfx('err'); return; }
  doAction({ type: 'undo' });
};
$('btn-reset').onclick = () => { newGame(true); sfx('ui'); };
$('rot-handle').onclick = () => doUI('rotate', { by: stage.rotate_step ?? 90 });

// ---------------------------------------------------------------- actions

function doUI(name, args = {}) { doAction({ type: 'ui', name, args }); }

function doAction(action) {
  if (!game) return;
  const before = game.s.turn;
  const res = game.apply(action);
  if (res && res.reason === 'not available') { sfx('err'); shakeBoard(); }
  else if (action.type === 'move' && res && res.moved) sfx('step');
  drainEvents();
  buildHud();
  buildNote();
  buildTray();
  draw();
  if (game.s.dead) died();
  else if (game.s.won) cleared();
  if (game.s.turn !== before) save();
}

function drainEvents() {
  for (const e of game.drain()) {
    switch (e.t) {
      case 'sound': sfx(e.name); break;
      case 'flash': flash(e.text); break;
      case 'observe': {
        const list = (S.notes[stage.id] = S.notes[stage.id] || []);
        if (!list.includes(e.text)) { list.push(e.text); save(); }
        break;
      }
      case 'win': sfx('win'); break;
      case 'dead': sfx('dead'); break;
      case 'uiRefused': sfx('err'); shakeBoard(); break;
      case 'unlock': if (e.stage) { S.unlocked[e.stage] = true; saveNow(); } break;
      default: break;
    }
  }
  S.globals = game.globals;
  save();
}

function flash(text) {
  const f = $('flash');
  f.textContent = text || '';
  f.classList.remove('on');
  void f.offsetWidth;
  f.classList.add('on');
}

function shakeBoard() {
  const w = $('board-wrap');
  w.classList.add('shake');
  setTimeout(() => w.classList.remove('shake'), 200);
}

function died() {
  overlay((card, close) => {
    card.appendChild(el('h2', null, 'CAUGHT'));
    card.appendChild(el('p', null, '接触した。盤面を巻き戻す。'));
    const row = el('div', 'row');
    const u = el('button', 'btn', 'UNDO');
    u.onclick = () => { close(); game.s.dead = false; doAction({ type: 'undo' }); };
    const r = el('button', 'btn', 'RESET');
    r.onclick = () => { close(); newGame(true); };
    row.appendChild(u); row.appendChild(r); card.appendChild(row);
  });
}

function cleared() {
  const first = !S.cleared[stage.id];
  S.cleared[stage.id] = true;
  saveNow();
  const idx = MAIN_IDS.indexOf(stage.id);
  const next = idx >= 0 ? MAIN_IDS[idx + 1] : null;
  overlay((card, close) => {
    card.classList.add('discovered');
    card.appendChild(el('h2', null, 'CLEAR'));
    card.appendChild(el('div', 'big-word', stage.title));
    card.appendChild(el('p', null, `MOVES ${game.s.turn} / ${first ? '初クリア' : '再クリア'}`));
    if (allMainCleared() && !S.titleBroken) {
      card.appendChild(el('p', null, '全ステージ 100%。タイトル画面へ戻ってみろ。'));
    }
    const row = el('div', 'row');
    if (next) {
      const b = el('button', 'btn', 'NEXT');
      b.onclick = () => { close(); startStage(next); };
      row.appendChild(b);
    }
    const m = el('button', 'btn', 'MAP');
    m.onclick = () => { close(); show('select'); };
    const t = el('button', 'btn', 'TITLE');
    t.onclick = () => { close(); show('title'); };
    row.appendChild(m); row.appendChild(t);
    card.appendChild(row);
  });
}

// ---------------------------------------------------------------- input

let ptr = null;
let pinch = null;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (ptr && !pinch) {
    pinch = { d0: dist(ptr, e), a: ptr, b: e };
    return;
  }
  ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() };
});

canvas.addEventListener('pointermove', (e) => {
  if (pinch && e.pointerId !== pinch.a.id) pinch.b = e;
});

canvas.addEventListener('pointerup', (e) => {
  if (pinch) {
    const d1 = dist(pinch.a, e);
    if (Math.abs(d1 - pinch.d0) > 40) doUI('zoom');
    pinch = null; ptr = null;
    return;
  }
  if (!ptr) return;
  const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
  const ad = Math.abs(dx), ay = Math.abs(dy);
  ptr = null;
  if (Math.max(ad, ay) > 22) {
    doAction({ type: 'move', dir: ad > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up') });
  } else {
    tapCell(e.clientX, e.clientY);
  }
});
canvas.addEventListener('pointercancel', () => { ptr = null; pinch = null; });

function dist(a, b) { return Math.hypot(a.x - b.clientX, a.y - b.clientY); }

let lastTap = 0;
function tapCell(cx, cy) {
  const now = Date.now();
  const dbl = now - lastTap < 300;
  lastTap = now;
  if (dbl && game.allows('zoom')) { doUI('zoom'); return; }
  const { x, y } = renderer.cellAt(cx, cy);
  const word = game.objsAt(x, y).find((o) => o.kind === 'word');
  if (selectedWord && !word && game.allows('wordDrag')) {
    doAction({ type: 'ui', name: 'wordDrag', args: { ref: '#' + selectedWord, x, y } });
    selectedWord = null;
    buildTray(); draw();
    return;
  }
  if (word) {
    selectedWord = selectedWord === word.id ? null : word.id;
    sfx('ui');
    buildTray(); draw();
    return;
  }
  selectedWord = null;
  buildTray(); draw();
}

window.addEventListener('keydown', (e) => {
  if (!$('screen-play').classList.contains('active')) return;
  const k = e.key.toLowerCase();
  const map = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  if (map[k]) { e.preventDefault(); doAction({ type: 'move', dir: map[k] }); }
  else if (k === 'z') doAction({ type: 'undo' });
  else if (k === 'r') newGame(true);
});

// ---------------------------------------------------------------- dragging UI

let drag = null;
const ghost = $('drag-ghost');

function beginDrag(e, payload) {
  if (!game) return;
  if (payload.type === 'item' && !game.allows('dropUI')) return;
  if (payload.type === 'char' && !game.allows('dropChar')) return;
  e.preventDefault();
  drag = payload;
  ghost.textContent = payload.value;
  ghost.classList.remove('hidden');
  moveGhost(e);
  sfx('ui');
}

function moveGhost(e) {
  ghost.style.left = e.clientX + 'px';
  ghost.style.top = e.clientY + 'px';
}

window.addEventListener('pointermove', (e) => { if (drag) { moveGhost(e); e.preventDefault(); } }, { passive: false });

window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const payload = drag;
  drag = null;
  ghost.classList.add('hidden');
  const r = canvas.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
  const { x, y } = renderer.cellAt(e.clientX, e.clientY);
  if (payload.type === 'item') {
    doAction({ type: 'ui', name: 'dropUI', args: { item: payload.value, x, y } });
  } else {
    const target = game.objsAt(x, y).find((o) => o.label !== undefined);
    if (!target) { sfx('err'); return; }
    // Left half of the cell puts the digit in front, right half behind.
    const rect = renderer.cellRect(x, y);
    const localX = ((e.clientX - r.left) * renderer.dpr - rect.x) / rect.s;
    doAction({ type: 'ui', name: 'dropChar',
      args: { char: payload.value, ref: '#' + target.id, mode: localX < 0.5 ? 'prepend' : 'append' } });
  }
});

for (const b of document.querySelectorAll('.ui-drag')) {
  b.addEventListener('pointerdown', (e) => {
    if (game && game.allows('dropUI')) beginDrag(e, { type: 'item', value: b.dataset.item });
  });
}

// ---------------------------------------------------------------- loop

function draw() {
  if (!game) return;
  renderer.draw(game, { selectedWord });
}

window.addEventListener('resize', () => { renderer.resize(); draw(); });
window.addEventListener('orientationchange', () => setTimeout(() => { renderer.resize(); draw(); }, 200));
window.addEventListener('beforeunload', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

// Handle used by the automated browser tests and by editor.html.
window.RB = {
  get game() { return game; },
  get stage() { return stage; },
  renderer,
  startStage,
  cellCenter: (x, y) => renderer.screenOf(x, y),
  save: S,
};

refreshTitle();
show('title');
