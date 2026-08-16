// save.js -- autosave. The game may pretend to break; the save file never does.
const KEY = 'rulebreak.save.v1';

const BLANK = {
  version: 1,
  cleared: {},      // stageId -> true
  discovered: {},   // ruleId  -> true
  notes: {},        // stageId -> [observation strings]
  globals: {},      // cross-stage variables
  unlocked: {},     // hidden stage ids
  hints: {},        // stageId -> how many hint tiers were opened
  titleBroken: false,
  rootRules: {},    // root rules the player has edited (post-title-break)
  muted: false,
  lastStage: '1',
};

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...BLANK, ...JSON.parse(raw) } : { ...BLANK };
  } catch {
    cache = { ...BLANK };            // corrupt or blocked storage: start clean, never throw
  }
  for (const k of Object.keys(BLANK)) if (cache[k] === undefined) cache[k] = BLANK[k];
  return cache;
}

let pending = null;
export function save() {
  const data = load();
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or denied */ }
  }, 120);
}

export function saveNow() {
  const data = load();
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function wipe() {
  cache = { ...BLANK };
  saveNow();
}
