// How often does a player who understands nothing clear the stage anyway?
//
// Runs a large number of random playthroughs per stage and reports the
// accidental-clear rate. A stage that a flailing monkey solves is a stage
// that teaches nothing, so this is a design test, not a correctness test.
//
//   node test/monkey.mjs            all stages
//   node test/monkey.mjs 4 9 17     just these
import { Game } from '../src/engine.js';
import { STAGES, stageById } from '../src/stages/index.js';
import { parseAction } from './actions.mjs';

const TRIALS = +(process.env.RB_TRIALS || 4000);
const only = process.argv.slice(2);

// A deterministic RNG so the numbers are reproducible between runs.
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];

const MOVES = [{ type: 'move', dir: 'up' }, { type: 'move', dir: 'down' },
  { type: 'move', dir: 'left' }, { type: 'move', dir: 'right' }];

function monkeyActions(stage) {
  // What a bored thumb can produce: swipes, plus undo, plus whatever screen
  // gestures this stage happens to accept (the monkey pokes those too).
  const acts = [...MOVES, ...MOVES, ...MOVES, { type: 'undo' }];
  for (const name of stage.available_ui_actions || []) {
    if (['undo', 'reset'].includes(name)) continue;
    if (name === 'dropUI') {
      for (const w of (stage.ui_words || ['RESET', 'UNDO'])) {
        acts.push({ type: 'ui', name: 'dropUI', args: { item: w, x: 1 + Math.floor(rnd() * 5), y: 1 + Math.floor(rnd() * 4) } });
      }
    } else if (name === 'dropChar') {
      acts.push({ type: 'ui', name: 'dropChar', args: { char: String(Math.floor(rnd() * 10)), ref: 'door', mode: 'append' } });
    } else if (name === 'wordDrag' || name === 'splitWord') {
      acts.push({ type: 'ui', name, args: { ref: 'word', x: 1 + Math.floor(rnd() * 5), y: 1 + Math.floor(rnd() * 4), at: 2 } });
    } else {
      acts.push({ type: 'ui', name, args: {} });
    }
  }
  return acts;
}

function run(stage, budget) {
  const acts = monkeyActions(stage);
  let clears = 0, firstClearAt = null;
  for (let t = 0; t < TRIALS; t++) {
    const g = new Game(stage, { globals: { ...(stage.test_globals || {}) } });
    for (let i = 0; i < budget; i++) {
      const a = acts[Math.floor(rnd() * acts.length)];
      // re-randomise the coordinates of drag-style pokes each time
      const act = a.args ? { ...a, args: { ...a.args, x: 1 + Math.floor(rnd() * (g.s.w - 2)), y: 1 + Math.floor(rnd() * (g.s.h - 2)) } } : a;
      g.apply(act);
      if (g.s.won) { clears++; if (firstClearAt === null) firstClearAt = i + 1; break; }
      if (g.s.dead) break;
    }
  }
  return { rate: clears / TRIALS, firstClearAt };
}

const list = (only.length ? only.map(stageById).filter(Boolean) : STAGES);
const rows = [];
for (const st of list) {
  const solLen = (st.solution || []).length;
  // Give the monkey three times the length of the intended solution, and
  // never less than 30 inputs.
  const budget = Math.max(30, solLen * 3);
  const { rate } = run(st, budget);
  rows.push({ id: st.id, title: st.title, solLen, budget, rate });
}

rows.sort((a, b) => b.rate - a.rate);
console.log('\n偶然クリア率 (ランダム操作 x ' + TRIALS + '回)\n');
console.log('  rate    stage  sol  budget  title');
for (const r of rows) {
  const flag = r.rate >= 0.20 ? ' <-- 適当でも解ける'
    : r.rate >= 0.05 ? ' <-- 甘い' : '';
  console.log(`  ${(r.rate * 100).toFixed(1).padStart(5)}%  ${String(r.id).padEnd(6)} ${String(r.solLen).padStart(3)}  ${String(r.budget).padStart(6)}  ${r.title}${flag}`);
}
const bad = rows.filter((r) => r.rate >= 0.05 && r.id !== '1');
console.log(`\n甘いステージ: ${bad.length} / ${rows.length}`);
if (process.env.RB_STRICT && bad.length) process.exit(1);
