// Authoring aid: replay a stage step by step and print the board.
//   node test/play.mjs 9 D,R,R,R
//   node test/play.mjs 9            (uses the stage's recorded solution)
import { Game } from '../src/engine.js';
import { stageById } from '../src/stages/index.js';
import { parseAction } from './actions.mjs';

const [, , id, list, globalsJson] = process.argv;
const stage = stageById(id);
if (!stage) { console.error('no such stage: ' + id); process.exit(1); }
const globals = globalsJson ? JSON.parse(globalsJson) : { ...(stage.test_globals || {}) };
const acts = (list ? list.split(',') : stage.solution || []).filter(Boolean);

const g = new Game(stage, { globals });
const GLYPH = { player: '@', goal: 'O', box: 'B', key: 'k', door: 'D', enemy: 'E', switch: 's', ghost: 'g', word: 'W' };

function draw(label) {
  const rows = [];
  for (let y = 0; y < g.s.h; y++) {
    let r = '';
    for (let x = 0; x < g.s.w; x++) {
      const os = g.objsAt(x, y);
      if (os.length) { r += GLYPH[os[os.length - 1].kind] || '?'; continue; }
      const t = g.tileAt(x, y);
      r += { wall: '#', floor: '.', void: ' ', redwall: 'r', glass: 'g', bluefloor: 'b',
        yellowfloor: 'y', hole: 'o', grate: '=', ice: 'i', bluewall: 'B', }[t] || '?';
    }
    rows.push(r);
  }
  console.log(`--- ${label}  moves=${g.s.turn} undos=${g.meta.undos} won=${g.s.won} dead=${g.s.dead}`);
  console.log(rows.join('\n'));
}

draw('start');
acts.forEach((a, i) => {
  g.apply(parseAction(a));
  draw(`${i + 1}: ${a}`);
});
const notes = g.s.note;
if (notes.length) console.log('\nRULE NOTE:\n' + notes.map((n) => '  ' + n).join('\n'));
console.log('\nRESULT:', g.s.won ? 'CLEAR' : (g.s.dead ? 'DEAD' : 'unsolved'));
