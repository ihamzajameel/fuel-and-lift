import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueNow, isDone, logicalNow, parsePart, slotTimes, splitParts, todayView, waterPace } from '../src/logic.js';

const state = {
  tz: 'Asia/Dubai',
  dayStartHour: 4,
  targets: { kcal: 2200, p: 145, c: 220, f: 65, water: 2800, waterStart: '09:30', waterFrontBy: '21:00', waterFrontPct: 80, waterEnd: '01:00' },
  supplements: [
    { id: 'whey', name: 'ON Whey' },
    { id: 'creatine', name: 'Creatine' },
    { id: 'ashwa', name: 'Ashwagandha' },
  ],
  presets: [
    { id: 'shake', name: 'Morning Shake', kcal: 480, p: 35, c: 58, f: 12, supplementId: 'whey' },
    { id: 'eggs-almonds', name: '2 Eggs + 6 Almonds', kcal: 190, p: 14, c: 2, f: 14 },
    { id: 'dates', name: '2 Dates', kcal: 130, p: 1, c: 35, f: 0 },
    { id: 'lunch', name: 'Lunch Plate', kcal: 600, p: 45, c: 60, f: 18 },
    { id: 'dinner', name: 'Post-Workout Dinner', kcal: 650, p: 50, c: 65, f: 20 },
  ],
  reminders: [
    { id: 'morning', kind: 'fixed', time: '09:30', enabled: true, days: [], actions: { presetIds: ['shake'], waterMl: 500 } },
    { id: 'hydration', kind: 'interval', start: '11:00', end: '21:00', every: 90, enabled: true, days: [], dynamic: 'water', actions: { waterMl: 250 } },
    { id: 'postworkout', kind: 'fixed', time: '00:45', enabled: true, days: [], actions: { presetIds: ['dinner'], waterMl: 300, supplementIds: ['creatine'] } },
  ],
};
// 2026-11-27 00:47 in Dubai (UTC+4) = 2026-11-26 20:47 UTC -> logical day 2026-11-26
const at = (iso) => new Date(iso).getTime();

test('logical day rolls over at 4 AM local', () => {
  assert.equal(logicalNow(at('2026-11-26T20:47:00Z'), 'Asia/Dubai', 4).day, '2026-11-26');
  assert.equal(logicalNow(at('2026-11-27T00:30:00Z'), 'Asia/Dubai', 4).day, '2026-11-27'); // 4:30 AM local
});

test('hydration slots every 90 min from 11:00 to 21:00', () => {
  assert.deepEqual(slotTimes(state.reminders[1]), ['11:00', '12:30', '14:00', '15:30', '17:00', '18:30', '20:00']);
});

test('after-midnight reminder is due on the previous logical day', () => {
  const due = dueNow(state, at('2026-11-26T20:47:00Z'), {});
  assert.deepEqual(due.map((d) => d.okey), ['postworkout@2026-11-26@00:45']);
  assert.equal(dueNow(state, at('2026-11-26T20:47:00Z'), { 'postworkout@2026-11-26@00:45': { at: 1 } }).length, 0);
  assert.equal(dueNow(state, at('2026-11-26T21:00:00Z'), {}).length, 0); // 1:00 AM, outside the 10-min window
});

test('parsing replies', () => {
  const p = (s) => parsePart(s, state);
  assert.deepEqual(p('500'), { type: 'water', data: { ml: 500 }, label: '💧 +500 ml water' });
  assert.equal(p('water 300').data.ml, 300);
  assert.equal(p('1.5l').data.ml, 1500);
  assert.equal(p('shake').data.presetId, 'shake');
  assert.equal(p('eggs').data.presetId, 'eggs-almonds');
  assert.equal(p('dinner').data.presetId, 'dinner');
  assert.equal(p('creatine').data.id, 'creatine');
  assert.equal(p('whey').data.id, 'whey');
  assert.equal(p('ashwa').data.id, 'ashwa');
  assert.deepEqual(p('w 73.8').data, { weight: 73.8 });
  assert.deepEqual(p('73.5kg').data, { weight: 73.5 });
  assert.deepEqual(p('waist 88').data, { waist: 88 });
  assert.deepEqual(p('sleep 7.5').data, { hours: 7.5 });
  assert.deepEqual(p('steps 9,500').data, { steps: 9500 });
  const food = p('chicken rice 550 kcal 45p 60c 12f');
  assert.equal(food.type, 'food');
  assert.deepEqual({ ...food.data }, { name: 'Chicken rice', qty: 1, unit: 'serving', kcal: 550, p: 45, c: 60, f: 12 });
  assert.equal(p('food greek yogurt 150').data.kcal, 150);
  assert.equal(p('blah blah'), null);
  assert.deepEqual(splitParts('shake, 500 + creatine and w 74'), ['shake', '500', 'creatine', 'w 74']);
});

test('today view merges snapshot with unapplied events and undo', () => {
  const db = {
    state: { ...state, lastEventId: 1, today: { key: '2026-11-26', totals: { kcal: 480, p: 35, c: 58, f: 12, water: 500 }, presetIds: ['shake'], supps: { whey: true }, done: [] } },
    events: [
      { id: 1, type: 'water', data: { ml: 500 }, day: '2026-11-26', at: 0 }, // already applied in snapshot
      { id: 2, type: 'preset', data: { presetId: 'dinner' }, day: '2026-11-26', at: 0 },
      { id: 3, type: 'water', data: { ml: 300 }, day: '2026-11-26', at: 0 },
      { id: 4, type: 'supp', data: { id: 'creatine', value: true }, day: '2026-11-26', at: 0 },
      { id: 5, type: 'undo', data: { ref: 3 }, day: '2026-11-26', at: 0 },
    ],
  };
  const v = todayView(db, at('2026-11-26T20:47:00Z'));
  assert.equal(v.totals.kcal, 1130);
  assert.equal(v.totals.p, 85);
  assert.equal(v.totals.water, 500);
  assert.equal(v.supps.creatine, true);
  assert.equal(isDone(state.reminders[2], 'postworkout@2026-11-26@00:45', v), true); // dinner logged
});

test('water pace is front-loaded', () => {
  const rel = (t) => ((Number(t.slice(0, 2)) * 60 + Number(t.slice(3))) - 240 + 1440) % 1440;
  assert.equal(waterPace(rel('09:30'), state.targets), 0);
  assert.equal(waterPace(rel('21:00'), state.targets), 2240);
  assert.equal(waterPace(rel('01:00'), state.targets), 2800);
});

test('plan v2 replies: inches, gym done, vit c, dinner choice', () => {
  const st = {
    ...state,
    measureUnit: 'in',
    nextWorkout: 'Chest & Triceps: Heavy',
    supplements: [...state.supplements, { id: 'vitc', name: 'Vitamin C' }],
    presets: [
      ...state.presets.filter((p) => !['dinner', 'lunch'].includes(p.id)),
      { id: 'lunch2', name: 'Lunch: Rice Bowl + Chicken Leg', kcal: 650, p: 33, c: 75, f: 20 },
      { id: 'drc', name: 'Dinner: Roti + Chicken', kcal: 470, p: 33, c: 48, f: 16 },
      { id: 'dric', name: 'Dinner: Rice + Chicken', kcal: 500, p: 31, c: 62, f: 14 },
      { id: 'drm', name: 'Dinner: Roti + Mutton', kcal: 540, p: 27, c: 46, f: 27 },
      { id: 'drd', name: 'Dinner: Roti + Daal (dal)', kcal: 480, p: 18, c: 74, f: 12 },
    ],
  };
  const p = (s) => parsePart(s, st);
  assert.deepEqual(p('chest 38.5').data, { chest: 97.79 });
  assert.deepEqual(p('bicep 15').data, { arm: 38.1 });
  assert.deepEqual(p('waist 33').data, { waist: 83.82 });
  assert.deepEqual(p('waist 84 cm').data, { waist: 84 });
  assert.equal(p('gym done').type, 'workout');
  assert.equal(p('workout').type, 'workout');
  assert.equal(p('vit c').data.id, 'vitc');
  assert.equal(p('creatine').data.id, 'creatine');
  assert.equal(p('mutton').data.presetId, 'drm');
  assert.equal(p('daal').data.presetId, 'drd');
  assert.equal(p('dal').data.presetId, 'drd');
  assert.equal(p('roti chicken').data.presetId, 'drc');
  assert.equal(p('dinner').type, 'choose');
  assert.equal(p('dinner').data.presetIds.length, 4);
  assert.equal(p('rice chicken').type, 'choose'); // lunch bowl vs dinner rice: ask
  assert.equal(p('lunch').data.presetId, 'lunch2');
  assert.equal(p('chicken rice 550 kcal 45p').type, 'food');
});

test('missed reminders count as handled', () => {
  const db = {
    state: { ...state, lastEventId: 0, today: { key: '2026-11-26', totals: {}, presetIds: [], supps: {}, done: [], missed: ['morning@2026-11-26@09:30'] } },
    events: [{ id: 1, type: 'missed', data: { okey: 'postworkout@2026-11-26@00:45' }, day: '2026-11-26', at: 0 }],
  };
  const v = todayView(db, at('2026-11-26T20:47:00Z'));
  assert.equal(isDone(state.reminders[0], 'morning@2026-11-26@09:30', v), true);
  assert.equal(isDone(state.reminders[2], 'postworkout@2026-11-26@00:45', v), true);
});
