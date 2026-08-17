// Every stage in the game is data. Adding one means adding an object here --
// never touching the engine.

import { L1 } from './l1.js';
import { L2 } from './l2.js';
import { L3 } from './l3.js';
import { L4 } from './l4.js';
import { L5 } from './l5.js';
import { L6 } from './l6.js';
import { L7 } from './l7.js';
import { ACCUMULATE } from './accumulate.js';

export const STAGES = [...L1, ...L2, ...L3, ...L4, ...L5, ...L6, ...L7, ...ACCUMULATE];

// Stages authored in editor.html are merged in at runtime; the engine never
// needs to know the difference.
export function registerStages(list) {
  for (const st of list || []) {
    const i = STAGES.findIndex((s) => String(s.id) === String(st.id));
    if (i >= 0) STAGES[i] = st; else STAGES.push(st);
  }
  return STAGES;
}

export const stageById = (id) => STAGES.find((s) => String(s.id) === String(id));

// Stages that do not show up on the map until the world has been broken open.
export const visibleStages = (unlocked = {}) =>
  STAGES.filter((s) => !s.hidden || unlocked[s.id]);
