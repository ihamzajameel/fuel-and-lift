// Cross-device sync: change stamping and a deterministic merge of two app states.
//
// Every device keeps `state.sync = { t: {key: ms}, tomb: {key: ms} }`:
//   t    = when each part last changed (whole sections, single days, single body dates)
//   tomb = deleted entries (food/water ids, "s:<sessionId>", "b:<date>") so deletions win over stale copies
// Changes are detected by comparing against a small summary of what was last synced (hashes + ids),
// so the rest of the app never has to know about sync.

export const SECTIONS = ['profile', 'targets', 'settings', 'supplements', 'presets', 'reminders', 'program', 'activeSession'];

// Fields that belong to one device only and never travel between devices.
const localMeta = (m) => ({ push: m?.push });

const json = (v) => JSON.stringify(v ?? null);
/** Small fast string hash (FNV-1a, 32-bit) - only used to notice changes, not for security. */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const metaShared = (m) => {
  const { push, ...rest } = m || {}; // eslint-disable-line no-unused-vars
  return rest;
};

/** What we remember about the last synced state: hashes and ids, not the data itself. */
export function summarize(state) {
  const days = {};
  for (const [k, d] of Object.entries(state.days || {}))
    days[k] = { h: hash(json(d)), ids: [...(d.foods || []), ...(d.water || [])].map((x) => x.id) };
  const body = {};
  for (const b of state.body || []) body[b.date] = hash(json(b));
  return {
    sec: Object.fromEntries([...SECTIONS.map((s) => [s, hash(json(state[s]))]), ['meta', hash(json(metaShared(state.meta)))]]),
    days,
    sessions: (state.sessions || []).map((s) => s.id),
    sessionsH: hash(json(state.sessions)),
    body,
  };
}

/** Stamp everything that changed since `base` (a summary) with `now`; record deletions as tombstones. */
export function stampChanges(state, base, now = Date.now()) {
  const t = { ...(state.sync?.t || {}) };
  const tomb = { ...(state.sync?.tomb || {}) };
  const b = base || { sec: {}, days: {}, sessions: [], body: {} };
  let changed = false;
  const mark = (k) => {
    t[k] = now;
    changed = true;
  };
  for (const s of SECTIONS) if (hash(json(state[s])) !== b.sec?.[s]) mark(s);
  if (hash(json(metaShared(state.meta))) !== b.sec?.meta) mark('meta');
  for (const [k, d] of Object.entries(state.days || {})) {
    const prev = b.days?.[k];
    if (prev?.h === hash(json(d))) continue;
    mark(`day:${k}`);
    if (prev) {
      const ids = new Set([...(d.foods || []), ...(d.water || [])].map((x) => x.id));
      for (const id of prev.ids) if (!ids.has(id)) tomb[id] = now;
    }
  }
  const sessionIds = new Set((state.sessions || []).map((s) => s.id));
  for (const id of b.sessions || []) if (!sessionIds.has(id)) tomb[`s:${id}`] = now;
  if (hash(json(state.sessions)) !== b.sessionsH) mark('sessions');
  const dates = new Set((state.body || []).map((x) => x.date));
  for (const x of state.body || []) if (b.body?.[x.date] !== hash(json(x))) mark(`body:${x.date}`);
  for (const date of Object.keys(b.body || {})) if (!dates.has(date)) tomb[`b:${date}`] = now;
  if (!changed && Object.keys(tomb).length === Object.keys(state.sync?.tomb || {}).length) return state;
  return { ...state, sync: { t, tomb } };
}

const newer = (ta, tb, key) => (tb[key] || 0) > (ta[key] || 0);

function unionById(listA = [], listB = [], preferB, tomb, prefix = '') {
  const map = new Map();
  for (const x of preferB ? listA : listB) map.set(x.id, x);
  for (const x of preferB ? listB : listA) map.set(x.id, x); // the preferred side overwrites
  return [...map.values()].filter((x) => !tomb[`${prefix}${x.id}`]);
}

const maxMap = (a = {}, b = {}) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, v);
  return out;
};

/**
 * Merge `remote` into `local`. Sections and days go to whichever side changed them last;
 * food/water entries, sessions and body dates are combined, minus anything deleted on either side.
 */
export function mergeState(local, remote) {
  if (!remote) return local;
  const ta = local.sync?.t || {};
  const tb = remote.sync?.t || {};
  const tomb = maxMap(local.sync?.tomb, remote.sync?.tomb);
  const out = { ...local };

  for (const s of SECTIONS) out[s] = newer(ta, tb, s) ? remote[s] : local[s];

  const winMeta = newer(ta, tb, 'meta') ? remote.meta : local.meta;
  out.meta = {
    ...metaShared(winMeta),
    ...localMeta(local.meta),
    tg: { ...(winMeta?.tg || {}), lastEventId: Math.max(local.meta?.tg?.lastEventId || 0, remote.meta?.tg?.lastEventId || 0) },
  };

  out.days = {};
  for (const k of new Set([...Object.keys(local.days || {}), ...Object.keys(remote.days || {})])) {
    const da = local.days?.[k];
    const db = remote.days?.[k];
    if (!da || !db) {
      const only = da || db;
      out.days[k] = { ...only, foods: (only.foods || []).filter((x) => !tomb[x.id]), water: (only.water || []).filter((x) => !tomb[x.id]) };
      continue;
    }
    const preferB = newer(ta, tb, `day:${k}`);
    const win = preferB ? db : da;
    out.days[k] = {
      ...win,
      foods: unionById(da.foods, db.foods, preferB, tomb).sort((x, y) => (x.at || 0) - (y.at || 0)),
      water: unionById(da.water, db.water, preferB, tomb).sort((x, y) => (x.at || 0) - (y.at || 0)),
    };
  }

  out.sessions = unionById(local.sessions, remote.sessions, newer(ta, tb, 'sessions'), tomb, 's:').sort((x, y) =>
    x.date < y.date ? -1 : x.date > y.date ? 1 : (x.finishedAt || 0) - (y.finishedAt || 0)
  );

  const bodyMap = new Map();
  for (const x of local.body || []) bodyMap.set(x.date, x);
  for (const x of remote.body || []) if (!bodyMap.has(x.date) || newer(ta, tb, `body:${x.date}`)) bodyMap.set(x.date, x);
  const tAll = maxMap(ta, tb);
  // A deleted date stays deleted unless it was logged again after the deletion.
  out.body = [...bodyMap.values()].filter((x) => !((tomb[`b:${x.date}`] || 0) > (tAll[`body:${x.date}`] || 0))).sort((x, y) => (x.date < y.date ? -1 : 1));

  out.sync = { t: tAll, tomb };
  return out;
}

/** Same content, ignoring sync bookkeeping and device-only fields (to avoid useless uploads). */
export const sameContent = (a, b) => {
  const strip = (s) => ({ ...s, sync: undefined, meta: metaShared(s.meta) });
  return json(strip(a)) === json(strip(b));
};
