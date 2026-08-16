// Breadth-first search over the real engine. Used while authoring to prove a
// stage is solvable (and to find the shortest route through it).
//   node test/solve.mjs 11            -- moves only
//   node test/solve.mjs 11 24 U,D,L,R,Z
import { Game } from '../src/engine.js';
import { stageById } from '../src/stages/index.js';
import { parseAction } from './actions.mjs';

const [, , id, maxDepthArg, alphabetArg] = process.argv;
const stage = stageById(id);
if (!stage) { console.error('no such stage: ' + id); process.exit(1); }
const maxDepth = +(maxDepthArg || 24);
const alphabet = (alphabetArg || 'U,D,L,R').split(',');

const key = (g) => JSON.stringify([
  g.s.tiles, g.s.objs.map((o) => [o.kind, o.x, o.y, o.pushed || 0, o.i || 0]),
  g.s.turn, g.s.facing, g.s.flags, g.s.keys, g.s.visits, g.meta.undos,
]);

function run(actions) {
  const g = new Game(stage, { globals: { ...(stage.test_globals || {}) } });
  for (const a of actions) g.apply(parseAction(a));
  return g;
}

let frontier = [[]];
const seen = new Set([key(run([]))]);
for (let depth = 1; depth <= maxDepth; depth++) {
  const next = [];
  for (const path of frontier) {
    for (const a of alphabet) {
      const acts = [...path, a];
      const g = run(acts);
      if (g.s.dead) continue;
      if (g.s.won) { console.log('SOLVED in ' + acts.length + ':\n' + JSON.stringify(acts)); process.exit(0); }
      const k = key(g);
      if (seen.has(k)) continue;
      seen.add(k);
      next.push(acts);
    }
  }
  frontier = next;
  console.error(`depth ${depth}: ${frontier.length} states`);
  if (!frontier.length) break;
}
console.log('no solution within depth ' + maxDepth);
process.exit(1);
