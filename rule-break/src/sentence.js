// sentence.js -- the rule sentences that literally sit on the board.
//
// From LEVEL 6 onward the board carries word blocks such as
//   WALL IS SOLID / GOAL = CLEAR / PLAYER EXISTS
// and those sentences *are* the engine's configuration. Push a word out of a
// line and the world loses that law.
//
// Grammar (a sentence is a run of >=2 adjacent word blocks, read left-to-right
// on a row or top-to-bottom on a column):
//
//   NOUN IS PROP           WALL IS SOLID
//   NOUN IS NOUN           BOX IS WALL          (transform)
//   NOUN = PROP            GOAL = CLEAR
//   NOUN = NOUN            PLAYER = GOAL        (identity)
//   NOUN CAN VERB          PLAYER CAN MOVE
//   NOUN EXISTS            PLAYER EXISTS
//   IGNORE NEXT RULE       directive
//   IGNORE PREVIOUS RULE   directive
//   THIS RULE IS FALSE     self-referential paradox
//
// Evaluation order is top-to-bottom, then left-to-right. The order is never
// explained to the player; LEVEL 7 is about deducing it.

export const NOUNS = new Set([
  'PLAYER', 'WALL', 'BOX', 'GOAL', 'KEY', 'DOOR', 'ENEMY', 'GHOST', 'TEXT',
  'RED', 'BLUE', 'FLOOR', 'RULE', 'STAGE',
]);

export const PROPS = new Set([
  'SOLID', 'PUSH', 'WIN', 'YOU', 'STOP', 'OPEN', 'SHUT', 'CLEAR', 'FALSE',
  'FLOAT', 'DEAD', 'SAFE', 'WEAK',
]);

export const VERBS = new Set(['MOVE', 'PASS', 'UNDO', 'PUSH', 'WIN']);

// Which kind of board object a noun refers to. Tile nouns map to tile types.
// A noun can cover more than one tile type: BLUE means both the blue floor
// and the blue wall.
export const NOUN_TILE = {
  WALL: ['wall'], RED: ['redwall'], BLUE: ['bluewall', 'bluefloor'], FLOOR: ['floor'],
};
export const nounForTile = (type) => Object.keys(NOUN_TILE).find((n) => NOUN_TILE[n].includes(type));
export const NOUN_OBJ = {
  PLAYER: 'player', BOX: 'box', GOAL: 'goal', KEY: 'key',
  DOOR: 'door', ENEMY: 'enemy', GHOST: 'ghost', TEXT: 'word',
};

export function baseSemantics() {
  return {
    props: {},        // NOUN -> Set(PROP)
    can: {},          // NOUN -> Set(VERB)
    ident: [],        // [A, B] pairs from "A = B"
    exists: new Set(),// nouns forced to exist
    sentences: [],    // human readable list of the sentences in force
    paradox: false,   // a THIS RULE IS FALSE is on the board
  };
}

function addProp(sem, noun, prop) {
  (sem.props[noun] || (sem.props[noun] = new Set())).add(prop);
}
function addCan(sem, noun, verb) {
  (sem.can[noun] || (sem.can[noun] = new Set())).add(verb);
}

export function hasProp(sem, noun, prop) {
  return !!(sem.props[noun] && sem.props[noun].has(prop));
}
export function canDo(sem, noun, verb) {
  return !!(sem.can[noun] && sem.can[noun].has(verb));
}

// Collect maximal runs of adjacent word objects.
function runs(words, w, h) {
  const at = new Map();
  for (const o of words) at.set(o.x + ',' + o.y, o);
  const out = [];
  const scan = (get, len1, len2) => {
    for (let a = 0; a < len1; a++) {
      let run = [];
      for (let b = 0; b < len2; b++) {
        const o = get(a, b);
        if (o) run.push(o);
        else {
          if (run.length >= 2) out.push(run);
          run = [];
        }
      }
      if (run.length >= 2) out.push(run);
    }
  };
  scan((y, x) => at.get(x + ',' + y), h, w);       // rows
  scan((x, y) => at.get(x + ',' + y), w, h);       // columns
  return out;
}

// Split a run of words into the sentences it contains.
function sentencesIn(run) {
  const t = run.map((o) => String(o.text).toUpperCase());
  const out = [];
  let i = 0;
  while (i < t.length) {
    const rest = t.length - i;
    const take = (n, kind) => {
      out.push({ kind, words: t.slice(i, i + n), objs: run.slice(i, i + n), text: t.slice(i, i + n).join(' ') });
      i += n;
    };
    if (rest >= 4 && t[i] === 'THIS' && t[i + 1] === 'RULE' && t[i + 2] === 'IS' && t[i + 3] === 'FALSE') { take(4, 'paradox'); continue; }
    if (rest >= 3 && t[i] === 'IGNORE' && (t[i + 1] === 'NEXT' || t[i + 1] === 'PREVIOUS') && t[i + 2] === 'RULE') { take(3, 'ignore'); continue; }
    if (rest >= 3 && (t[i + 1] === 'IS' || t[i + 1] === '=') && (PROPS.has(t[i + 2]) || NOUNS.has(t[i + 2]))) {
      if (NOUNS.has(t[i])) { take(3, t[i + 1] === '=' ? 'eq' : 'is'); continue; }
    }
    if (rest >= 3 && t[i + 1] === 'CAN' && VERBS.has(t[i + 2]) && NOUNS.has(t[i])) { take(3, 'can'); continue; }
    if (rest >= 2 && t[i + 1] === 'EXISTS' && NOUNS.has(t[i])) { take(2, 'exists'); continue; }
    i++; // this word is not part of any sentence -- yet
  }
  return out;
}

// Parse the board's word blocks into an ordered, directive-resolved rule list.
export function parseSentences(words, w, h, evalTick = 0) {
  const found = [];
  for (const run of runs(words, w, h)) {
    for (const s of sentencesIn(run)) {
      const first = s.objs[0];
      found.push({ ...s, y: first.y, x: first.x });
    }
  }
  // Reading order: top to bottom, then left to right.
  found.sort((a, b) => (a.y - b.y) || (a.x - b.x));

  // Directives suppress their neighbours. Resolved in reading order, so
  // IGNORE NEXT RULE beats an IGNORE PREVIOUS RULE placed below it.
  const dead = new Set();
  found.forEach((s, i) => {
    if (s.kind !== 'ignore' || dead.has(i)) return;
    if (s.words[1] === 'NEXT') {
      for (let j = i + 1; j < found.length; j++) if (!dead.has(j)) { dead.add(j); break; }
    } else {
      for (let j = i - 1; j >= 0; j--) if (!dead.has(j)) { dead.add(j); break; }
    }
  });

  // A paradox flips state every evaluation tick: true, false, true, ...
  const paradoxOn = evalTick % 2 === 0;
  found.forEach((s, i) => {
    if (s.kind === 'paradox' && !paradoxOn) {
      for (let j = i + 1; j < found.length; j++) if (!dead.has(j)) { dead.add(j); break; }
    }
  });

  const active = found.filter((_, i) => !dead.has(i));
  return { all: found, active, dead };
}

export function semanticsFrom(words, w, h, evalTick = 0, defaults = null) {
  const sem = baseSemantics();
  const parsed = parseSentences(words, w, h, evalTick);

  if (defaults) {
    for (const [n, ps] of Object.entries(defaults.props || {})) for (const p of ps) addProp(sem, n, p);
    for (const [n, vs] of Object.entries(defaults.can || {})) for (const v of vs) addCan(sem, n, v);
    for (const pair of defaults.ident || []) sem.ident.push(pair);
    for (const n of defaults.exists || []) sem.exists.add(n);
  }

  for (const s of parsed.active) {
    sem.sentences.push(s.text);
    if (s.kind === 'is' || s.kind === 'eq') {
      const [a, , c] = s.words;
      if (PROPS.has(c)) addProp(sem, a, c);
      else if (s.kind === 'eq') sem.ident.push([a, c]);
      else sem.ident.push([a, c]); // BOX IS WALL behaves as a transform too
    } else if (s.kind === 'can') {
      addCan(sem, s.words[0], s.words[2]);
    } else if (s.kind === 'exists') {
      sem.exists.add(s.words[0]);
    } else if (s.kind === 'paradox') {
      sem.paradox = true;
    }
  }
  sem.parsed = parsed;
  return sem;
}

export function identityHolds(sem, a, b) {
  return sem.ident.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
