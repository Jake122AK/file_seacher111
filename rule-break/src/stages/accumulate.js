// ACCUMULATE -- one world, one rulebook that only ever grows.
//
// The main campaign gives each stage its own disposable law. This one does the
// opposite: every law introduced stays in force for the rest of the run, and
// the same colour always means the same thing. A law is simply inert when its
// colour is not on the board, so stage N carries all N-1 laws before it and the
// boards get bigger and busier as the rulebook thickens.

export const LAWS = [
  {
    id: 'A_CRUMBLE', tile: 'y', name: '黄色い床は、離れた瞬間に壁になる',
    answer: ['黄', '床', '離れる', '壁'],
    rule: {
      when: 'afterMove',
      if: { op: 'and', args: [{ v: 'arg.moved' },
        { op: '==', a: { tileAt: [{ v: 'prevX' }, { v: 'prevY' }] }, b: 'yellowfloor' }] },
      then: [{ do: 'setTilePrev', to: 'wall' }, { do: 'sound', name: 'thud' }],
      note: '黄色い床から離れた → 背後で床が閉じた',
    },
  },
  {
    id: 'A_PHASE', tile: 'g', name: '青い壁は偶数手のあいだだけ通れる',
    answer: ['青', '壁', '偶数', '手目'],
    rule: {
      when: 'moveBlocked', if: { op: '==', a: { v: 'arg.tile' }, b: 'glass' },
      then: [{ do: 'sound', name: 'err' }],
      note: '青い壁に阻まれた → そのときの手数は奇数だった',
    },
  },
  {
    id: 'A_WEIGHT', tile: '□', name: '箱を押すと手数が2つ進む',
    answer: ['箱', '押す', '手数', '2'],
    rule: {
      when: 'onPush', if: true,
      then: [{ do: 'addTurn', by: 1 }, { do: 'sound', name: 'blip' }],
      note: '箱を押した → MOVES が2つ進んだ',
    },
  },
  {
    id: 'A_PEDESTAL', tile: '○', name: '台座に物が載っているあいだだけ、対応する扉が開く',
    answer: ['台座', '載る', '扉', '開く'],
    rule: {
      when: 'everyTurn', if: { op: 'and', args: [{ countObj: 'switch' }, { at: ['box', 'switch'] }] },
      then: [{ do: 'sound', name: 'low' }],
      note: '台座に箱が載った → どこかで扉の音がした',
    },
  },
  {
    id: 'A_MIRROR', tile: 'p', name: '紫の床を踏むと、以後の操作が上下左右とも反転する',
    answer: ['紫', '床', '操作', '反転'],
    rule: {
      when: 'onEnter', if: { op: '==', a: { v: 'arg.tile' }, b: 'purplefloor' },
      then: [{ do: 'toggleFlag', flag: 'mirrorInput' }, { do: 'sound', name: 'warp' },
        { do: 'flash', text: '' }],
      note: '紫の床を踏んだ → 指の向きと体の向きが合わなくなった',
    },
  },
  {
    id: 'A_ECHO', tile: '☠', name: '影はプレイヤーと同じ向きへ動く。触れると捕まる',
    answer: ['影', '同じ', '向き', '動く'],
    rule: {
      when: 'afterMove',
      if: { op: 'and', args: [{ v: 'arg.moved' }, { op: '>=', a: { v: 'enemies' }, b: 1 }] },
      then: [],
      note: '影も同じ向きへ1マス動いた',
    },
  },
  {
    id: 'A_STATUE', tile: 'w', name: '白い床を踏むと、その場に動かない自分が残る',
    answer: ['白', '床', '自分', '残る'],
    rule: {
      when: 'onEnter', if: { op: '==', a: { v: 'arg.tile' }, b: 'whitefloor' },
      then: [{ do: 'spawn', kind: 'ghost', x: { v: 'px' }, y: { v: 'py' } },
        { do: 'setTileHere', to: 'floor' }, { do: 'sound', name: 'discover' },
        { do: 'flash', text: '' }],
      note: '白い床を踏んだ → 自分がもう一人その場に残った',
    },
  },
  {
    id: 'A_DRIFT', tile: 'n', name: '橙色の床を踏むと、ゴールが1マス右へ動く',
    answer: ['橙', '床', 'ゴール', '動く'],
    rule: {
      when: 'onEnter', if: { op: '==', a: { v: 'arg.tile' }, b: 'orangefloor' },
      then: [{ do: 'moveObj', ref: 'goal', dir: 'right', by: 1, force: 'objects' },
        { do: 'sound', name: 'blip' }],
      note: '橙色の床を踏んだ → ゴールが動いた',
    },
  },
  {
    id: 'A_FALL', tile: 'e', name: '緑の床を踏むと重力が入り、もう一度踏むと消える',
    answer: ['緑', '床', '重力', '切替'],
    rule: {
      when: 'onEnter', if: { op: '==', a: { v: 'arg.tile' }, b: 'greenfloor' },
      then: [{ do: 'setFlag', flag: 'gravDir',
        value: { op: 'if', a: { v: 'flag.gravDir' }, b: '', c: 'down' } },
        { do: 'sound', name: 'low' }, { do: 'flash', text: '' }],
      note: '緑の床を踏んだ → 世界の重さが変わった',
    },
  },
];

const LAW_INDEX = Object.fromEntries(LAWS.map((l, i) => [l.id, i]));

// Every law introduced so far, as engine rules. This is the whole trick.
function rulesUpTo(lastLawId) {
  const n = LAW_INDEX[lastLawId] + 1;
  return LAWS.slice(0, n).map((l) => ({ id: l.id, name: l.name, answer: l.answer, ...l.rule }));
}

function tokensUpTo(lastLawId) {
  const n = LAW_INDEX[lastLawId] + 1;
  const t = new Set();
  for (const l of LAWS.slice(0, n)) for (const a of l.answer) t.add(a);
  for (const d of ['偶数', '奇数', '重力', '手数', '壁', '床', '2', '3', '回']) t.add(d);
  return [...t];
}

// The shared vocabulary. A colour means the same thing in every stage here.
const LEGEND = {
  y: { type: 'yellowfloor' },
  g: { type: 'glass' },
  p: { type: 'purplefloor' },
  w: { type: 'whitefloor' },
  n: { type: 'orangefloor' },
  e: { type: 'greenfloor' },
  o: { type: 'hole' },
};

// A stage is written as the law it introduces plus a board; the rest is derived.
const stage = (o) => ({
  level: 20,
  campaign: 'accumulate',
  grid: { rows: o.rows, legend: LEGEND },
  hidden_rules: rulesUpTo(o.upTo),
  rulebook: LAWS.slice(0, LAW_INDEX[o.upTo] + 1).map((l) => l.id),
  introduces: o.introduces || null,
  tokens: tokensUpTo(o.upTo),
  available_ui_actions: ['undo', 'reset'],
  ...o,
});

export const ACCUMULATE = [
stage({
  id: 'A1', title: 'ONE WAY', upTo: 'A_CRUMBLE', introduces: 'A_CRUMBLE',
  rows: ['#######', '#.....#', '#.###.#', '#y###y#', '#.###.#', '#.....#', '#######'],
  objects: [
    { kind: 'player', x: 1, y: 5 },
    { kind: 'key', keyId: 'k', x: 5, y: 1 },
    { kind: 'door', needs: 'k', x: 4, y: 5 },
    { kind: 'goal', x: 5, y: 5 },
  ],
  hint_1: '扉には鍵が要る。鍵は上にある。',
  hint_2: '黄色い床を通ったあと、振り返ってみろ。',
  hint_3: '黄色い床は一度しか通れない。左の縦道で登ったら、降りるのは右の縦道だ。',
  solution: ['U', 'U', 'U', 'U', 'R', 'R', 'R', 'R', 'D', 'D', 'D', 'D'],
}),
stage({
  id: 'A2', title: 'ORDER', upTo: 'A_CRUMBLE',
  rows: ['#######', '#.....#', '#y#y#y#', '#.....#', '#y#y#y#', '#.....#', '#######'],
  objects: [
    { kind: 'player', x: 1, y: 5 },
    { kind: 'key', keyId: 'a', x: 5, y: 1 },
    { kind: 'key', keyId: 'b', x: 1, y: 1 },
    { kind: 'door', needs: 'a', x: 4, y: 5 },
    { kind: 'goal', x: 5, y: 5 },
  ],
  win_conditions: [{ at: ['player', 'goal'] }, { v: 'key.a' }, { v: 'key.b' }],
  hint_1: '鍵は2つ。黄色い縦道は3本。',
  hint_2: '1本の縦道は1回しか使えない。3本で何回の上下ができる？',
  hint_3: '登る・降りる・登る・降りるで4回必要になる順路は詰む。3回で済む順路を探せ。',
  solution: ['U', 'U', 'U', 'U', 'R', 'R', 'R', 'R', 'D', 'D', 'U', 'U', 'R', 'R', 'D', 'D', 'D', 'D'],
}),
stage({
  id: 'A3', title: 'EVEN', upTo: 'A_PHASE', introduces: 'A_PHASE',
  rows: ['#########', '#.......#', '#.#######', '#.......#', '#######.#', '#..g....#', '#########'],
  objects: [{ kind: 'player', x: 1, y: 1 }, { kind: 'goal', x: 1, y: 5 }],
  turn_conditions: { countBlocked: true },
  hint_1: '青い壁は、通れるときと通れないときがある。',
  hint_2: 'MOVES は、進めなかったときも増える。一本道なので遠回りでは調整できない。',
  hint_3: '青い壁の手前で1手潰せ。偶数手なら通れる。',
  solution: ['D', 'D', 'R', 'R', 'R', 'R', 'R', 'R', 'D', 'D', 'L', 'L', 'L', 'U', 'L', 'L', 'L'],
}),
stage({
  id: 'A4', title: 'COUNT THE FLOOR', upTo: 'A_PHASE',
  rows: ['#########', '#.......#', '#.#######', '#y#######', '#.#######', '#..g....#', '#########'],
  objects: [
    { kind: 'player', x: 1, y: 1 },
    { kind: 'key', keyId: 'k', x: 7, y: 1 },
    { kind: 'goal', x: 7, y: 5 },
  ],
  win_conditions: [{ at: ['player', 'goal'] }, { v: 'key.k' }],
  turn_conditions: { countBlocked: true },
  hint_1: '黄色と青、2つの法則が同時に効いている。降り口は1本しかない。',
  hint_2: '降りたら二度と登れない。降りる前に上で済ませることは無いか？',
  hint_3: '鍵を先に取れ。降りたあと、青い壁の前で1手潰せ。',
  solution: ['R', 'R', 'R', 'R', 'R', 'R', 'L', 'L', 'L', 'L', 'L', 'L',
    'D', 'D', 'D', 'D', 'R', 'U', 'R', 'R', 'R', 'R', 'R'],
}),
stage({
  id: 'A5', title: 'HEAVY', upTo: 'A_WEIGHT', introduces: 'A_WEIGHT',
  rows: ['#########', '#.......#', '#.##.####', '#.......#', '#######.#', '#..g....#', '#########'],
  objects: [
    { kind: 'player', x: 1, y: 1 },
    { id: 'bx', kind: 'box', x: 4, y: 2 },
    { kind: 'goal', x: 1, y: 5 },
  ],
  hint_1: '青い壁の手前で手数が合わない。ここでは壁を殴っても手数は増えない。',
  hint_2: '1マス進むのに2手かかる動きが、この盤面には一つだけある。',
  hint_3: '箱を1回押して戻ってこい。それだけで偶奇がずれる。',
  solution: ['D', 'D', 'R', 'R', 'R', 'U', 'D', 'R', 'R', 'R', 'D', 'D', 'L', 'L', 'L', 'L', 'L', 'L'],
}),
stage({
  id: 'A6', title: 'THREE LAWS', upTo: 'A_WEIGHT',
  rows: ['#########', '#.......#', '#.#####.#', '#.#...#.#', '#y#.#.#.#', '#...#g..#', '#########'],
  objects: [
    { kind: 'player', x: 1, y: 1 },
    { id: 'bx', kind: 'box', x: 3, y: 3 },
    { kind: 'goal', x: 7, y: 5 },
  ],
  turn_conditions: { countBlocked: true },
  hint_1: '黄色・青・箱。3つとも生きている。',
  hint_2: '箱を押すのは道を空けるためだけではない。',
  hint_3: '青い壁の手前に立つ瞬間の手数を数えろ。足りない1手は箱が作れる。',
  solution: ['R', 'R', 'R', 'R', 'R', 'R', 'D', 'D', 'D', 'D', 'L', 'U', 'L'],
}),
stage({
  id: 'A7', title: 'PEDESTAL', upTo: 'A_PEDESTAL', introduces: 'A_PEDESTAL',
  rows: ['#########', '#.......#', '#.......#', '#.......#', '#.......#', '#.....#.#', '#########'],
  objects: [
    { kind: 'player', x: 1, y: 1 },
    { id: 'bx', kind: 'box', x: 3, y: 2 },
    { kind: 'switch', link: 'a', x: 3, y: 4 },
    { kind: 'door', link: 'a', x: 7, y: 4 },
    { kind: 'goal', x: 7, y: 5 },
  ],
  hint_1: '扉は鍵で開く物ばかりではない。',
  hint_2: '床にある丸い台座は何のためにある？',
  hint_3: '箱を台座へ押し込め。載っているあいだだけ扉が開く。',
  solution: ['R', 'R', 'D', 'D', 'R', 'D', 'R', 'R', 'R', 'D'],
}),
stage({
  id: 'A8', title: 'ONE SHOT', upTo: 'A_PEDESTAL',
  rows: ['#########', '#.......#', '#.yyyyy.#', '#.......#', '#.......#', '#.....#.#', '#########'],
  objects: [
    { kind: 'player', x: 1, y: 1 },
    { id: 'bx', kind: 'box', x: 4, y: 3 },
    { kind: 'switch', link: 'a', x: 4, y: 4 },
    { kind: 'door', link: 'a', x: 7, y: 4 },
    { kind: 'goal', x: 7, y: 5 },
  ],
  hint_1: '台座の上へ箱を落とすには、箱の上に立つ必要がある。',
  hint_2: '黄色い床は一度きり。箱を押す位置へ二度は行けない。',
  hint_3: '黄色を渡るのは、押す準備が完全に整ってからにしろ。',
  solution: ['D', 'R', 'R', 'R', 'D', 'R', 'D', 'R', 'R', 'D'],
}),
stage({
  id: 'A9', title: 'MIRROR', upTo: 'A_MIRROR', introduces: 'A_MIRROR',
  rows: ['#########', '#...p...#', '#######.#', '#.......#', '#########'],
  objects: [{ kind: 'player', x: 1, y: 1 }, { kind: 'goal', x: 1, y: 3 }],
  hint_1: '紫の床を踏んだあと、右を押してみろ。',
  hint_2: '体が言うことを聞かないのではない。指の意味が入れ替わっている。',
  hint_3: '紫を踏んだら、行きたい方向と逆を押せ。ゴールまでずっとだ。',
  solution: ['R', 'R', 'R', 'L', 'L', 'L', 'U', 'U', 'R', 'R', 'R', 'R', 'R', 'R'],
}),
stage({
  id: 'A10', title: 'BACKWARDS', upTo: 'A_MIRROR',
  rows: ['##########', '#........#', '#.######.#', '#.#pyyy#.#', '#.#....#.#', '#.####g#.#', '#........#', '##########'],
  objects: [{ kind: 'player', x: 1, y: 1 }, { kind: 'goal', x: 8, y: 6 }],
  turn_conditions: { countBlocked: true },
  hint_1: '紫と黄色が同じ部屋にある。踏む順番で世界が変わる。',
  hint_2: '反転したまま黄色い床へ入ると、出口の向きも反転している。',
  hint_3: '内側の部屋は罠だ。入らずに済む道がある。',
  solution: ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'D', 'D', 'D', 'D', 'D', 'L'],
}),
stage({
  id: 'A11', title: 'SHADOW', upTo: 'A_ECHO', introduces: 'A_ECHO',
  rows: ['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '##########'],
  objects: [
    { kind: 'player', x: 1, y: 6 },
    { kind: 'enemy', x: 8, y: 1, behavior: 'copy' },
    { kind: 'goal', x: 8, y: 6 },
  ],
  hint_1: '影は勝手に動いているのではない。',
  hint_2: '影はお前と同じ向きへ動く。壁に当たれば止まる。',
  hint_3: '影を壁に押しつけて動けなくしてから、自分だけずれろ。',
  solution: ['R', 'R', 'R', 'R', 'R', 'R', 'R'],
}),
stage({
  id: 'A12', title: 'USE THE SHADOW', upTo: 'A_ECHO',
  rows: ['##########', '#........#', '#........#', '#...#.#..#', '#....#...#', '#........#',
    '#######.##', '#........#', '##########'],
  objects: [
    { kind: 'player', x: 1, y: 1 },
    { kind: 'enemy', x: 5, y: 1, behavior: 'copy' },
    { kind: 'switch', link: 'a', x: 5, y: 3 },
    { kind: 'door', link: 'a', x: 7, y: 6 },
    { kind: 'goal', x: 1, y: 7 },
  ],
  hint_1: '影は敵とは限らない。台座は誰が踏んでもいい。',
  hint_2: '影はお前と同じ向きへ動く。三方を壁に囲まれた影は、一方向にしか出られない。',
  hint_3: '影を台座の窪みへ落とし込め。あとは、影が出られる向きだけを絶対に押すな。',
  solution: ['D', 'D', 'D', 'D', 'R', 'R', 'R', 'R', 'R', 'R', 'D', 'D',
    'L', 'L', 'L', 'L', 'L', 'L'],
}),
stage({
  id: 'A13', title: 'STATUE', upTo: 'A_STATUE', introduces: 'A_STATUE',
  rows: ['##########', '#........#', '#........#', '#...w....#', '#........#', '#......#.#', '#........#', '##########'],
  objects: [
    { kind: 'player', x: 1, y: 3 },
    { kind: 'switch', link: 'a', x: 4, y: 3 },
    { kind: 'door', link: 'a', x: 8, y: 5 },
    { kind: 'goal', x: 8, y: 6 },
  ],
  hint_1: '台座は踏み続けなければ効かない。だが体は1つしかない。',
  hint_2: '白い床の上に立ったとき、足元に何が生まれた？',
  hint_3: '白い床は台座の上にある。そこで生まれた自分に台座を任せて、本体は歩け。',
  solution: ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'D', 'D', 'D'],
}),
stage({
  id: 'A14', title: 'HOLD IT', upTo: 'A_STATUE',
  rows: ['#########', '#.......#', '#.#y###.#', '#.#w..#.#', '#.#...#.#', '#.......#', '#########'],
  objects: [
    { kind: 'player', x: 1, y: 1 },
    { kind: 'switch', link: 'a', x: 3, y: 3 },
    { kind: 'door', link: 'a', x: 7, y: 4 },
    { kind: 'goal', x: 7, y: 5 },
  ],
  hint_1: '台座は踏み続けなければ効かない。だが体は1つしかない。',
  hint_2: '内側の部屋へ入る道は黄色い。入ったら、その道はもう無い。',
  hint_3: '白い床は台座の上にある。そこに自分を1体残し、本体は別の道から出ろ。',
  solution: ['R', 'R', 'D', 'D', 'D', 'D', 'D', 'R', 'R', 'R', 'R', 'D'],
}),
stage({
  id: 'A15', title: 'DRIFT', upTo: 'A_DRIFT', introduces: 'A_DRIFT',
  rows: ['#########', '#.......#', '#.nnn...#', '######.##', '#...B..o#', '#########'],
  objects: [
    { kind: 'player', x: 1, y: 1 },
    { id: 'plug', kind: 'box', x: 4, y: 4, push: false },
    { kind: 'goal', x: 1, y: 4 },
  ],
  hint_1: 'ゴールは動かない物だと、誰が決めた？',
  hint_2: '橙色の床を踏むたびゴールが1マス右へずれる。踏みすぎたゴールがどこへ落ちるかも見ておけ。',
  hint_3: '橙色は3枚。だが必要な歩数は3とは限らない。同じ床は何度でも踏める。',
  solution: ['D', 'R', 'R', 'R', 'L', 'U', 'R', 'R', 'R', 'D', 'D', 'D', 'L'],
}),
stage({
  id: 'A16', title: 'EVERYTHING', upTo: 'A_FALL', introduces: 'A_FALL',
  rows: ['#########', '#.......#', '#.......#', '#.......#', '#e....g.#', '#########'],
  objects: [{ kind: 'player', x: 1, y: 1 }, { kind: 'goal', x: 7, y: 4 }],
  hint_1: '最後の色だ。踏めば世界が重くなる。',
  hint_2: '青い壁の前で1手だけ潰したい。だがここでは壁を殴っても手数は増えない。',
  hint_3: '重力があるなら、跳ねて落ちれば1手だけ進む。位置は変わらないまま。',
  solution: ['D', 'D', 'D', 'R', 'R', 'R', 'R', 'U', 'R', 'R'],
}),
];
