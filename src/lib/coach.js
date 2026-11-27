// Evidence-based coaching rules turned into simple, explainable insights.
// - Fat loss while keeping strength: ~0.5–1% of body weight per week.
// - Protein 1.6–2.2 g/kg, spread over 3–5 feedings of ~25–40 g.
// - Creatine monohydrate: daily consistency matters (saturation); 0.5–2 kg water gain early on.
// - Sleep < 7 h impairs fat loss (more lean mass lost) and recovery.
// - Front-load water so sleep isn't broken by washroom trips.
import { addDays, daysBetween, minutesIntoDay, toMin } from './time';
import { dayTotals } from './nutrition';
import { lastNKeys } from './stats';
import { exerciseNamesWithHistory, strengthHistory } from './workout';

const r1 = (n) => Math.round(n * 10) / 10;

/** Least-squares slope in kg/week over points [{date, value}]. */
function slopePerWeek(points) {
  if (points.length < 2) return null;
  const x0 = points[0].date;
  const xs = points.map((p) => daysBetween(x0, p.date));
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? (num / den) * 7 : null;
}

export function bodyTrend(body, field, today, windowDays = 28) {
  const from = addDays(today, -windowDays);
  const pts = body.filter((b) => b[field] != null && b.date >= from).map((b) => ({ date: b.date, value: b[field] }));
  if (pts.length < 2 || daysBetween(pts[0].date, pts[pts.length - 1].date) < 10) return null;
  return { perWeek: slopePerWeek(pts), span: daysBetween(pts[0].date, pts[pts.length - 1].date), n: pts.length };
}

/** 0–100 adherence score for one logical day. */
export function dailyScore(state, key) {
  const day = state.days[key];
  const t = state.targets;
  const tot = dayTotals(day);
  const trained = state.sessions.some((s) => s.date === key && !s.rest);
  const items = [
    { id: 'protein', label: `Protein ≥ ${Math.round(t.p * 0.9)} g`, ok: tot.p >= t.p * 0.9, w: 25 },
    { id: 'kcal', label: 'Calories within target', ok: tot.kcal >= t.kcal * 0.85 && tot.kcal <= t.kcal * 1.08, w: 20 },
    { id: 'water', label: 'Water ≥ 90%', ok: tot.water >= t.water * 0.9, w: 15 },
    { id: 'move', label: `Workout or ${(t.steps / 1000).toFixed(0)}k steps`, ok: trained || (day?.steps || 0) >= t.steps, w: 20 },
    { id: 'creatine', label: 'Creatine taken', ok: !!day?.supps?.creatine, w: 10 },
    { id: 'sleep', label: `Slept ≥ ${t.sleepHours - 0.5} h`, ok: (day?.sleep?.hours || 0) >= t.sleepHours - 0.5, w: 10 },
  ];
  const logged = !!day && (tot.kcal > 0 || tot.water > 0 || Object.values(day.supps || {}).some(Boolean) || trained || day.sleep || day.steps);
  return { score: items.reduce((a, i) => a + (i.ok ? i.w : 0), 0), items, logged };
}

export function insights(state, today) {
  const out = [];
  const t = state.targets;
  const weight = state.profile.weightKg;
  const yesterday = addDays(today, -1);
  const last7 = lastNKeys(yesterday, 7);
  const loggedDays = last7.filter((k) => dayTotals(state.days[k]).kcal > 0);

  // 1) Weight trend -> calorie adjustment
  const wt = bodyTrend(state.body, 'weight', today);
  const waist = bodyTrend(state.body, 'waist', today);
  if (!wt) {
    out.push({
      id: 'weigh',
      tone: 'info',
      title: 'Unlock trend coaching',
      text: 'Weigh yourself 2–3× a week, first thing in the morning after the washroom, and measure your waist weekly at the navel. After ~2 weeks the coach can tune your calories.',
    });
  } else {
    const pct = (wt.perWeek / weight) * 100;
    const rate = `${wt.perWeek > 0 ? '+' : ''}${r1(wt.perWeek)} kg/week (${r1(pct)}%)`;
    if (pct < -1.1) {
      out.push({
        id: 'fast',
        tone: 'warn',
        title: 'Losing faster than ideal',
        text: `Trend: ${rate}. Above ~1%/week you risk losing muscle and strength. Add about 150 kcal (from carbs, around training).`,
        action: { label: '+150 kcal', delta: 150 },
      });
    } else if (pct <= -0.25) {
      out.push({ id: 'ontrack', tone: 'good', title: 'Fat loss on track', text: `Trend: ${rate}. 0.5–1% per week is the sweet spot for losing belly fat while keeping strength. Keep everything as is.` });
    } else if (waist && waist.perWeek <= -0.3) {
      out.push({
        id: 'recomp',
        tone: 'good',
        title: 'Recomposition: waist is shrinking',
        text: `Scale is flat (${rate}) but your waist is dropping ${r1(-waist.perWeek)} cm/week. That's fat loss masked by muscle and creatine water. Don't cut calories.`,
      });
    } else if (wt.span >= 14) {
      out.push({
        id: 'stall',
        tone: 'warn',
        title: 'Progress has stalled',
        text: `Trend: ${rate} over ${wt.span} days with no waist change. First check logging accuracy (oils, sauces). If it's accurate, drop ~150 kcal or add ~2,000 daily steps.`,
        action: { label: '−150 kcal', delta: -150 },
      });
    }
  }

  // 2) Protein: amount and distribution
  if (loggedDays.length >= 3) {
    const avgP = Math.round(loggedDays.reduce((a, k) => a + dayTotals(state.days[k]).p, 0) / loggedDays.length);
    const perKg = r1(avgP / weight);
    const feedings = r1(
      loggedDays.reduce((a, k) => a + (state.days[k].foods || []).filter((f) => f.p >= 20).length, 0) / loggedDays.length
    );
    if (avgP < t.p * 0.9)
      out.push({
        id: 'protein',
        tone: 'warn',
        title: `Protein averaging ${avgP} g (${perKg} g/kg)`,
        text: `Target is ${t.p} g (${r1(t.p / weight)} g/kg). Research supports 1.6–2.2 g/kg to keep muscle in a deficit. Easy adds: a 2nd scoop of whey, Greek yogurt, egg whites, tuna.`,
      });
    else
      out.push({
        id: 'protein',
        tone: 'good',
        title: `Protein solid: ${perKg} g/kg`,
        text:
          feedings < 3
            ? `Only ~${feedings} meals/day have 20 g+ protein. Spreading it over 3–5 meals of 25–40 g improves muscle building.`
            : `~${feedings} protein-rich meals a day, which is ideal for muscle protein synthesis.`,
      });
  }

  // 3) Water front-loading
  const front = toMin(t.waterFrontBy);
  const start = state.settings.dayStartHour;
  let early = 0;
  let total = 0;
  for (const k of last7)
    for (const w of state.days[k]?.water || []) {
      total += w.ml;
      if (minutesIntoDay(new Date(w.at), start) <= (front - start * 60 + 1440) % 1440) early += w.ml;
    }
  if (total > 2000 * 3) {
    const pct = Math.round((early / total) * 100);
    const avg = Math.round(total / Math.max(1, last7.filter((k) => (state.days[k]?.water || []).length).length));
    out.push({
      id: 'water',
      tone: pct >= t.waterFrontPct - 5 && avg >= t.water * 0.9 ? 'good' : 'warn',
      title: `${pct}% of water before ${t.waterFrontBy === '21:00' ? '9 PM' : t.waterFrontBy}`,
      text:
        pct < t.waterFrontPct - 5
          ? `Aim for ${t.waterFrontPct}%. Drinking late means washroom trips that break your sleep. Shift a 500 ml bottle to before lunch.`
          : avg < t.water * 0.9
            ? `Good timing, but you're averaging ${(avg / 1000).toFixed(1)} L of ${(t.water / 1000).toFixed(1)} L. Creatine works best when you're well hydrated.`
            : `Averaging ${(avg / 1000).toFixed(1)} L with good front-loading.`,
    });
  }

  // 4) Creatine
  const creatineDays = Object.keys(state.days).filter((k) => state.days[k]?.supps?.creatine).sort();
  if (creatineDays.length) {
    const first = creatineDays[0];
    const since = daysBetween(first, today);
    const taken14 = lastNKeys(today, 14).filter((k) => state.days[k]?.supps?.creatine).length;
    if (since <= 28)
      out.push({
        id: 'creatine-water',
        tone: 'info',
        title: `Creatine day ${since + 1}: expect some water weight`,
        text: 'Muscles store extra water as creatine saturates (often +0.5–2 kg in weeks 1–4). That is not fat. Judge belly-fat loss by your waist, not the scale.',
      });
    else if (taken14 < 12)
      out.push({
        id: 'creatine-cons',
        tone: 'warn',
        title: `Creatine: ${taken14}/14 days`,
        text: 'Creatine works by keeping muscles saturated. Daily consistency matters far more than timing. Rest days count too.',
      });
  }

  // 5) Sleep
  const sleeps = lastNKeys(today, 7)
    .map((k) => state.days[k]?.sleep?.hours)
    .filter((h) => h > 0);
  if (sleeps.length >= 3) {
    const avg = r1(sleeps.reduce((a, b) => a + b, 0) / sleeps.length);
    out.push(
      avg < 7
        ? {
            id: 'sleep',
            tone: 'warn',
            title: `Sleep averaging ${avg} h`,
            text: `Dieting on under 7 h shifts weight loss from fat toward muscle and raises hunger. With a 2 AM bedtime, protect a ${t.sleepHours} h window: blackout curtains, no phone after the wind-down reminder.`,
          }
        : { id: 'sleep', tone: 'good', title: `Sleep averaging ${avg} h`, text: 'Great for recovery, hormones and appetite control.' }
    );
  }

  // 6) Strength stall -> deload
  const top = exerciseNamesWithHistory(state.sessions).slice(0, 4);
  const stalled = [];
  for (const ex of top) {
    const h = strengthHistory(state.sessions, ex.name);
    if (h.length < 6) continue;
    const recent = Math.max(...h.slice(-3).map((p) => p.value));
    const before = Math.max(...h.slice(-6, -3).map((p) => p.value));
    if (recent <= before) stalled.push(ex.name);
  }
  if (stalled.length >= 2)
    out.push({
      id: 'deload',
      tone: 'warn',
      title: 'Strength has plateaued',
      text: `${stalled.slice(0, 3).join(', ')} haven't improved in 3 sessions. Take a deload week: same exercises, about half the sets at ~90% of your weights. Then push again. Also check sleep and protein.`,
    });

  // 7) Training consistency
  const workouts7 = state.sessions.filter((s) => !s.rest && s.date >= addDays(today, -6)).length;
  const planned = state.program.days.filter((d) => d.type !== 'rest').length;
  if (state.sessions.length && workouts7 === 0)
    out.push({ id: 'train', tone: 'warn', title: 'No workouts in 7 days', text: 'Even a short session keeps the strength signal. Muscle is what makes the deficit come off as fat.' });
  else if (workouts7 >= planned && planned > 0)
    out.push({ id: 'train', tone: 'good', title: `${workouts7} workouts this week`, text: 'Full training week. Lifting heavy in a deficit is what protects muscle.' });

  return out;
}

/** Bar-loading for a barbell: plates per side, largest first. */
export function platesPerSide(total, bar = 20, available = [25, 20, 15, 10, 5, 2.5, 1.25]) {
  let side = (Number(total) - Number(bar)) / 2;
  if (!(side > 0)) return { plates: [], leftover: 0, side: 0 };
  const plates = [];
  for (const p of available) {
    while (side >= p - 1e-9) {
      plates.push(p);
      side = Math.round((side - p) * 1000) / 1000;
    }
  }
  return { plates, leftover: side * 2, side: (Number(total) - Number(bar)) / 2 };
}

/** Classic warm-up ramp to a working weight, rounded to 2.5 kg. */
export function warmupRamp(work, bar = 20) {
  const w = Number(work);
  if (!(w > bar)) return [];
  const round = (x) => Math.max(bar, Math.round(x / 2.5) * 2.5);
  const sets = [
    { w: bar, r: 10 },
    { w: round(w * 0.4), r: 8 },
    { w: round(w * 0.6), r: 5 },
    { w: round(w * 0.8), r: 3 },
  ];
  if (w >= 100) sets.push({ w: round(w * 0.9), r: 1 });
  return sets.filter((s, i, a) => s.w < w && (i === 0 || s.w > a[i - 1].w));
}

export const isBarbell = (name) => /barbell|bench|squat|deadlift|overhead press|\bohp\b|row|hip thrust/i.test(name) && !/db|dumbbell|cable|machine|goblet|split/i.test(name);
