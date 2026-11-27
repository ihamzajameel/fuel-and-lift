// Pre-loaded defaults for Fuel & Lift. Everything here is editable in the app.

export const DEFAULT_PROFILE = {
  age: 31,
  sex: 'male',
  weightKg: 74,
  heightCm: 175,
  activity: 1.55, // moderately active: 4 lifting sessions + steps
  goal: 'Belly fat loss + strength gain',
  gymTime: '22:00',
  bedTime: '02:00',
};

export const DEFAULT_TARGETS = {
  kcal: 2200,
  p: 145,
  c: 220,
  f: 65,
  water: 2800,
  steps: 9000, // NEAT matters for fat loss: 8–10k/day
  sleepHours: 7.5, // 2:00 AM bed -> ~9:30 AM wake
  // Water pacing: front-load 80% before 9 PM to avoid night-time washroom trips.
  waterStart: '09:30',
  waterFrontBy: '21:00',
  waterFrontPct: 80,
  waterEnd: '01:00',
};

export const DEFAULT_SETTINGS = {
  theme: 'dark', // dark | light | system
  sound: true,
  vibrate: true,
  autoRest: true,
  keepAwake: true,
  dayStartHour: 4, // logs before 4 AM count toward the previous day
  barKg: 20,
};

export const DEFAULT_SUPPLEMENTS = [
  { id: 'whey', name: 'ON Whey', dose: '1 scoop' },
  { id: 'creatine', name: 'Creatine', dose: '5 g monohydrate' },
  { id: 'ashwa', name: 'Ashwagandha', dose: '1 capsule · optional' },
];

export const DEFAULT_PRESETS = [
  {
    id: 'shake',
    name: 'Morning Shake',
    detail: 'ON Whey + 250 ml milk + banana + 4×15 mL oats + 15 mL seeds + 5 mL PB',
    qty: 1,
    unit: 'serving',
    kcal: 480,
    p: 35,
    c: 58,
    f: 12,
    supplementId: 'whey',
  },
  { id: 'eggs-almonds', name: '2 Eggs + 6 Almonds', detail: 'Evening snack', qty: 1, unit: 'serving', kcal: 190, p: 14, c: 2, f: 14 },
  { id: 'dates', name: '2 Dates', detail: 'Pre-workout fuel', qty: 2, unit: 'piece', kcal: 130, p: 1, c: 35, f: 0 },
  {
    id: 'lunch',
    name: 'Lunch Plate',
    detail: 'Estimate: lean protein + veg + 1 carb. Edit to match your plate',
    qty: 1,
    unit: 'serving',
    kcal: 600,
    p: 45,
    c: 60,
    f: 18,
  },
  {
    id: 'dinner',
    name: 'Post-Workout Dinner',
    detail: 'Estimate. Edit to match your usual dinner',
    qty: 1,
    unit: 'serving',
    kcal: 650,
    p: 50,
    c: 65,
    f: 20,
  },
];

export const DEFAULT_REMINDERS = [
  {
    id: 'morning',
    title: 'Morning shake + 500 ml water',
    body: '1 scoop ON Whey + 250 ml milk + 1 banana + 4× 15 mL oats + 1× 15 mL mixed seeds + 1× 5 mL peanut butter. Then 500 ml water.',
    kind: 'fixed',
    time: '09:30',
    enabled: true,
    days: [],
    icon: 'coffee',
    actions: { presetIds: ['shake'], waterMl: 500, supplementIds: [] },
    builtin: true,
  },
  {
    id: 'hydration',
    title: 'Hydration check',
    body: 'Sip 200–250 ml water.',
    kind: 'interval',
    start: '11:00',
    end: '21:00',
    every: 90,
    enabled: true,
    days: [],
    icon: 'droplet',
    dynamic: 'water',
    actions: { presetIds: [], waterMl: 250, supplementIds: [] },
    builtin: true,
  },
  {
    id: 'lunch',
    title: 'Lunch time',
    body: 'Plate method: lean protein + veggies + 1 carb source.',
    kind: 'fixed',
    time: '16:00',
    enabled: true,
    days: [],
    icon: 'salad',
    actions: { presetIds: ['lunch'], waterMl: 0, supplementIds: [] },
    builtin: true,
  },
  {
    id: 'snack',
    title: 'Evening snack',
    body: '2 whole eggs + 6–8 almonds.',
    kind: 'fixed',
    time: '19:00',
    enabled: true,
    days: [],
    icon: 'egg',
    actions: { presetIds: ['eggs-almonds'], waterMl: 0, supplementIds: [] },
    builtin: true,
  },
  {
    id: 'preworkout',
    title: 'Pre-workout fuel',
    body: '2 dates + 250 ml water with a pinch of salt. Caffeine-free.',
    kind: 'fixed',
    time: '21:30',
    enabled: true,
    days: [],
    icon: 'zap',
    actions: { presetIds: ['dates'], waterMl: 250, supplementIds: [] },
    builtin: true,
  },
  {
    id: 'gym',
    title: 'Gym time',
    body: 'Workout starts now. Open today’s session and get moving.',
    kind: 'fixed',
    time: '22:00',
    enabled: true,
    days: [],
    icon: 'dumbbell',
    actions: { presetIds: [], waterMl: 0, supplementIds: [], openTab: 'train' },
    builtin: true,
  },
  {
    id: 'postworkout',
    title: 'Post-workout dinner + creatine',
    body: 'Dinner + 5 g creatine monohydrate with 300 ml water.',
    kind: 'fixed',
    time: '00:45',
    enabled: true,
    days: [],
    icon: 'utensils',
    actions: { presetIds: ['dinner'], waterMl: 300, supplementIds: ['creatine'] },
    builtin: true,
  },
  {
    id: 'winddown',
    title: 'Wind down',
    body: 'Lights low, screens dim. Optional ashwagandha capsule. Sleep by 2:00 AM.',
    kind: 'fixed',
    time: '01:30',
    enabled: true,
    days: [],
    icon: 'moon',
    actions: { presetIds: [], waterMl: 0, supplementIds: ['ashwa'] },
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
  return { template: size, label: t.label, days: JSON.parse(JSON.stringify(t.days)) };
};

export const makeDefaultState = () => ({
  version: 1,
  profile: { ...DEFAULT_PROFILE },
  targets: { ...DEFAULT_TARGETS },
  settings: { ...DEFAULT_SETTINGS },
  supplements: DEFAULT_SUPPLEMENTS.map((s) => ({ ...s })),
  presets: DEFAULT_PRESETS.map((p) => ({ ...p })),
  reminders: JSON.parse(JSON.stringify(DEFAULT_REMINDERS)),
  program: cloneProgram(4),
  sessions: [],
  activeSession: null,
  days: {},
  body: [],
  meta: { snoozes: [], lastBackup: null, createdAt: Date.now() },
});
