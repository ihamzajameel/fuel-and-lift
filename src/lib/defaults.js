// Pre-loaded defaults for Fuel & Lift. Everything here is editable in the app.
// Plan v2 (27 Nov 2026): lean bulk 74 → 80 kg while keeping belly fat down,
// built around the real day: wake 10:30 AM, office 12–8:30 PM, gym ~10 PM, dinner at midnight, sleep 2 AM.

export const PLAN_VERSION = 2;

export const DEFAULT_PROFILE = {
  age: 31,
  sex: 'male',
  weightKg: 74,
  heightCm: 178, // 5'10"
  activity: 1.55, // office job + 6 lifting sessions a week
  goal: 'Lean bulk to 80 kg, keep belly fat down',
  goalType: 'lean_bulk', // lean_bulk | cut | recomp
  targetWeight: 80,
  goals: { chest: 101.6, arm: 40.6, armStretch: 43.2 }, // cm: chest 40", bicep 16" (stretch 17")
  wakeTime: '10:30',
  gymTime: '22:00',
  bedTime: '02:00',
};

// Mifflin–St Jeor maintenance ≈ 2,650–2,700 kcal; +~200 surplus for ~0.25 kg/week of mostly lean gain.
export const DEFAULT_TARGETS = {
  kcal: 2850,
  p: 160, // ~2.2 g/kg now, 2.0 g/kg at 80 kg
  c: 360,
  f: 85,
  water: 2800,
  steps: 8000, // keeps fat gain low on a bulk
  sleepHours: 8, // 2:00 AM -> 10:30 AM
  // Water pacing follows your routine: 12:30 PM, 4 PM, 7:30 PM, 1 L at the gym, 300 ml at midnight.
  waterStart: '12:00',
  waterFrontBy: '21:00',
  waterFrontPct: 55,
  waterEnd: '00:30',
};

export const DEFAULT_SETTINGS = {
  theme: 'dark', // dark | light | system
  sound: true,
  vibrate: true,
  autoRest: true,
  keepAwake: true,
  dayStartHour: 4, // logs before 4 AM count toward the previous day
  barKg: 20,
  measureUnit: 'in', // body measurements shown in inches (stored in cm)
};

export const DEFAULT_SUPPLEMENTS = [
  { id: 'whey', name: 'ON Whey', dose: '1 scoop (25 g protein)' },
  { id: 'creatine', name: 'Creatine', dose: '5 g with 300 ml water' },
  { id: 'vitc', name: 'Vitamin C', dose: '1 capsule · 6 PM' },
  { id: 'ashwa', name: 'Ashwagandha', dose: '1 capsule · before sleep' },
];

// Macros are estimates for typical portions. Edit them to match your actual plate.
export const DEFAULT_PRESETS = [
  {
    id: 'shake',
    name: 'Morning Shake',
    detail: '500 ml milk + banana + 5 tbsp oats + ½ tbsp PB + 1 tbsp each chia, alsi (flax), sunflower & pumpkin seeds + 1 scoop ON Whey',
    qty: 1,
    unit: 'serving',
    kcal: 900,
    p: 55,
    c: 85,
    f: 40,
    supplementId: 'whey',
  },
  { id: 'lunch', name: 'Lunch: Rice Bowl + Chicken Leg', detail: 'Estimate: ~1.5 cups rice + 1 leg piece', qty: 1, unit: 'serving', kcal: 650, p: 33, c: 75, f: 20 },
  { id: 'eggs', name: '2 Boiled Eggs (1 whole + 1 white)', detail: '6 PM snack', qty: 1, unit: 'serving', kcal: 90, p: 10, c: 1, f: 5 },
  { id: 'nuts', name: 'Mixed Nuts (½ handful)', detail: 'Almonds, cashews, pistachios ~20 g', qty: 20, unit: 'g', kcal: 115, p: 4, c: 5, f: 10 },
  { id: 'dates', name: '2 Dates', detail: 'Pre-gym fuel', qty: 2, unit: 'piece', kcal: 130, p: 1, c: 35, f: 0 },
  { id: 'dinner-roti-chicken', name: 'Dinner: Roti + Chicken', detail: '2 roti + 2 boti chicken curry', qty: 1, unit: 'serving', kcal: 470, p: 33, c: 48, f: 16 },
  { id: 'dinner-rice-chicken', name: 'Dinner: Rice + Chicken', detail: '1 plate rice + 2 boti chicken curry', qty: 1, unit: 'serving', kcal: 500, p: 31, c: 62, f: 14 },
  { id: 'dinner-roti-mutton', name: 'Dinner: Roti + Mutton', detail: '2 roti + 2 boti mutton', qty: 1, unit: 'serving', kcal: 540, p: 27, c: 46, f: 27 },
  { id: 'dinner-roti-daal', name: 'Dinner: Roti + Daal (dal)', detail: '2 roti + 1 bowl daal', qty: 1, unit: 'serving', kcal: 480, p: 18, c: 74, f: 12 },
  { id: 'extra-roti', name: 'Extra Roti', detail: 'Bulking add-on', qty: 1, unit: 'piece', kcal: 120, p: 4, c: 22, f: 2 },
  { id: 'laban', name: 'Yogurt / Laban (200 g)', detail: 'Bulking add-on: protein + calories', qty: 200, unit: 'g', kcal: 120, p: 8, c: 10, f: 5 },
];

const R = (id, title, time, body, icon, actions, extra = {}) => ({
  id,
  title,
  body,
  kind: 'fixed',
  time,
  enabled: true,
  days: [],
  icon,
  actions: { presetIds: [], waterMl: 0, supplementIds: [], ...actions },
  builtin: true,
  ...extra,
});

export const DEFAULT_REMINDERS = [
  R('morning', 'Morning shake', '10:45', '500 ml milk + 1 banana + 5 tbsp oats + ½ tbsp peanut butter + 1 tbsp each chia, alsi, sunflower & pumpkin seeds + 1 scoop ON Whey.', 'coffee', { presetIds: ['shake'] }),
  R('water-1230', '500 ml water', '12:30', 'First water of the day. Finish the bottle.', 'droplet', { waterMl: 500 }),
  R('lunch', 'Lunch + 500 ml water', '16:00', 'Rice bowl + chicken. Drink 500 ml water 30 min before or after.', 'salad', { presetIds: ['lunch'], waterMl: 500 }),
  R('eggs', '2 boiled eggs + Vitamin C', '18:00', '1 whole egg + 1 egg white, and 1 Vitamin C capsule.', 'egg', { presetIds: ['eggs'], supplementIds: ['vitc'] }),
  R('nuts', 'Nuts', '18:45', 'Half a handful: almonds, cashews, pistachios.', 'nut', { presetIds: ['nuts'] }),
  R('water-1930', '500 ml water before 8 PM', '19:30', 'Get it in before you leave the office.', 'droplet', { waterMl: 500 }),
  R('preworkout', 'Pre-gym: 2 dates + 1 L lime water', '21:00', '2 dates now. Mix 1 L water with 1 lime + a pinch of pink salt and sip it through the session.', 'zap', { presetIds: ['dates'], waterMl: 1000 }),
  R('gym', 'Gym time', '22:00', "Open today's workout and get moving.", 'dumbbell', { openTab: 'train' }),
  R('dinner', 'Dinner + creatine', '00:00', '5 g creatine with 300 ml water. Log dinner: roti chicken, rice chicken, mutton or daal. Bulking tip: add 1 extra roti or boti.', 'utensils', {
    waterMl: 300,
    supplementIds: ['creatine'],
    choosePresetIds: ['dinner-roti-chicken', 'dinner-rice-chicken', 'dinner-roti-mutton', 'dinner-roti-daal'],
  }),
  R('checkin', 'Weekly check-in', '11:00', 'Before your shake: weigh in, then measure waist (navel), chest and bicep. Reply e.g. "w 74.2, waist 33, chest 38.6, bicep 15.1".', 'ruler', {}, { days: [0] }),
  R('winddown', 'Wind down + Ashwagandha', '01:30', 'Ashwagandha, lights low, screens away. Sleep by 2:00 AM for 8 h before 10:30.', 'moon', { supplementIds: ['ashwa'] }),
  {
    id: 'hydration',
    title: 'Hydration check',
    body: 'Sip 200–250 ml water.',
    kind: 'interval',
    start: '13:00',
    end: '20:00',
    every: 90,
    enabled: false, // your routine already has fixed water times
    days: [],
    icon: 'droplet',
    dynamic: 'water',
    actions: { presetIds: [], waterMl: 250, supplementIds: [] },
    builtin: true,
  },
];

// ---------- Workout programs ----------
let n = 0;
const ex = (name, sets, repMin, repMax, rest, opts = {}) => ({
  id: `ex-${(++n).toString(36)}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  name,
  sets,
  repMin,
  repMax,
  rest,
  inc: opts.inc ?? 2.5,
  unit: opts.unit ?? 'reps',
  bw: opts.bw ?? false,
  note: opts.note ?? '',
});

const LIB = {
  bench: ex('Barbell Bench Press', 4, 5, 7, 120),
  row: ex('Barbell Bent-Over Row', 4, 6, 8, 120),
  ohp: ex('Seated DB Shoulder Press', 3, 6, 8, 90, { inc: 2 }),
  pulldown: ex('Lat Pulldown', 3, 6, 8, 90),
  facepull: ex('Face Pull', 3, 12, 15, 60),
  curl: ex('EZ-Bar Curl', 2, 8, 10, 60),
  pushdown: ex('Triceps Rope Pushdown', 2, 10, 12, 60),
  squat: ex('Barbell Back Squat', 4, 5, 7, 120, { inc: 5 }),
  rdl: ex('Romanian Deadlift', 3, 6, 8, 120, { inc: 5 }),
  split: ex('Bulgarian Split Squat', 3, 8, 10, 90, { inc: 2, note: 'Reps per leg' }),
  legcurl: ex('Lying Leg Curl', 3, 10, 12, 60),
  calf: ex('Standing Calf Raise', 3, 10, 15, 60),
  hlr: ex('Hanging Leg Raise', 3, 10, 15, 60, { bw: true }),
  plank: ex('Plank', 3, 30, 60, 60, { unit: 'sec', bw: true }),
  incline: ex('Incline DB Press', 3, 8, 12, 90, { inc: 2 }),
  cablerow: ex('Seated Cable Row', 3, 10, 12, 90),
  lateral: ex('DB Lateral Raise', 3, 12, 15, 60, { inc: 1 }),
  fly: ex('Cable Fly', 3, 12, 15, 60),
  hammer: ex('Hammer Curl', 3, 10, 12, 60, { inc: 2 }),
  ohext: ex('Overhead Triceps Extension', 3, 10, 12, 60),
  deadlift: ex('Trap-Bar Deadlift', 3, 4, 6, 120, { inc: 5 }),
  legpress: ex('Leg Press', 3, 10, 12, 90, { inc: 10 }),
  hipthrust: ex('Barbell Hip Thrust', 3, 8, 12, 90, { inc: 5 }),
  legext: ex('Leg Extension', 3, 12, 15, 60),
  swing: ex('Kettlebell Swing', 3, 15, 20, 60, { inc: 4 }),
  bike: ex('Bike Sprint Intervals', 6, 20, 30, 60, { unit: 'sec', bw: true, note: 'All-out sprints, easy spin during rest' }),
  pullup: ex('Pull-Up / Assisted', 3, 6, 10, 90, { bw: true }),
  goblet: ex('Goblet Squat', 3, 10, 12, 90, { inc: 2 }),
  pushup: ex('Push-Up', 3, 10, 20, 60, { bw: true }),
  carry: ex("Farmer's Carry", 3, 30, 45, 60, { unit: 'sec', inc: 2, note: 'Hold DBs for time' }),
  // ---- plan v2: 6-day push/pull/legs ----
  benchH: ex('Barbell Bench Press', 4, 6, 8, 120),
  inclineH: ex('Incline DB Press', 3, 8, 10, 90, { inc: 2 }),
  dips: ex('Chest Dips', 3, 8, 12, 90, { bw: true, note: 'Lean forward; add weight once 12 is easy' }),
  flyLow: ex('Low-to-High Cable Fly', 3, 12, 15, 60, { note: 'Upper chest' }),
  cgbp: ex('Close-Grip Bench Press', 3, 6, 8, 90),
  pushdownH: ex('Triceps Rope Pushdown', 3, 10, 12, 60),
  ohextH: ex('Overhead Triceps Extension', 3, 10, 12, 60),
  pulldownH: ex('Lat Pulldown', 4, 6, 10, 120),
  rowH: ex('Barbell Row', 4, 6, 8, 120),
  cablerowH: ex('Seated Cable Row', 3, 8, 12, 90),
  straightArm: ex('Straight-Arm Pulldown', 3, 12, 15, 60),
  ezCurl: ex('EZ-Bar Curl', 3, 6, 10, 90),
  inclineCurl: ex('Incline DB Curl', 3, 8, 12, 60, { inc: 1 }),
  hammerH: ex('Hammer Curl', 3, 10, 12, 60, { inc: 2 }),
  squatH: ex('Barbell Back Squat', 4, 5, 8, 120, { inc: 5 }),
  rdlH: ex('Romanian Deadlift', 3, 6, 10, 120, { inc: 5 }),
  legpressH: ex('Leg Press', 3, 10, 12, 90, { inc: 10 }),
  legcurlH: ex('Lying Leg Curl', 3, 10, 12, 60),
  calfH: ex('Standing Calf Raise', 3, 10, 15, 60),
  dbPress: ex('Seated DB Shoulder Press', 4, 6, 10, 90, { inc: 2 }),
  lateralH: ex('DB Lateral Raise', 4, 12, 20, 60, { inc: 1 }),
  facepullH: ex('Face Pull', 3, 12, 15, 60),
  inclineBB: ex('Incline Barbell Press', 4, 8, 10, 120),
  flatDB: ex('Flat DB Press', 3, 10, 12, 90, { inc: 2 }),
  pecDeck: ex('Pec Deck / Machine Fly', 3, 12, 15, 60),
  pushupV: ex('Push-Up (to failure)', 2, 10, 25, 60, { bw: true }),
  skull: ex('EZ-Bar Skull Crusher', 3, 8, 12, 90),
  singlePush: ex('Single-Arm Cable Pushdown', 3, 12, 15, 60, { inc: 1 }),
  pulldownWide: ex('Wide-Grip Lat Pulldown', 4, 10, 12, 90),
  csRow: ex('Chest-Supported DB Row', 3, 10, 12, 90, { inc: 2 }),
  oneArmRow: ex('Single-Arm DB Row', 3, 10, 12, 90, { inc: 2, note: 'Reps per arm' }),
  preacher: ex('EZ-Bar Preacher Curl', 3, 10, 12, 60),
  cableCurl: ex('Cable Curl', 3, 12, 15, 60, { inc: 1 }),
  ropeHammer: ex('Rope Hammer Curl', 2, 12, 15, 60, { inc: 1 }),
  ohpStanding: ex('Standing Overhead Press', 4, 6, 8, 120),
  cableLateral: ex('Cable Lateral Raise', 3, 12, 15, 60, { inc: 1 }),
  rearDelt: ex('Rear Delt Fly', 3, 15, 20, 60, { inc: 1 }),
  splitV: ex('Bulgarian Split Squat', 3, 8, 12, 90, { inc: 2, note: 'Reps per leg' }),
  hack: ex('Hack Squat', 3, 10, 12, 90, { inc: 5 }),
  legextV: ex('Leg Extension', 3, 12, 15, 60),
  seatedCurl: ex('Seated Leg Curl', 3, 12, 15, 60),
  seatedCalf: ex('Seated Calf Raise', 3, 12, 20, 60),
};

const day = (id, name, focus, exercises, type = 'workout', note = '') => ({
  id,
  name,
  focus,
  type,
  note,
  exercises: exercises.map((e) => ({ ...e })),
});
const rest = (id, name = 'Rest / Active Recovery') =>
  day(id, name, '8,000–10,000 steps + light mobility', [], 'rest', 'Walk, stretch, foam roll. No lifting.');

export const PROGRAM_TEMPLATES = {
  6: {
    label: '6-day Push/Pull/Legs',
    mode: 'weekly', // each day is tied to a weekday (0 = Sun)
    days: [
      { ...day('ppl-ct-a', 'Chest & Triceps: Heavy', 'Chest 4 + triceps 3', [LIB.benchH, LIB.inclineH, LIB.dips, LIB.flyLow, LIB.cgbp, LIB.pushdownH, LIB.ohextH]), weekday: 1 },
      { ...day('ppl-bb-a', 'Back & Biceps: Heavy', 'Back 4 + biceps 3', [LIB.pulldownH, LIB.rowH, LIB.cablerowH, LIB.straightArm, LIB.ezCurl, LIB.inclineCurl, LIB.hammerH]), weekday: 2 },
      { ...day('ppl-sl-a', 'Shoulders & Legs: Heavy', 'Legs 5 + shoulders 3', [LIB.squatH, LIB.rdlH, LIB.legpressH, LIB.legcurlH, LIB.calfH, LIB.dbPress, LIB.lateralH, LIB.facepullH]), weekday: 3 },
      { ...day('ppl-ct-b', 'Chest & Triceps: Volume', 'Chest 4 + triceps 2', [LIB.inclineBB, LIB.flatDB, LIB.pecDeck, LIB.pushupV, LIB.skull, LIB.singlePush]), weekday: 4 },
      { ...day('ppl-bb-b', 'Back & Biceps: Volume', 'Back 4 + biceps 3', [LIB.pulldownWide, LIB.csRow, LIB.oneArmRow, LIB.facepullH, LIB.preacher, LIB.cableCurl, LIB.ropeHammer]), weekday: 5 },
      { ...day('ppl-sl-b', 'Shoulders & Legs: Volume', 'Shoulders 3 + legs 5', [LIB.ohpStanding, LIB.cableLateral, LIB.rearDelt, LIB.splitV, LIB.hack, LIB.legextV, LIB.seatedCurl, LIB.seatedCalf]), weekday: 6 },
      { ...rest('ppl-rest', 'Rest Day'), focus: 'Walk 8,000 steps, eat your surplus, sleep 8 h', weekday: 0 },
    ],
  },
  3: {
    label: '3-day Full Body',
    days: [
      day('fb-a', 'Full Body A: Strength', 'Squat, bench, row', [LIB.squat, LIB.bench, LIB.row, LIB.ohp, LIB.plank]),
      rest('fb-r1'),
      day('fb-b', 'Full Body B: Hypertrophy', 'Deadlift, incline, pull-ups', [LIB.deadlift, LIB.incline, LIB.pullup, LIB.split, LIB.lateral, LIB.hlr]),
      rest('fb-r2'),
      day('fb-c', 'Full Body C: Conditioning', 'Legs, push/pull, finisher', [LIB.goblet, LIB.pushup, LIB.cablerow, LIB.hipthrust, LIB.swing, LIB.bike]),
      rest('fb-r3'),
      rest('fb-r4', 'Rest'),
    ],
  },
  4: {
    label: '4-day Upper/Lower',
    days: [
      day('d1', 'Upper Body Strength', 'Push / pull focus', [LIB.bench, LIB.row, LIB.ohp, LIB.pulldown, LIB.facepull, LIB.curl, LIB.pushdown]),
      day('d2', 'Lower Body & Core', 'Squat, hinge, core', [LIB.squat, LIB.rdl, LIB.split, LIB.legcurl, LIB.calf, LIB.hlr, LIB.plank]),
      rest('d3'),
      day('d4', 'Upper Body Hypertrophy', 'Volume & pump', [LIB.incline, LIB.cablerow, LIB.lateral, LIB.pullup, LIB.fly, LIB.hammer, LIB.ohext]),
      day('d5', 'Lower Body & Conditioning', 'Hinge, legs, finisher', [LIB.deadlift, LIB.legpress, LIB.hipthrust, LIB.legext, LIB.swing, LIB.bike]),
    ],
  },
  5: {
    label: '5-day Upper/Lower + Conditioning',
    days: [
      day('d1', 'Upper Body Strength', 'Push / pull focus', [LIB.bench, LIB.row, LIB.ohp, LIB.pulldown, LIB.facepull, LIB.curl, LIB.pushdown]),
      day('d2', 'Lower Body & Core', 'Squat, hinge, core', [LIB.squat, LIB.rdl, LIB.split, LIB.legcurl, LIB.calf, LIB.hlr, LIB.plank]),
      rest('d3'),
      day('d4', 'Upper Body Hypertrophy', 'Volume & pump', [LIB.incline, LIB.cablerow, LIB.lateral, LIB.pullup, LIB.fly, LIB.hammer, LIB.ohext]),
      day('d5', 'Lower Body & Conditioning', 'Hinge, legs, finisher', [LIB.deadlift, LIB.legpress, LIB.hipthrust, LIB.legext, LIB.swing, LIB.bike]),
      day('d6', 'Full Body Conditioning & Core', 'Carries, swings, core', [LIB.goblet, LIB.pushup, LIB.cablerow, LIB.carry, LIB.swing, LIB.hlr, LIB.plank]),
      rest('d7', 'Rest'),
    ],
  },
};

export const cloneProgram = (size) => {
  const t = PROGRAM_TEMPLATES[size];
  return { template: size, label: t.label, mode: t.mode || 'rotation', days: JSON.parse(JSON.stringify(t.days)) };
};

// ---------- Plan v2 for existing installs ----------
const OLD_PRESET_IDS = ['shake', 'eggs-almonds', 'dates', 'lunch', 'dinner'];
const cm = (inches) => Math.round(inches * 2.54 * 100) / 100;

/**
 * Moves an existing install onto plan v2: new goal, targets, meals, reminders, supplements and
 * the weekday split. Keeps every log, workout session, body entry and any custom presets/reminders.
 */
export function applyPlanV2(d, todayKey) {
  d.profile = { ...d.profile, ...DEFAULT_PROFILE, weightKg: d.profile.weightKg || 74, age: d.profile.age || 31 };
  d.targets = { ...d.targets, ...DEFAULT_TARGETS };
  d.settings = { ...d.settings, measureUnit: d.settings.measureUnit || 'in' };

  const supps = [...d.supplements];
  for (const s of DEFAULT_SUPPLEMENTS) {
    const i = supps.findIndex((x) => x.id === s.id);
    if (i >= 0) supps[i] = { ...supps[i], dose: s.dose };
    else supps.push({ ...s });
  }
  const order = DEFAULT_SUPPLEMENTS.map((s) => s.id);
  d.supplements = supps.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));

  const custom = d.presets.filter((p) => !OLD_PRESET_IDS.includes(p.id) && !DEFAULT_PRESETS.some((x) => x.id === p.id));
  d.presets = [...DEFAULT_PRESETS.map((p) => ({ ...p })), ...custom];

  const customRem = d.reminders.filter((r) => !r.builtin);
  d.reminders = [...JSON.parse(JSON.stringify(DEFAULT_REMINDERS)), ...customRem];

  if (!d.activeSession) d.program = cloneProgram(6);

  if (todayKey && !d.body.some((b) => b.chest || b.arm)) {
    const i = d.body.findIndex((b) => b.date === todayKey);
    const entry = { date: todayKey, weight: 74, chest: cm(38.5), arm: cm(15) };
    if (i >= 0) d.body[i] = { ...d.body[i], ...entry, weight: d.body[i].weight ?? 74 };
    else d.body.push(entry);
    d.body.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  d.meta = { ...d.meta, plan: PLAN_VERSION, planAppliedAt: Date.now() };
  return d;
}

export const makeDefaultState = () => ({
  version: 1,
  profile: { ...DEFAULT_PROFILE },
  targets: { ...DEFAULT_TARGETS },
  settings: { ...DEFAULT_SETTINGS },
  supplements: DEFAULT_SUPPLEMENTS.map((s) => ({ ...s })),
  presets: DEFAULT_PRESETS.map((p) => ({ ...p })),
  reminders: JSON.parse(JSON.stringify(DEFAULT_REMINDERS)),
  program: cloneProgram(6),
  sessions: [],
  activeSession: null,
  days: {},
  body: [],
  meta: { snoozes: [], lastBackup: null, createdAt: Date.now(), plan: PLAN_VERSION },
});
