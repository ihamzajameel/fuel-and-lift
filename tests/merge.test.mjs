import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeState, stampChanges, summarize, sameContent } from '../src/lib/merge.js';

const base = () => ({
  profile: { weightKg: 74 }, targets: { kcal: 2850 }, settings: {}, supplements: [{ id: 'vitc', stock: 22 }], presets: [], reminders: [], program: { days: [] }, activeSession: null,
  sessions: [], body: [{ date: '2026-11-27', weight: 74 }],
  days: { '2026-11-27': { foods: [{ id: 'f1', name: 'Shake', at: 1 }], water: [{ id: 'w1', ml: 500, at: 1 }], supps: {}, done: {} } },
  meta: { tg: { lastEventId: 5 }, push: { enabled: true } },
});
const clone = (x) => structuredClone(x);
// Both devices start from the same synced state.
const start = stampChanges(base(), null, 1000);
const sum = summarize(start);

test('concurrent adds on the same day are both kept', () => {
  const phone = clone(start); phone.days['2026-11-27'].water.push({ id: 'w2', ml: 250, at: 5 });
  const pc = clone(start); pc.days['2026-11-27'].foods.push({ id: 'f2', name: 'Laban', at: 6 });
  const a = stampChanges(phone, sum, 2000), b = stampChanges(pc, sum, 2001);
  const m = mergeState(a, b);
  assert.deepEqual(m.days['2026-11-27'].water.map((x) => x.id), ['w1', 'w2']);
  assert.deepEqual(m.days['2026-11-27'].foods.map((x) => x.id), ['f1', 'f2']);
  assert.deepEqual(mergeState(b, a).days['2026-11-27'].foods.map((x) => x.id), ['f1', 'f2']); // symmetric content
});

test('a deletion wins over a stale copy', () => {
  const phone = clone(start); phone.days['2026-11-27'].foods = [];
  const a = stampChanges(phone, sum, 2000);
  const m = mergeState(start, a);
  assert.equal(m.days['2026-11-27'].foods.length, 0);
  assert.ok(m.sync.tomb.f1);
});

test('newer section edits win; event cursor takes the max; device-only push setting stays local', () => {
  const pc = clone(start); pc.targets.kcal = 3000; pc.meta.tg.lastEventId = 9; pc.meta.push = { enabled: false };
  const b = stampChanges(pc, sum, 3000);
  const m = mergeState(start, b);
  assert.equal(m.targets.kcal, 3000);
  assert.equal(m.meta.tg.lastEventId, 9);
  assert.deepEqual(m.meta.push, { enabled: true });
});

test('stock change from one device is not double counted', () => {
  const phone = clone(start); phone.supplements[0].stock = 21;
  const pc = clone(start); pc.supplements[0].stock = 21; // same Telegram tick applied on both
  const m = mergeState(stampChanges(phone, sum, 2000), stampChanges(pc, sum, 2001));
  assert.equal(m.supplements[0].stock, 21);
});

test('body: delete, then re-log the same date later', () => {
  const del = clone(start); del.body = [];
  const a = stampChanges(del, sum, 2000);
  assert.equal(mergeState(start, a).body.length, 0);
  const re = clone(a); re.body = [{ date: '2026-11-27', weight: 74.5 }];
  const b = stampChanges(re, summarize(a), 3000);
  assert.deepEqual(mergeState(a, b).body, [{ date: '2026-11-27', weight: 74.5 }]);
});

test('no changes means no new stamps', () => {
  assert.equal(stampChanges(start, sum, 9999), start);
  assert.ok(sameContent(start, mergeState(start, start)));
});
