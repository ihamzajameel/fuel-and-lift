// Pure logic shared by the scheduler and the chat handlers (no I/O here, so it's unit-testable).

// ---------------------------------------------------------------- time
export const toMin = (t) => {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const fromMin = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const fmt12 = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
export const weekday = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** Wall-clock date and minute-of-day in the user's timezone. */
export function localParts(ms, tz = 'UTC') {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  } catch {
    return localParts(ms, 'UTC');
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/** The app's "logical day": anything before dayStartHour (default 4 AM) belongs to the previous day. */
export function logicalNow(ms, tz, startHour = 4) {
  const { ymd, min } = localParts(ms, tz);
  const day = min < startHour * 60 ? addDays(ymd, -1) : ymd;
  return { day, rel: (min - startHour * 60 + 1440) % 1440, min };
}
export const relOf = (t, startHour = 4) => (toMin(t) - startHour * 60 + 1440) % 1440;

export function slotTimes(rem, startHour = 4) {
  if (rem.kind !== 'interval') return [rem.time];
  const base = startHour * 60;
  const s = relOf(rem.start, startHour);
  const e = relOf(rem.end, startHour);
  const every = Math.max(15, Number(rem.every) || 90);
  const out = [];
  for (let m = s; m <= e && out.length < 96; m += every) out.push(fromMin(m + base));
  return out;
}

/** Reminder occurrences that became due within the last `windowMin` minutes and haven't been sent. */
export function dueNow(state, nowMs, sent = {}, windowMin = 10) {
  const sh = state.dayStartHour ?? 4;
  const { day, rel } = logicalNow(nowMs, state.tz, sh);
  const out = [];
  for (const rem of state.reminders || []) {
    if (!rem.enabled) continue;
    if (rem.days?.length && !rem.days.includes(weekday(day))) continue;
    for (const t of slotTimes(rem, sh)) {
      const diff = rel - relOf(t, sh);
      if (diff < 0 || diff >= windowMin) continue;
      const okey = `${rem.id}@${day}@${t}`;
      if (!sent[okey]) out.push({ rem, okey, day, time: t });
    }
  }
  return out;
}

export function nextUp(state, nowMs) {
  const sh = state.dayStartHour ?? 4;
  const { day, rel } = logicalNow(nowMs, state.tz, sh);
  let best = null;
  for (const rem of state.reminders || []) {
    if (!rem.enabled || (rem.days?.length && !rem.days.includes(weekday(day)))) continue;
    for (const t of slotTimes(rem, sh)) {
      const r = relOf(t, sh);
      if (r > rel && (!best || r < best.r)) best = { r, t, rem };
    }
  }
  return best;
}

// ---------------------------------------------------------------- today view
const ZERO = () => ({ kcal: 0, p: 0, c: 0, f: 0, water: 0 });

/**
 * Today's totals as the bot sees them: the app's last snapshot plus any Telegram
 * events the app hasn't applied yet (undo events subtract what they reverse).
 */
export function todayView(db, nowMs) {
  const s = db.state;
  const { day } = logicalNow(nowMs, s.tz, s.dayStartHour ?? 4);
  const snap = s.today?.key === day ? s.today : null;
  const v = {
    day,
    totals: { ...ZERO(), ...(snap?.totals || {}) },
    presetIds: new Set(snap?.presetIds || []),
    supps: { ...(snap?.supps || {}) },
    done: new Set(snap?.done || []),
    trained: !!snap?.trained,
    steps: snap?.steps ?? null,
    sleep: snap?.sleep ?? null,
  };
  const applied = s.lastEventId || 0;
  const byId = new Map(db.events.map((e) => [e.id, e]));
  for (const e of db.events) {
    if (e.id <= applied || e.day !== day) continue;
    if (e.type === 'undo') {
      const ref = byId.get(e.data.ref) || e.data.refEvent;
      if (ref && ref.day === day) applyToView(v, ref, s, -1);
    } else applyToView(v, e, s, +1);
  }
  for (const k of Object.keys(v.totals)) v.totals[k] = Math.round(v.totals[k] * 10) / 10;
  return v;
}

function applyToView(v, e, s, sign) {
  const add = (m) => {
    for (const k of ['kcal', 'p', 'c', 'f']) v.totals[k] += sign * (Number(m[k]) || 0);
  };
  switch (e.type) {
    case 'water':
      v.totals.water += sign * (Number(e.data.ml) || 0);
      break;
    case 'preset': {
      const p = (s.presets || []).find((x) => x.id === e.data.presetId);
      if (!p) break;
      add(p);
      if (sign > 0) {
        v.presetIds.add(p.id);
        if (p.supplementId) v.supps[p.supplementId] = true;
      } else v.presetIds.delete(p.id);
      break;
    }
    case 'food':
      add(e.data);
      break;
    case 'supp':
      v.supps[e.data.id] = sign > 0 ? e.data.value !== false : false;
      break;
    case 'done':
      if (sign > 0) v.done.add(e.data.okey);
      else v.done.delete(e.data.okey);
      break;
    case 'steps':
      v.steps = sign > 0 ? e.data.steps : null;
      break;
    case 'sleep':
      v.sleep = sign > 0 ? e.data.hours : null;
      break;
    case 'workout':
      v.trained = sign > 0;
      break;
  }
}

export function isDone(rem, okey, v) {
  if (v.done.has(okey)) return true;
  const a = rem.actions || {};
  if (a.presetIds?.length && a.presetIds.some((id) => v.presetIds.has(id))) return true;
  if (!a.presetIds?.length && a.supplementIds?.length && a.supplementIds.every((id) => v.supps[id])) return true;
  if (a.openTab === 'train' && v.trained) return true;
  return false;
}

/** Front-loaded water pace, identical to the app's. */
export function waterPace(rel, t, startHour = 4) {
  const a = relOf(t.waterStart || '09:30', startHour);
  const b = relOf(t.waterFrontBy || '21:00', startHour);
  const c = relOf(t.waterEnd || '01:00', startHour);
  const total = Number(t.water) || 2800;
  const front = (total * (Number(t.waterFrontPct) || 80)) / 100;
  if (rel <= a) return 0;
  if (rel <= b) return Math.round((front * (rel - a)) / Math.max(1, b - a));
  if (rel <= c) return Math.round(front + ((total - front) * (rel - b)) / Math.max(1, c - b));
  return total;
}

// ---------------------------------------------------------------- formatting
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const L = (ml) => `${(ml / 1000).toFixed(ml % 100 === 0 ? 1 : 2)} L`;
export const n0 = (x) => Math.round(Number(x) || 0).toLocaleString('en-US');

export const EMOJI = { coffee: '🥤', droplet: '💧', salad: '🥗', egg: '🥚', zap: '⚡', dumbbell: '🏋️', utensils: '🍽️', moon: '🌙', pill: '💊', nut: '🥜', ruler: '📏', bell: '🔔' };

export function describeActions(rem, state) {
  const a = rem.actions || {};
  const parts = [];
  for (const id of a.presetIds || []) {
    const p = (state.presets || []).find((x) => x.id === id);
    if (p) parts.push(p.name);
  }
  if (a.waterMl) parts.push(`${a.waterMl} ml`);
  for (const id of a.supplementIds || []) {
    const s = (state.supplements || []).find((x) => x.id === id);
    if (s && s.stock === 0) continue; // out of stock: nothing to take
    parts.push(s ? s.name : id);
  }
  return parts;
}

export function shortStatus(v, t) {
  return `Today: ${n0(v.totals.kcal)}/${n0(t.kcal)} kcal · ${n0(v.totals.p)}/${n0(t.p)} g protein · ${L(v.totals.water)}/${L(t.water)}`;
}

export function statusText(db, nowMs) {
  const s = db.state;
  const t = s.targets || {};
  const v = todayView(db, nowMs);
  const { rel } = logicalNow(nowMs, s.tz, s.dayStartHour ?? 4);
  const pace = waterPace(rel, t, s.dayStartHour ?? 4);
  const left = t.kcal - v.totals.kcal;
  const tick = (b) => (b ? '✅' : '⬜');
  const supps = (s.supplements || []).map((x) => `${x.name} ${tick(v.supps[x.id])}`).join(' · ');
  const next = nextUp(s, nowMs);
  const lines = [
    `📊 <b>Today</b> (${v.day})`,
    `🔥 ${n0(v.totals.kcal)} / ${n0(t.kcal)} kcal (${left >= 0 ? `${n0(left)} left` : `${n0(-left)} over`})`,
    `🥩 ${n0(v.totals.p)} / ${t.p} g protein${v.totals.p >= t.p ? ' ✅' : ''}`,
    `🍚 ${n0(v.totals.c)} / ${t.c} g carbs · 🧈 ${n0(v.totals.f)} / ${t.f} g fat`,
    `💧 ${L(v.totals.water)} / ${L(t.water)} (pace ${L(pace)})`,
    supps && `💊 ${supps}`,
    v.sleep != null && `😴 ${v.sleep} h sleep`,
    v.steps != null && `👟 ${n0(v.steps)} steps`,
    s.nextWorkout && `🏋️ ${esc(s.nextWorkout)}`,
    next && `\n⏭ Next: ${fmt12(next.t)} · ${esc(next.rem.title)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export const HELP = [
  '<b>Log by replying in plain words</b>',
  '<code>500</code> or <code>water 300</code>: water (ml)',
  '<code>shake</code>, <code>lunch</code>, <code>eggs</code>, <code>nuts</code>, <code>dates</code>: your meals',
  '<code>roti chicken</code>, <code>rice chicken</code>, <code>mutton</code>, <code>daal</code>: dinner (or <code>dinner</code> to pick)',
  '<code>creatine</code>, <code>whey</code>, <code>vit c</code>, <code>ashwa</code>: tick a supplement',
  '<code>chicken rice 550 kcal 45p 60c 12f</code>: any other food',
  '<code>gym done</code>: log today\'s workout as planned',
  '📸 Send a <b>photo of your meal</b>: I estimate it, you tap Log (a caption like <code>3 roti</code> helps)',
  '<code>stock vit c 30</code> · <code>bought creatine 60</code>: supplement stock',
  '<code>w 74.2</code> · <code>waist 33</code> · <code>chest 38.5</code> · <code>bicep 15</code> (inches)',
  '<code>sleep 8</code> · <code>steps 9500</code>',
  'Combine with commas: <code>shake, 500, creatine</code>',
  '',
  '/status: today so far · /undo: undo the last log · /help',
].join('\n');

// ---------------------------------------------------------------- parsing replies
const num = (s) => Number(String(s).replace(/,/g, '.'));
const STOP = new Set(['the', 'and', 'with', 'my', 'a', 'of', 'ml', 'kcal', 'cal', 'log', 'ate', 'had']);
const words = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));

/** Split a message into separate items: "shake, 500 + creatine" */
export const splitParts = (text) =>
  text
    .split(/\s*(?:,|;|\n|\s\+\s|\band\b|&)\s*/i)
    .map((x) => x.trim())
    .filter(Boolean);

/** Returns { type, data, label } or null. */
export function parsePart(part, state) {
  const p = part.trim();
  const l = p.toLowerCase();
  let m;

  if ((m = l.match(/^(?:weight|wt|w|kg)\s*[:=]?\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:kg)?$/)) || (m = l.match(/^(\d{2,3}(?:[.,]\d{1,2})?)\s*kgs?$/))) {
    const kg = num(m[1]);
    if (kg >= 30 && kg <= 250) return { type: 'body', data: { weight: kg }, label: `⚖️ Weight ${kg} kg` };
  }
  if ((m = l.match(/^(waist|chest|biceps?|arms?)\s*[:=]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(in|inch|inches|"|cm)?$/))) {
    const field = m[1].startsWith('waist') ? 'waist' : m[1].startsWith('chest') ? 'chest' : 'arm';
    const val = num(m[2]);
    const ok = { waist: [50, 200], chest: [60, 200], arm: [20, 70] }[field];
    const toCm = (u) => (u === 'in' ? Math.round(val * 2.54 * 100) / 100 : val);
    const inRange = (u) => toCm(u) >= ok[0] && toCm(u) <= ok[1];
    let unit = m[3] === 'cm' ? 'cm' : m[3] ? 'in' : state.measureUnit === 'cm' ? 'cm' : 'in';
    if (!m[3] && !inRange(unit)) unit = unit === 'in' ? 'cm' : 'in'; // "waist 88" is clearly cm
    const cm = toCm(unit);
    const name = { waist: 'Waist', chest: 'Chest', arm: 'Bicep' }[field];
    if (cm >= ok[0] && cm <= ok[1]) return { type: 'body', data: { [field]: cm }, label: `📏 ${name} ${val}${unit === 'in' ? '"' : ' cm'}` };
  }
  if (/^(?:(?:gym|workout|training|lifting)\s*(?:done|finished|complete|completed|ok|✅)?|trained|lifted|done\s*(?:gym|workout|training))$/.test(l)) {
    return { type: 'workout', data: { asPlanned: true }, label: `🏋️ Workout logged as planned${state.nextWorkout ? `: ${state.nextWorkout}` : ''}` };
  }
  if ((m = l.match(/^(?:sleep|slept)\s*[:=]?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:h|hrs?|hours?)?$/))) {
    const h = num(m[1]);
    if (h > 0 && h <= 16) return { type: 'sleep', data: { hours: h }, label: `😴 Sleep ${h} h` };
  }
  if ((m = l.match(/^steps?\s*[:=]?\s*(\d[\d,]{2,7})$/)) || (m = l.match(/^(\d[\d,]{2,7})\s*steps?$/))) {
    const st = Number(m[1].replace(/,/g, ''));
    if (st >= 0 && st <= 100000) return { type: 'steps', data: { steps: st }, label: `👟 ${n0(st)} steps` };
  }
  if ((m = l.match(/^(?:water|drank|drink|💧)?\s*\+?\s*(\d(?:[.,]\d{1,2})?)\s*(?:l|lt|ltr|litres?|liters?)(?:\s*water)?$/))) {
    const ml = Math.round(num(m[1]) * 1000);
    if (ml >= 50 && ml <= 3000) return { type: 'water', data: { ml }, label: `💧 +${ml} ml water` };
  }
  if ((m = l.match(/^(?:water|drank|drink|💧)?\s*\+?\s*(\d{2,4})\s*(?:ml)?(?:\s*water)?$/))) {
    const ml = Number(m[1]);
    if (ml >= 30 && ml <= 3000) return { type: 'water', data: { ml }, label: `💧 +${ml} ml water` };
  }

  // Custom food with numbers: "chicken rice 550 kcal 45p 60c 12f" / "food oats 300"
  if (/\d\s*(?:kcal|cal|calories)\b/.test(l) || /^(?:food|ate|eat|log)\s+/.test(l) || /\d+\s*g?\s*(?:p|protein)\b/.test(l)) {
    const food = parseFood(p);
    if (food) return { type: 'food', data: food, label: `🍽️ ${food.name}: ${food.kcal} kcal, ${food.p} g P` };
  }

  // Supplement stock: "stock vit c 30" (set) / "bought creatine 60" (add)
  if ((m = l.match(/^(stock|have|refill|refilled|bought)\s+(.+?)\s+(\d{1,4})\s*(?:capsules?|caps|scoops?|servings?|tabs?|tablets?|pills?)?$/))) {
    const want = m[2].replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length >= 3);
    const s = (state.supplements || []).find((x) => {
      const names = [x.id.toLowerCase(), ...words(x.name)];
      return want.some((t) => names.some((n) => n.startsWith(t) || t.startsWith(n)));
    });
    if (s) {
      const mode = ['stock', 'have'].includes(m[1]) ? 'set' : 'add';
      return { type: 'stock', data: { id: s.id, count: Number(m[3]), mode }, label: `📦 ${s.name}: ${mode === 'set' ? '' : '+'}${m[3]} ${s.stockUnit || 'in stock'}` };
    }
  }
  // Supplements: "creatine", "whey", "vit c", "ashwa"
  const toks = l.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  for (const s of state.supplements || []) {
    const names = [s.id.toLowerCase(), ...words(s.name), s.name.toLowerCase().replace(/[^a-z0-9]/g, '')];
    const hit =
      names.some((n) => n === l.replace(/[^a-z0-9]/g, '')) ||
      toks.some((t) => t.length >= 3 && names.some((n) => n.startsWith(t) || (n.length >= 4 && t.startsWith(n))));
    if (hit && toks.length <= 3) return { type: 'supp', data: { id: s.id, value: true }, label: `💊 ${s.name} ✓` };
  }

  // Presets: best word overlap ("shake" → Morning Shake, "eggs" → 2 Eggs + 6 Almonds)
  const want = words(l);
  if (want.length) {
    const scored = (state.presets || [])
      .map((pr) => {
        const have = words(pr.name);
        return { pr, score: want.filter((w) => have.some((h) => h === w || h.startsWith(w) || w.startsWith(h))).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (top && top.score >= Math.ceil(want.length / 2)) {
      const tied = scored.filter((x) => x.score === top.score);
      if (tied.length > 1)
        return { type: 'choose', data: { presetIds: tied.slice(0, 6).map((x) => x.pr.id) }, label: `Which ${p}?` };
      return { type: 'preset', data: { presetId: top.pr.id }, label: `🍽️ ${top.pr.name} (${top.pr.kcal} kcal, ${top.pr.p} g P)` };
    }
  }
  return null;
}

export function parseFood(text) {
  const body = text.replace(/^(?:food|ate|eat|log)\s+/i, '');
  const grab = (re) => {
    const m = body.match(re);
    return m ? num(m[1]) : null;
  };
  let kcal = grab(/(\d+(?:[.,]\d+)?)\s*(?:kcal|cal|calories)\b/i);
  const p = grab(/(\d+(?:[.,]\d+)?)\s*g?\s*(?:p|prot|protein)\b/i);
  const c = grab(/(\d+(?:[.,]\d+)?)\s*g?\s*(?:c|carbs?)\b/i);
  const f = grab(/(\d+(?:[.,]\d+)?)\s*g?\s*(?:f|fats?)\b/i);
  let name = body
    .replace(/(\d+(?:[.,]\d+)?)\s*g?\s*(?:kcal|calories|cal|protein|prot|p|carbs?|c|fats?|f)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (kcal == null) {
    const m = name.match(/(\d{2,4})\s*$/);
    if (m) {
      kcal = Number(m[1]);
      name = name.slice(0, m.index).trim();
    }
  }
  if (kcal == null && p == null && c == null && f == null) return null;
  if (kcal == null) kcal = Math.round(4 * (p || 0) + 4 * (c || 0) + 9 * (f || 0));
  name = name.replace(/^[-:\s]+|[-:\s]+$/g, '') || 'Quick add';
  return { name: name.charAt(0).toUpperCase() + name.slice(1), qty: 1, unit: 'serving', kcal: Math.round(kcal), p: p || 0, c: c || 0, f: f || 0 };
}

/** Low/out-of-stock lines for the supplements a reminder covers. */
export function stockNotes(rem, state) {
  const out = [];
  for (const id of rem.actions?.supplementIds || []) {
    const s = (state.supplements || []).find((x) => x.id === id);
    if (!s || s.stock == null) continue;
    const short = s.name.split(/\s+/)[0].toLowerCase();
    if (s.stock <= 0) out.push(`⚠️ ${s.name} is out. Buy more, then reply "bought ${short} 30".`);
    else if (s.stock <= (s.lowAt ?? 5)) out.push(`🛒 ${s.name}: only ${s.stock} ${s.stockUnit || 'left'}. Time to restock.`);
  }
  return out;
}
