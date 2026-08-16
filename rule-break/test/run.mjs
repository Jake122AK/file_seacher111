// Replays the recorded solution of every stage and asserts it clears.
// A puzzle nobody can solve is the one bug this game cannot afford.

import { Game } from '../src/engine.js';
import { STAGES, stageById } from '../src/stages/index.js';
import { parseAction } from './actions.mjs';

function playStage(stage, globals = {}, actions = null) {
  const g = new Game(stage, { globals });
  const list = actions || stage.solution || [];
  let step = 0;
  for (const a of list) {
    step++;
    const act = parseAction(a);
    g.apply(act);
    if (g.s.dead) return { g, ok: false, why: `died at step ${step} (${a})` };
  }
  return { g, ok: g.s.won, why: g.s.won ? '' : `not solved after ${list.length} actions (moves=${g.s.turn})` };
}

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, why = '') {
  if (cond) { pass++; } else { fail++; failures.push(`${name}: ${why}`); }
}

// --- every stage has the data an editor-driven game needs ------------------
for (const st of STAGES) {
  check(`stage ${st.id} has title`, !!st.title);
  check(`stage ${st.id} has hints`, !!(st.hint_1 && st.hint_2 && st.hint_3), 'missing hint tier');
  check(`stage ${st.id} grid non-empty`, st.grid && st.grid.rows && st.grid.rows.length > 0);
  const w = st.grid.w ?? st.grid.rows[0].length;
  check(`stage ${st.id} rows are rectangular`, st.grid.rows.every((r) => r.length === w),
    'row lengths ' + st.grid.rows.map((r) => r.length).join(','));
  check(`stage ${st.id} has a solution`, Array.isArray(st.solution) && st.solution.length > 0);
}

// --- solutions actually clear ---------------------------------------------
for (const st of STAGES) {
  if (!st.solution) continue;
  const globals = { ...(st.test_globals || {}) };
  let r;
  try { r = playStage(st, globals); } catch (e) { r = { ok: false, why: 'threw: ' + e.message }; }
  check(`solve ${st.id} (${st.title})`, r.ok, r.why);
}

// --- LEVEL 8: what happens in stage 40 must reach back into stage 12 -------
{
  const s40 = stageById('40'), s12 = stageById('12');
  if (s40 && s12) {
    const globals = {};
    // First visit to 40: unsolvable as-is, but it marks stage 12.
    playStage(s40, globals, s40.probe || []);
    check('stage 40 writes a cross-stage variable', Object.keys(globals).length > 0,
      'no global was set by the probe run');
    // Stage 12 now contains a box that was not there before.
    const before = new Game(s12, { globals: {} });
    const after = new Game(s12, { globals });
    check('stage 12 changes once 40 has been visited',
      after.s.objs.length !== before.s.objs.length,
      `objects ${before.s.objs.length} -> ${after.s.objs.length}`);
    // Solve 12 in its altered form, which unlocks the real route through 40.
    const r12 = playStage(s12, globals, s12.solution_after || s12.solution);
    check('stage 12 solvable in its altered form', r12.ok, r12.why);
    const r40 = playStage(s40, globals, s40.solution);
    check('stage 40 solvable after the round trip', r40.ok, r40.why);
  }
}

// --- the hidden stage 47 only exists once 24 and 7 have been joined -------
{
  const s47 = stageById('47');
  check('stage 47 exists as a hidden stage', !!s47 && s47.hidden === true, 'stage 47 must be hidden');
}

const total = pass + fail;
console.log(`\n${pass}/${total} checks passed`);
if (fail) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log(`stages: ${STAGES.length}`);
