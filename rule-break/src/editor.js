// editor.js -- author a stage as JSON, replay its solution, and install it
// into the game. No engine changes are ever needed to add a puzzle.

import { Game } from './engine.js';
import { STAGES } from './stages/index.js';
import { Renderer } from './render.js';

const $ = (id) => document.getElementById(id);
const CUSTOM_KEY = 'rulebreak.custom.v1';

const TEMPLATE = {
  id: 'X1',
  title: 'NEW STAGE',
  grid: {
    rows: ['#########', '#.......#', '#.......#', '#.......#', '#########'],
    legend: { r: { type: 'redwall', solid: { op: '==', a: { v: 'parity' }, b: 1 } } },
  },
  objects: [{ kind: 'player', x: 1, y: 2 }, { kind: 'goal', x: 7, y: 2 }],
  marks: [],
  hidden_rules: [{
    id: 'X1_RULE',
    name: '右へ3回進むとゴールが1マス近づく',
    when: 'afterMove',
    if: { op: '==', a: { v: 'streak.right' }, b: 3 },
    then: [{ do: 'moveObj', ref: 'goal', dir: 'left', by: 1 }, { do: 'sound', name: 'low' }],
    note: '右へ3回 → 盤面のどこかが動いた',
    answer: ['右', '3', '回', 'ゴール', '動く'],
  }],
  rule_priority: ['X1_RULE'],
  turn_conditions: { countBlocked: false },
  win_conditions: [{ at: ['player', 'goal'] }],
  cross_stage_variables: { read: [], write: [] },
  available_ui_actions: ['undo', 'reset'],
  tokens: ['右', '3', '回', 'ゴール', '動く', '重力', '反転', '壁', '偶数', '手目'],
  hint_1: '考えるべき対象だけを示す。',
  hint_2: '関係する現象を示す。',
  hint_3: 'かなり具体的に。ただし答えそのものは書かない。',
  solution: ['R', 'R', 'R', 'R', 'R'],
};

const parseAction = (str) => {
  const M = { U: 'up', D: 'down', L: 'left', R: 'right' };
  if (M[str]) return { type: 'move', dir: M[str] };
  if (str === 'Z') return { type: 'undo' };
  if (str === 'X') return { type: 'reset' };
  if (str === 'W') return { type: 'wait' };
  if (String(str).startsWith('ui:')) {
    const [, name, rest] = String(str).split(':');
    const a = (rest || '').split(',');
    switch (name) {
      case 'wordDrag': return { type: 'ui', name, args: { ref: a[0], x: +a[1], y: +a[2] } };
      case 'dropUI': return { type: 'ui', name, args: { item: a[0], x: +a[1], y: +a[2] } };
      case 'dropChar': return { type: 'ui', name, args: { char: a[0], ref: a[1], mode: a[2] || 'append' } };
      case 'splitWord': return { type: 'ui', name, args: { ref: a[0], at: +a[1], x: +a[2], y: +a[3] } };
      default: return { type: 'ui', name, args: {} };
    }
  }
  throw new Error('未知の操作: ' + str);
};

const renderer = new Renderer($('ed-canvas'));
let game = null;

function log(msg, cls = 'dim') {
  $('log').className = cls;
  $('log').textContent = msg;
}

function currentStage() {
  return JSON.parse($('src').value);
}

function boot() {
  const sel = $('pick');
  for (const st of STAGES) {
    const o = document.createElement('option');
    o.value = st.id;
    o.textContent = `${st.id}  ${st.title}`;
    sel.appendChild(o);
  }
  $('src').value = JSON.stringify(TEMPLATE, null, 2);
  fresh();
}

function fresh() {
  try {
    const st = currentStage();
    game = new Game(st, { globals: {} });
    renderer.resize();
    renderer.draw(game, {});
    return true;
  } catch (e) {
    log('JSON か盤面の定義にエラー: ' + e.message, 'bad');
    return false;
  }
}

$('btn-load').onclick = () => {
  const st = STAGES.find((s) => String(s.id) === $('pick').value);
  if (!st) return;
  $('src').value = JSON.stringify(st, null, 2);
  fresh();
  log(`STAGE ${st.id} を読み込んだ。書き換えて「検証」。`, 'dim');
};
$('btn-new').onclick = () => { $('src').value = JSON.stringify(TEMPLATE, null, 2); fresh(); };
$('btn-fmt').onclick = () => {
  try { $('src').value = JSON.stringify(JSON.parse($('src').value), null, 2); log('整形した。', 'ok'); }
  catch (e) { log('JSON エラー: ' + e.message, 'bad'); }
};
$('btn-reset').onclick = () => { if (fresh()) log('初期化した。', 'dim'); };

$('btn-check').onclick = () => {
  let st;
  try { st = currentStage(); } catch (e) { return log('JSON エラー: ' + e.message, 'bad'); }
  const problems = [];
  if (!st.id) problems.push('id がない');
  if (!st.grid || !st.grid.rows || !st.grid.rows.length) problems.push('grid.rows がない');
  else {
    const w = st.grid.rows[0].length;
    if (!st.grid.rows.every((r) => r.length === w)) problems.push('grid.rows の長さが揃っていない');
  }
  if (!st.hint_1 || !st.hint_2 || !st.hint_3) problems.push('hint_1..3 のいずれかがない');
  if (!Array.isArray(st.solution) || !st.solution.length) problems.push('solution がない（検証できない）');
  if (problems.length) return log('NG:\n  - ' + problems.join('\n  - '), 'bad');

  const g = new Game(st, { globals: { ...(st.test_globals || {}) } });
  let stepInfo = '';
  try {
    st.solution.forEach((a, i) => {
      g.apply(parseAction(a));
      if (g.s.dead) throw new Error(`${i + 1}手目 (${a}) で死亡`);
    });
  } catch (e) { return log('NG: ' + e.message, 'bad'); }
  game = g;
  renderer.resize(); renderer.draw(g, {});
  stepInfo = `solution ${st.solution.length}手 / MOVES ${g.s.turn}`;
  if (g.s.won) log(`OK: クリア可能。${stepInfo}`, 'ok');
  else log(`NG: solution を再生してもクリアにならない。${stepInfo}`, 'bad');
};

$('btn-install').onclick = () => {
  let st;
  try { st = currentStage(); } catch (e) { return log('JSON エラー: ' + e.message, 'bad'); }
  const list = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
  const i = list.findIndex((s) => String(s.id) === String(st.id));
  if (i >= 0) list[i] = st; else list.push(st);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  log(`STAGE ${st.id} をゲームに追加した。ステージ選択の CUSTOM に出る。`, 'ok');
};

$('btn-clearcustom').onclick = () => {
  localStorage.removeItem(CUSTOM_KEY);
  log('追加ステージを全消去した。本編のセーブデータには触れていない。', 'ok');
};

for (const b of document.querySelectorAll('[data-mv]')) {
  b.onclick = () => {
    if (!game) return;
    const m = b.dataset.mv;
    game.apply(m === 'undo' ? { type: 'undo' } : { type: 'move', dir: m });
    renderer.draw(game, {});
    log(`MOVES ${game.s.turn}${game.s.won ? '  -- CLEAR' : ''}${game.s.dead ? '  -- DEAD' : ''}`,
      game.s.won ? 'ok' : 'dim');
  };
}

window.addEventListener('resize', () => { if (game) { renderer.resize(); renderer.draw(game, {}); } });
boot();
