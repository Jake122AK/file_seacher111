// expr.js -- tiny JSON expression language used by stage data.
//
// Everything a stage author needs to describe a hidden rule is expressed with
// these forms, so new stages never require engine code changes.
//
//   42                       literal
//   "text"                   literal
//   {v:"turn"}               read a context variable (dotted path allowed)
//   {op:"==", a:.., b:..}    operator
//   {op:"and", args:[..]}    n-ary and / or
//   {tileAt:[x,y]}           tile type name at a cell
//   {objAt:[x,y]}            kind of the topmost object at a cell ("" if none)
//   {countObj:"box"}         how many objects of a kind exist
//   {objProp:["box#1","x"]}  read a property of an object (by id or kind)
//   {visitsAt:[x,y]}         how many times the player stepped on a cell
//   {has:"WALL IS SOLID"}    is that rule sentence currently active
//   {label:"door1"}          text label of an object (LEVEL 5 puzzles)
//   {textAt:[x,y]}           text of the word block sitting on a cell
//   {global:"s12_box"}       cross-stage variable
//   {at:["player","goal"]}   do two kinds share a cell
//
// Anything not recognised is returned as-is, so plain objects can be data.

const OPS = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => (b === 0 ? 0 : a / b),
  '%': (a, b) => ((a % b) + b) % b, // always non-negative, easier to reason about
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
};

export function ev(e, ctx) {
  if (e === null || e === undefined) return e;
  const t = typeof e;
  if (t === 'number' || t === 'string' || t === 'boolean') return e;
  if (Array.isArray(e)) return e.map((x) => ev(x, ctx));

  if ('v' in e) return ctx.get(e.v);
  if ('global' in e) return ctx.getGlobal(e.global);
  if ('has' in e) return ctx.hasSentence(e.has);
  if ('label' in e) return ctx.labelOf(e.label);
  if ('textAt' in e) {
    const [x, y] = ev(e.textAt, ctx);
    return ctx.textAt(x, y);
  }
  if ('tileAt' in e) {
    const [x, y] = ev(e.tileAt, ctx);
    return ctx.tileAt(x, y);
  }
  if ('objAt' in e) {
    const [x, y] = ev(e.objAt, ctx);
    return ctx.objAt(x, y);
  }
  if ('countObj' in e) return ctx.countObj(ev(e.countObj, ctx));
  if ('objProp' in e) {
    const [ref, prop] = ev(e.objProp, ctx);
    return ctx.objProp(ref, prop);
  }
  if ('visitsAt' in e) {
    const [x, y] = ev(e.visitsAt, ctx);
    return ctx.visitsAt(x, y);
  }
  if ('at' in e) {
    const [a, b] = ev(e.at, ctx);
    return ctx.sameCell(a, b);
  }

  if ('op' in e) {
    const op = e.op;
    if (op === 'and') return (e.args || []).every((x) => truthy(ev(x, ctx)));
    if (op === 'or') return (e.args || []).some((x) => truthy(ev(x, ctx)));
    if (op === 'not') return !truthy(ev(e.a !== undefined ? e.a : e.args?.[0], ctx));
    if (op === 'if') return truthy(ev(e.a, ctx)) ? ev(e.b, ctx) : ev(e.c, ctx);
    if (op === 'abs') return Math.abs(ev(e.a, ctx));
    if (op === 'min') return Math.min(...(e.args || [e.a, e.b]).map((x) => ev(x, ctx)));
    if (op === 'max') return Math.max(...(e.args || [e.a, e.b]).map((x) => ev(x, ctx)));
    if (op === 'in') {
      const a = ev(e.a, ctx);
      const list = ev(e.b, ctx) || [];
      return list.includes(a);
    }
    const f = OPS[op];
    if (!f) throw new Error('unknown op: ' + op);
    return f(ev(e.a, ctx), ev(e.b, ctx));
  }
  return e;
}

export function truthy(x) {
  if (x === undefined || x === null) return false;
  if (typeof x === 'number') return x !== 0;
  if (typeof x === 'string') return x.length > 0;
  return !!x;
}

export function test(e, ctx) {
  if (e === undefined || e === null) return true; // "no condition" means always
  return truthy(ev(e, ctx));
}

// Resolve a dotted path against a plain object graph.
export function dig(obj, path) {
  let cur = obj;
  for (const part of String(path).split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}
