// Shared action parser: the compact notation stage solutions are written in.
export function parseAction(str) {
  if (typeof str === 'object') return str;
  const s = String(str);
  const M = { U: 'up', D: 'down', L: 'left', R: 'right' };
  if (M[s]) return { type: 'move', dir: M[s] };
  if (s === 'Z') return { type: 'undo' };
  if (s === 'X') return { type: 'reset' };
  if (s === 'W') return { type: 'wait' };
  if (s.startsWith('ui:')) {
    const [, name, rest] = s.split(':');
    const a = (rest || '').split(',');
    switch (name) {
      case 'wordDrag': return { type: 'ui', name, args: { ref: a[0], x: +a[1], y: +a[2] } };
      case 'dropUI': return { type: 'ui', name, args: { item: a[0], x: +a[1], y: +a[2] } };
      case 'dropChar': return { type: 'ui', name, args: { char: a[0], ref: a[1], mode: a[2] || 'append' } };
      case 'splitWord': return { type: 'ui', name, args: { ref: a[0], at: +a[1], x: +a[2], y: +a[3] } };
      default: return { type: 'ui', name, args: {} };
    }
  }
  throw new Error('bad action in solution: ' + s);
}
