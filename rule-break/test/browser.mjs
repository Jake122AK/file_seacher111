// End-to-end test of the parts the headless engine tests cannot reach:
// swipes, the RULE NOTE hypothesis panel, pinch/zoom, rotation, dragging UI
// text onto the board, cutting a word in half, and the stage-number surgery.
//
//   node test/browser.mjs [baseUrl]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOTS = process.env.RB_SHOTS || null;

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, why = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (why ? ': ' + why : '')); console.log('  FAIL ' + name + ' ' + why); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Unlock everything so any stage can be opened directly.
await page.addInitScript(() => {
  if (localStorage.getItem('rulebreak.save.v1')) return;   // keep progress across reloads
  const cleared = {};
  for (let i = 1; i <= 46; i++) cleared[String(i)] = true;
  localStorage.setItem('rulebreak.save.v1', JSON.stringify({
    version: 1, cleared, discovered: {}, notes: {}, globals: {},
    unlocked: { 47: true, 'NULL-1': true, 'NULL-2': true, 'NULL-3': true },
    hints: {}, titleBroken: false, rootRules: {}, muted: true, lastStage: '1',
  }));
});

await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });

const openStage = async (id) => {
  await page.evaluate((sid) => window.RB.startStage(sid), id);
  await page.waitForTimeout(150);
};
const key = async (k, n = 1) => {
  for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(45); }
};
const won = () => page.evaluate(() => !!window.RB.game.s.won);
const closeOverlay = async () => {
  await page.evaluate(() => {
    const o = document.getElementById('overlay');
    o.classList.add('hidden'); o.innerHTML = '';
  });
};
const cellPoint = (x, y) => page.evaluate(([cx, cy]) => window.RB.cellCenter(cx, cy), [x, y]);
const dragTo = async (fromSel, x, y) => {
  const from = await page.locator(fromSel).first().boundingBox();
  const to = await cellPoint(x, y);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
};
const swipe = async (dir) => {
  const b = await page.locator('#board').boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const d = { right: [90, 0], left: [-90, 0], up: [0, -90], down: [0, 90] }[dir];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + d[0], cy + d[1], { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(90);
};

console.log('\nRULE//BREAK browser tests');

// --- swipe input ----------------------------------------------------------
await openStage('1');
for (let i = 0; i < 4; i++) await swipe('right');
check('stage 1 clears by swiping', await won());
await closeOverlay();

// --- the RULE NOTE hypothesis panel --------------------------------------
await openStage('3');
await key('ArrowDown', 2);
const tokens = ['床', '2', '回', '壁'];
for (const t of tokens) await page.locator('.token', { hasText: new RegExp('^' + t + '$') }).first().click();
await page.locator('#btn-guess').click();
await page.waitForTimeout(200);
const discovered = await page.locator('#overlay').innerText().catch(() => '');
check('correct hypothesis is accepted', discovered.includes('RULE DISCOVERED'), discovered.slice(0, 60));
await closeOverlay();
check('discovered rule is stored', await page.evaluate(() => !!window.RB.save.discovered.R_TRACE));
await page.locator('#btn-guess-clear').click();
await page.locator('.token').first().click();
await page.locator('#btn-guess').click();
await page.waitForTimeout(150);
check('wrong hypothesis is rejected', await page.locator('#overlay').isHidden());

// --- hints ----------------------------------------------------------------
await page.locator('#btn-hint').click();
await page.waitForTimeout(120);
await page.locator('#overlay >> text=次のヒントを開く').click();
const hintText = await page.locator('#overlay').innerText();
check('hint 1 opens and hint 3 stays hidden',
  hintText.includes('道が減っていないか') && hintText.includes('- - - - -'));
await closeOverlay();

// --- LEVEL 5: pinch/zoom out to find the world outside the frame ----------
await openStage('32');
const blockedBefore = await page.evaluate(() => {
  const g = window.RB.game;
  for (let i = 0; i < 5; i++) g.apply({ type: 'move', dir: 'down' });
  return g.playerY;
});
check('stage 32 refuses to leave the visible frame', blockedBefore === 3, 'y=' + blockedBefore);
const c1 = await cellPoint(4, 2);
await page.mouse.click(c1.x, c1.y);
await page.mouse.click(c1.x, c1.y);   // double tap = zoom out
await page.waitForTimeout(150);
check('double tap zooms the board out', await page.evaluate(() => !!window.RB.game.s.flags.zoomed));
await key('ArrowRight', 6); await key('ArrowDown', 6); await key('ArrowRight', 4);
check('stage 32 clears once the world is revealed', await won());
await closeOverlay();

// --- LEVEL 5: rotating the board, but only on the pivot -------------------
await openStage('33');
await page.locator('#rot-handle').click();          // not on a pivot yet
await page.waitForTimeout(100);
check('the board refuses to turn off the pivot',
  await page.evaluate(() => window.RB.game.s.rot) === 0);
await key('ArrowRight', 6);
await page.locator('#rot-handle').click();
await page.waitForTimeout(120);
check('the pivot turns the board half a turn',
  await page.evaluate(() => window.RB.game.s.rot) === 180);
await key('ArrowRight', 6);
await key('ArrowLeft', 6);
await page.locator('#rot-handle').click();
await page.waitForTimeout(120);
check('stage 33 clears only once the world is upright again', await won());
await closeOverlay();

// --- LEVEL 5: the stage title is an object --------------------------------
await openStage('34');
for (let i = 0; i < 3; i++) { await page.locator('#hud-title').click(); await page.waitForTimeout(80); }
check('tapping the title spawns the goal',
  await page.evaluate(() => window.RB.game.s.objs.some((o) => o.kind === 'goal')));
await key('ArrowRight', 6); await key('ArrowDown', 2); await key('ArrowLeft', 6);
await key('ArrowDown', 2); await key('ArrowRight', 6);
check('stage 34 clears', await won());
await closeOverlay();

// --- LEVEL 5: the note panel is covering the board ------------------------
await openStage('35');
await page.locator('#note-close').click();
await page.waitForTimeout(120);
check('closing RULE NOTE frees the hidden rows',
  await page.evaluate(() => !!window.RB.game.s.flags.noteClosed));
await key('ArrowRight', 6); await key('ArrowDown', 5);
check('stage 35 clears', await won());
await closeOverlay();

// --- LEVEL 5: dragging a UI button onto the board -------------------------
await openStage('36');
await dragTo('#btn-reset', 3, 2);
await dragTo('#btn-undo', 4, 2);
check('RESET and UNDO can both be dropped into the world',
  await page.evaluate(() => window.RB.game.s.objs.filter((o) => o.kind === 'word').length) === 2);
await key('ArrowRight', 6);
check('stage 36 clears', await won());
await closeOverlay();

// --- LEVEL 6: pulling a digit out of MOVES --------------------------------
await openStage('37');
await key('ArrowRight', 6); await key('ArrowDown', 2); await key('ArrowLeft', 6);
const moves = await page.locator('#hud-moves').innerText();
check('MOVES reads 14 at the door', moves.replace(/\s/g, '') === 'MOVES14', moves);
const one = page.locator('#hud-moves .ch.grabbable').first();
const p1 = await one.boundingBox();
const doorPt = await cellPoint(1, 4);
// Dropped dead centre: the door's own slot decides where the digit lands,
// never the exact pixel the finger let go on.
await page.mouse.move(p1.x + p1.width / 2, p1.y + p1.height / 2);
await page.mouse.down();
await page.mouse.move(doorPt.x, doorPt.y, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
check('DOOR 4 becomes DOOR 14 wherever the digit is dropped',
  await page.evaluate(() => window.RB.game.byRef('#door1').label) === '14');
check('the door shows its empty slot before it is filled',
  await page.evaluate(() => {
    const g = new window.RB.game.constructor(window.RB.stage, { globals: {} });
    const d = g.byRef('#door1');
    return d.slot === 'pre' && !d.filled;
  }));
await key('ArrowDown', 2);
check('stage 37 clears', await won());
await closeOverlay();

// --- LEVEL 6: cutting RESET into RE and SET -------------------------------
await openStage('38');
await dragTo('#btn-reset', 2, 1);
const wordPt = await cellPoint(2, 1);
await page.mouse.click(wordPt.x, wordPt.y);          // select it to reveal the cut points
await page.waitForTimeout(120);
const cut = page.locator('#tray .word-chip', { hasText: 'RE|SET' });
await cut.click();
await page.waitForTimeout(120);
check('RESET splits into RE and SET',
  await page.evaluate(() => window.RB.game.s.objs.some((o) => o.text === 'SET')));
const setPt = await page.evaluate(() => {
  const o = window.RB.game.s.objs.find((q) => q.text === 'SET');
  return window.RB.cellCenter(o.x, o.y);
});
await page.mouse.click(setPt.x, setPt.y);           // select the word
const socket = await cellPoint(6, 1);
await page.mouse.click(socket.x, socket.y);          // and place it in the socket
await page.waitForTimeout(120);
check('SET can be carried into the socket',
  await page.evaluate(() => window.RB.game.s.objs.some((o) => o.text === 'SET' && o.x === 6 && o.y === 1)));
await key('ArrowRight', 6); await key('ArrowDown', 2);
check('stage 38 clears', await won());
await closeOverlay();

// --- FINAL: writing the world into existence ------------------------------
await openStage('FINAL');
const drop = async (word, x, y) => {
  const chip = page.locator('#tray .word-chip', { hasText: new RegExp('^' + word.replace('=', '\\=') + '$') }).first();
  const b = await chip.boundingBox();
  const to = await cellPoint(x, y);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(110);
};
await drop('PLAYER', 1, 1); await drop('EXISTS', 2, 1);
check('PLAYER EXISTS brings a player into being',
  await page.evaluate(() => window.RB.game.s.objs.some((o) => o.kind === 'player')));
await drop('GOAL', 1, 3); await drop('EXISTS', 2, 3);
await drop('PLAYER', 1, 5); await drop('=', 2, 5); await drop('GOAL', 3, 5);
check('FINAL clears when the player writes the rules', await won());
if (SHOTS) await page.screenshot({ path: SHOTS + '/shot-final.png' });
await closeOverlay();

// --- title break and stage-number surgery ---------------------------------
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('rulebreak.save.v1'));
  raw.cleared['47'] = true;
  localStorage.setItem('rulebreak.save.v1', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(200);
const slashLive = await page.locator('#logo-slash').evaluate((n) => n.classList.contains('live'));
check('the // starts blinking at 100%', slashLive);
await page.locator('#logo-slash').click();
await page.waitForTimeout(200);
check('breaking the title unlocks ROOT RULES', await page.locator('#overlay').innerText().then((t) => t.includes('RULE BREAK')));
await closeOverlay();
check('NULL stages are unlocked', await page.evaluate(() => !!window.RB.save.unlocked['NULL-1']));
if (SHOTS) await page.screenshot({ path: SHOTS + '/shot-title-broken.png' });

await page.locator('#btn-map').click();
await page.waitForTimeout(200);
const node24 = page.locator('.node', { hasText: /^24$/ }).first();
const box24 = await node24.boundingBox();
await page.mouse.move(box24.x + box24.width / 2, box24.y + box24.height / 2);
await page.mouse.down();
await page.waitForTimeout(700);          // long press
await page.mouse.up();
await page.waitForTimeout(200);
check('long press offers the digits of stage 24',
  await page.locator('#overlay').innerText().then((t) => t.includes('STAGE 24')));
await page.locator('#overlay .btn.big', { hasText: '4' }).click();
await page.waitForTimeout(150);
const node7 = page.locator('.node', { hasText: /^7$/ }).first();
await node7.click();
await page.waitForTimeout(250);
const fusion = await page.locator('#overlay').innerText().catch(() => '');
check('4 dropped on 7 generates STAGE 47', fusion.includes('47'), fusion.slice(0, 60));
if (SHOTS) await page.screenshot({ path: SHOTS + '/shot-fusion.png' });
await closeOverlay();

check('no uncaught JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n${pass}/${pass + fail} browser checks passed`);
if (fail) { console.log('FAILURES:\n  - ' + failures.join('\n  - ')); await browser.close(); process.exit(1); }
await browser.close();
