// Fuel & Lift bot: sends reminders to Telegram, turns replies into log events,
// and exposes a small API the PWA syncs with (push snapshot, pull events).
import http from 'node:http';
import crypto from 'node:crypto';
import { addEvent, dataFile, flush, getDb, getSync, load, prune, putSync, save } from './store.js';
import {
  EMOJI,
  HELP,
  L,
  describeActions,
  dueNow,
  esc,
  fmt12,
  isDone,
  logicalNow,
  n0,
  parsePart,
  shortStatus,
  splitParts,
  statusText,
  stockNotes,
  todayView,
  waterPace,
} from './logic.js';
import { estimateMeal, visionEnabled } from './vision.js';
import * as webpush from 'web-push';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const PORT = Number(process.env.PORT) || 8787;
const OWNER = (process.env.OWNER_USERNAME || '').replace(/^@/, '').toLowerCase();
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://fit.fineradesk.com,https://ihamzajameel.github.io,http://localhost:5173,http://localhost:4173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

load();
const db = () => getDb();
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// ---------------------------------------------------------------- Telegram API
async function tg(method, body = {}) {
  if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 65000 : 15000),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}
const send = (text, extra = {}) =>
  tg('sendMessage', { chat_id: db().pair.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
const kb = (rows) => ({ reply_markup: { inline_keyboard: rows } });
const fits = (data) => Buffer.byteLength(data) <= 64;

// ---------------------------------------------------------------- helpers
const st = () => db().state;
const currentDay = (now = Date.now()) => logicalNow(now, st().tz, st().dayStartHour ?? 4).day;
const appUrl = () => st()?.appUrl || 'https://fit.fineradesk.com/';

/** Preset events carry the meal's numbers so the app can log them even if that preset changed. */
function presetEvent(presetId, day, at) {
  const p = (st()?.presets || []).find((x) => x.id === presetId);
  return addEvent('preset', p ? { presetId, name: p.name, kcal: p.kcal, p: p.p, c: p.c, f: p.f, qty: p.qty, unit: p.unit } : { presetId }, day, at);
}

/**
 * Owner corrections: a JSON array dropped at /data/inbox.json (only reachable with Railway
 * access to this service) becomes normal events that the app applies. Used to fix logs on request.
 */
import fs from 'node:fs';
const INBOX = '/data/inbox.json';
function processInbox() {
  if (!fs.existsSync(INBOX)) return;
  let items = [];
  try {
    items = JSON.parse(fs.readFileSync(INBOX, 'utf8'));
  } catch (e) {
    log('inbox: bad json', e.message);
  }
  fs.renameSync(INBOX, `${INBOX}.done-${Date.now()}`);
  let n = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (it.type === 'undo') {
      const ref = db().events.find((e) => e.id === it.ref);
      if (ref && !isUndone(ref.id)) {
        undoEvent(ref);
        n++;
      }
    } else if (it.type === 'preset') {
      presetEvent(it.presetId, it.day, it.at);
      n++;
    } else if (it.type && it.day) {
      addEvent(it.type, it.data || {}, it.day, it.at);
      n++;
    }
  }
  save();
  log(`inbox: added ${n} events`);
}

function remindersActionsEvents(rem, day, okey, waterOverride, chosenPresetId) {
  const a = rem.actions || {};
  const out = [];
  for (const id of a.presetIds || []) out.push(presetEvent(id, day));
  if (chosenPresetId) out.push(presetEvent(chosenPresetId, day));
  const ml = waterOverride ?? a.waterMl;
  if (ml) out.push(addEvent('water', { ml: Number(ml) }, day));
  for (const id of a.supplementIds || []) {
    const s = (st().supplements || []).find((x) => x.id === id);
    if (s && s.stock === 0) continue;
    out.push(addEvent('supp', { id, value: true }, day));
  }
  if (a.sleepUsual && st().sleepPlan) out.push(addEvent('sleep', { ...st().sleepPlan }, day));
  out.push(addEvent('done', { okey }, day));
  return out;
}

function undoEvent(ref) {
  return addEvent('undo', { ref: ref.id, refEvent: { id: ref.id, type: ref.type, day: ref.day, data: ref.data } }, ref.day);
}
const isUndone = (id) => db().events.some((e) => e.type === 'undo' && e.data.ref === id);

// ---------------------------------------------------------------- web push (phone notifications)
let vapidReady = false;
function vapidKeys() {
  const d = db();
  if (!d.vapid) {
    d.vapid = webpush.generateVAPIDKeys();
    flush();
    log('generated VAPID keys');
  }
  if (!vapidReady) {
    webpush.setVapidDetails('https://fit.fineradesk.com', d.vapid.publicKey, d.vapid.privateKey);
    vapidReady = true;
  }
  return d.vapid;
}
const plain = (html) =>
  String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Send a notification to every subscribed phone; drops subscriptions the browser has revoked. */
async function pushAll(payload) {
  vapidKeys();
  const d = db();
  const keep = [];
  let sent = 0;
  await Promise.all(
    (d.pushSubs || []).map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
        keep.push(sub);
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) log('push subscription expired, removed');
        else {
          keep.push(sub);
          log('push error', e.statusCode || e.message);
        }
      }
    })
  );
  d.pushSubs = keep;
  save();
  return sent;
}
const pushOn = () => !!(db().state?.pushReminders && (db().pushSubs || []).length);
const telegramOn = () => !!(TOKEN && db().pair && db().state?.tgReminders !== false);

// ---------------------------------------------------------------- reminders
async function sendReminder(rem, okey, snoozed = false) {
  const s = st();
  const t = s.targets || {};
  const now = Date.now();
  const v = todayView(db(), now);
  let body = esc(rem.body);
  const rows = [];
  if (rem.dynamic === 'water') {
    const { rel } = logicalNow(now, s.tz, s.dayStartHour ?? 4);
    const pace = waterPace(rel, t, s.dayStartHour ?? 4);
    const behind = pace - v.totals.water;
    const ask = behind > 250 ? Math.min(400, Math.ceil(behind / 50) * 50) : 250;
    body = `Sip <b>${ask} ml</b>. You're at ${L(v.totals.water)} of ${L(t.water)}; pace target ${L(pace)} by now.`;
    rows.push([150, 250, 500].map((ml) => ({ text: `+${ml} ml`, callback_data: `w|${ml}|${okey}` })).filter((b) => fits(b.callback_data)));
  } else if (rem.actions?.stepsPrompt) {
    rows.push([6000, 8000, 10000, 12000].map((n) => ({ text: `${n / 1000}k`, callback_data: `stp|${n}|${okey}` })).filter((b) => fits(b.callback_data)));
    body += '\nTap the closest, or reply with the exact number, e.g. <code>steps 9432</code>.';
  } else if (rem.actions?.openTab === 'train') {
    if (s.nextWorkout) body += `\n\nToday: <b>${esc(s.nextWorkout)}</b>`;
    rows.push([{ text: '🏋️ Open workout', url: `${appUrl()}?go=train` }]);
  } else {
    const choices = (rem.actions?.choosePresetIds || []).map((id) => (s.presets || []).find((p) => p.id === id)).filter(Boolean);
    const btns = choices
      .map((p) => ({ text: `🍽️ ${p.name.replace(/^Dinner:\s*/, '')}`, callback_data: `c|${p.id}|${okey}` }))
      .filter((b) => fits(b.callback_data));
    for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
    const parts = describeActions(rem, s);
    const data = `l|${okey}`;
    if (parts.length && fits(data)) rows.push([{ text: `✅ ${choices.length ? 'Only ' : 'Log '}${parts.join(' + ')}`.slice(0, 64), callback_data: data }]);
  }
  const notes = stockNotes(rem, s);
  if (notes.length) body += `\n\n${notes.map(esc).join('\n')}`;
  if (rem.id === 'winddown' || rem.icon === 'moon') {
    body += `\n\n${shortStatus(v, t)}`;
    if (!v.supps.creatine && (s.supplements || []).some((x) => x.id === 'creatine')) body += '\n⚠️ Creatine not ticked yet today.';
  }
  const bottom = [
    { text: '⏰ 10 min', callback_data: `s|${okey}` },
    { text: '👍 Done', callback_data: `d|${okey}` },
    { text: '✗ Missed', callback_data: `x|${okey}` },
  ].filter((b) => fits(b.callback_data));
  if (bottom.length) rows.push(bottom);
  const html = `${EMOJI[rem.icon] || '🔔'} <b>${esc(rem.title)}</b>${snoozed ? ' <i>(snoozed)</i>' : ''}\n${body}`;
  let msgId = null;
  if (telegramOn()) msgId = (await send(html, kb(rows))).message_id;
  if (pushOn())
    await pushAll({
      title: `${EMOJI[rem.icon] || '🔔'} ${rem.title}`,
      body: plain(body).replace(/\n{2,}/g, '\n').trim(),
      url: `${appUrl()}?r=${encodeURIComponent(okey)}`,
      key: okey,
    }).catch((e) => log('push failed', e.message));
  db().sent[snoozed ? `${okey}#${now}` : okey] = { at: now, msgId, html, okey };
  save();
  log('sent reminder', okey, telegramOn() ? '+telegram' : '', pushOn() ? '+push' : '');
}

let ticking = false;
async function tick() {
  const d = db();
  if (ticking || !d.state || (!telegramOn() && !pushOn())) return;
  ticking = true;
  try {
    const now = Date.now();
    const v = todayView(d, now);
    for (const due of dueNow(d.state, now, d.sent)) {
      if (isDone(due.rem, due.okey, v)) {
        d.sent[due.okey] = { at: now, skipped: true, okey: due.okey };
        log('skip (already done)', due.okey);
        continue;
      }
      await sendReminder(due.rem, due.okey).catch((e) => log('send failed', e.message));
    }
    const dueSnoozes = d.snoozes.filter((z) => z.at <= now);
    d.snoozes = d.snoozes.filter((z) => z.at > now);
    for (const z of dueSnoozes) {
      const rem = (d.state.reminders || []).find((r) => r.id === z.remId);
      if (rem && !isDone(rem, z.okey, v)) await sendReminder(rem, z.okey, true).catch((e) => log('snooze send failed', e.message));
    }
    prune(now);
    save();
  } finally {
    ticking = false;
  }
}

// ---------------------------------------------------------------- chat handling
async function onUpdate(u) {
  const d = db();
  if (u.message) {
    const msg = u.message;
    const text = (msg.text || '').trim();
    if (text.startsWith('/start')) return onStart(msg, text.split(/\s+/)[1]);
    if (!d.pair || msg.chat.id !== d.pair.chatId) {
      return tg('sendMessage', { chat_id: msg.chat.id, text: '🔒 This is a private bot.' }).catch(() => {});
    }
    if (!d.state) return send('Open Fuel & Lift once so I can load your plan, then try again.');
    if (msg.photo?.length || /^image\//.test(msg.document?.mime_type || '')) return onPhoto(msg);
    return onText(msg, text);
  }
  if (u.callback_query) {
    const cq = u.callback_query;
    if (!d.pair || cq.message?.chat.id !== d.pair.chatId) return tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Private bot' }).catch(() => {});
    return onCallback(cq);
  }
}

async function onStart(msg, code) {
  const d = db();
  const p = d.pending;
  const user = (msg.from?.username || '').toLowerCase();
  if (code && p && p.code === code && p.exp > Date.now()) {
    if (OWNER && user !== OWNER) return tg('sendMessage', { chat_id: msg.chat.id, text: '🔒 This bot is locked to its owner.' });
    d.pair = { chatId: msg.chat.id, keyHash: p.keyHash, username: msg.from?.username || '', name: msg.from?.first_name || '', at: Date.now() };
    d.pending = null;
    flush();
    log('paired with chat', msg.chat.id);
    return send(`✅ <b>Connected to Fuel & Lift</b>\nReminders will arrive here, and anything you log here shows up in the app.\n\n${HELP}`);
  }
  if (d.pair && msg.chat.id === d.pair.chatId) return send(HELP);
  return tg('sendMessage', {
    chat_id: msg.chat.id,
    text: '🔒 Private bot. To connect, open Fuel & Lift → More → Reminders → Connect Telegram.',
  });
}

async function onText(msg, text) {
  const d = db();
  const s = d.state;
  const t = text.toLowerCase();
  if (/^\/?(help|commands|\?)$/.test(t)) return send(HELP);
  if (/^\/?(status|today|summary|stats)$/.test(t)) return send(statusText(d, Date.now()), kb(quickRows()));
  if (/^\/?undo$/.test(t)) return undoLast();

  // A reply to a photo estimate refines it ("it was 3 roti")
  if (msg.reply_to_message) {
    const hit = Object.entries(d.photos || {}).find(([, p]) => p.msgId === msg.reply_to_message.message_id);
    if (hit) {
      const [pid, p] = hit;
      delete d.photos[pid];
      const wait = await send('🔍 Updating the estimate…');
      return analyzePhoto({ fileId: p.fileId, hint: [p.hint, text].filter(Boolean).join('. '), msgId: wait.message_id });
    }
  }

  // "done" as a reply to a reminder
  if (msg.reply_to_message && /^(done|ok|okay|did it|yes|y|✅|👍)$/.test(t)) {
    const entry = Object.values(d.sent).find((x) => x.msgId === msg.reply_to_message.message_id && x.okey);
    if (entry) {
      addEvent('done', { okey: entry.okey }, entry.okey.split('@')[1]);
      return send('👍 Marked done.');
    }
  }

  const day = currentDay();
  const parsed = [];
  const unknown = [];
  const choices = [];
  for (const part of splitParts(text)) {
    const r = parsePart(part, s);
    if (r?.type === 'choose') choices.push(r);
    else if (r) parsed.push(r);
    else unknown.push(part);
  }
  for (const c of choices) {
    const btns = c.data.presetIds
      .map((id) => (s.presets || []).find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => ({ text: `${p.name} · ${p.kcal} kcal`, callback_data: `p|${p.id}` }))
      .filter((b) => fits(b.callback_data));
    await send(`🍽️ ${esc(c.label)}`, kb(btns.map((b) => [b])));
  }
  if (!parsed.length) {
    if (choices.length) return;
    return send(`🤔 I didn't get “${esc(text)}”.\n\n${HELP}`, kb(quickRows()));
  }
  const events = parsed.map((r) => (r.type === 'preset' ? presetEvent(r.data.presetId, day) : addEvent(r.type, r.data, day)));
  const v = todayView(d, Date.now());
  const lines = [`✅ <b>Logged</b>`, ...parsed.map((r) => esc(r.label))];
  if (unknown.length) lines.push(`\n🤔 Skipped: ${unknown.map(esc).join(', ')}`);
  lines.push('', shortStatus(v, s.targets || {}));
  const ids = events.map((e) => e.id).join(',');
  const undoData = `u|${ids}`;
  return send(lines.join('\n'), kb(fits(undoData) ? [[{ text: '↩️ Undo', callback_data: undoData }]] : []));
}

const quickRows = () => [
  [150, 250, 500].map((ml) => ({ text: `💧 +${ml}`, callback_data: `q|${ml}` })),
  [{ text: '📊 Status', callback_data: 'st' }, { text: '📱 Open app', url: appUrl() }],
];

async function undoLast() {
  const d = db();
  const last = [...d.events].reverse().find((e) => e.type !== 'undo' && !isUndone(e.id) && Date.now() - e.at < 86400e3);
  if (!last) return send('Nothing to undo.');
  undoEvent(last);
  return send(`↩️ Undid the last ${last.type === 'preset' ? 'meal' : last.type} log.`);
}

async function onCallback(cq) {
  const d = db();
  const data = cq.data || '';
  const [kind, ...rest] = data.split('|');
  const answer = (text) => tg('answerCallbackQuery', { callback_query_id: cq.id, text }).catch(() => {});
  const markMessage = async (suffix) => {
    const entry = Object.values(d.sent).find((x) => x.msgId === cq.message.message_id);
    const base = entry?.html || esc(cq.message.text || '');
    await tg('editMessageText', { chat_id: d.pair.chatId, message_id: cq.message.message_id, text: `${base}\n\n${suffix}`, parse_mode: 'HTML' }).catch(() => {});
  };
  const time = fmt12(new Date().toLocaleTimeString('en-GB', { timeZone: d.state?.tz || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }));

  if (!d.state) return answer('Open the app once first');

  if (kind === 'stp') {
    const n = Number(rest.shift());
    const okey = rest.join('|');
    const day = okey.split('@')[1] || currentDay();
    addEvent('steps', { steps: n }, day);
    addEvent('done', { okey }, day);
    await markMessage(`👟 <i>${n.toLocaleString('en-US')} steps logged at ${time}</i>`);
    return answer('Steps logged');
  }
  if (kind === 'l' || kind === 'w' || kind === 'd' || kind === 's' || kind === 'x') {
    const ml = kind === 'w' ? Number(rest.shift()) : undefined;
    const okey = rest.join('|');
    const [remId, day] = okey.split('@');
    const rem = (d.state.reminders || []).find((r) => r.id === remId);
    if (!rem) return answer('That reminder no longer exists');
    if (kind === 's') {
      d.snoozes.push({ remId, okey, at: Date.now() + 10 * 60e3 });
      save();
      await markMessage(`⏰ <i>Snoozed at ${time}, back in 10 min</i>`);
      return answer('Snoozed 10 minutes');
    }
    if (kind === 'x') {
      addEvent('missed', { okey }, day);
      await markMessage(`✗ <i>Marked missed at ${time}</i>`);
      return answer('Marked missed');
    }
    if (kind === 'd') {
      addEvent('done', { okey }, day);
      await markMessage(`👍 <i>Done at ${time}</i>`);
      return answer('Marked done');
    }
    remindersActionsEvents(rem, day, okey, ml);
    const v = todayView(d, Date.now());
    await markMessage(`✅ <i>Logged at ${time}</i>\n${esc(shortStatus(v, d.state.targets || {}))}`);
    return answer('Logged ✅');
  }
  if (kind === 'p') {
    const p = (d.state.presets || []).find((x) => x.id === rest[0]);
    if (!p) return answer('That meal no longer exists');
    const ev = presetEvent(p.id, currentDay());
    const v = todayView(d, Date.now());
    await tg('editMessageText', {
      chat_id: d.pair.chatId,
      message_id: cq.message.message_id,
      text: `✅ <b>Logged</b>\n🍽️ ${esc(p.name)} (${p.kcal} kcal, ${p.p} g P)\n\n${esc(shortStatus(v, d.state.targets || {}))}`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '↩️ Undo', callback_data: `u|${ev.id}` }]] },
    }).catch(() => {});
    return answer('Logged ✅');
  }
  if (kind === 'c') {
    const presetId = rest.shift();
    const okey = rest.join('|');
    const [remId, day] = okey.split('@');
    const rem = (d.state.reminders || []).find((r) => r.id === remId);
    const p = (d.state.presets || []).find((x) => x.id === presetId);
    if (!rem || !p) return answer('No longer available');
    remindersActionsEvents(rem, day, okey, undefined, presetId);
    const v = todayView(d, Date.now());
    await markMessage(`✅ <i>Logged ${esc(p.name)} + ${esc(describeActions(rem, d.state).join(' + '))} at ${time}</i>\n${esc(shortStatus(v, d.state.targets || {}))}`);
    return answer('Logged ✅');
  }
  if (kind === 'ph' || kind === 'phx') {
    const pid = rest[0];
    const p = (d.photos || {})[pid];
    if (!p) return answer('This estimate has expired');
    if (kind === 'phx') {
      delete d.photos[pid];
      save();
      await tg('editMessageText', { chat_id: d.pair.chatId, message_id: cq.message.message_id, text: `${photoText(p.est, false)}\n\n✖ <i>Discarded</i>`, parse_mode: 'HTML' }).catch(() => {});
      return answer('Discarded');
    }
    const mult = Number(rest[1]) || 1;
    const t = p.est.total;
    const preset = p.est.matched_preset_id && (d.state.presets || []).find((x) => x.id === p.est.matched_preset_id);
    const day = currentDay();
    const r1 = (n) => Math.round(n * 10) / 10;
    const ev =
      preset && mult === 1 && Math.abs(preset.kcal - t.kcal) <= preset.kcal * 0.12
        ? presetEvent(preset.id, day)
        : addEvent(
            'food',
            { name: `${p.est.meal_name}${mult !== 1 ? ` ×${mult}` : ''} 📸`, qty: mult, unit: 'serving', kcal: Math.round(t.kcal * mult), p: r1(t.protein_g * mult), c: r1(t.carbs_g * mult), f: r1(t.fat_g * mult) },
            day
          );
    delete d.photos[pid];
    save();
    const v = todayView(d, Date.now());
    await tg('editMessageText', {
      chat_id: d.pair.chatId,
      message_id: cq.message.message_id,
      text: `${photoText(p.est, false)}\n\n✅ <i>Logged${mult !== 1 ? ` ×${mult}` : ''} at ${time}</i>\n${esc(shortStatus(v, d.state.targets || {}))}`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '↩️ Undo', callback_data: `u|${ev.id}` }]] },
    }).catch(() => {});
    return answer('Logged ✅');
  }
  if (kind === 'u') {
    const ids = (rest[0] || '').split(',').map(Number);
    let n = 0;
    for (const id of ids) {
      const ev = d.events.find((e) => e.id === id);
      if (ev && !isUndone(id)) {
        undoEvent(ev);
        n++;
      }
    }
    await tg('editMessageReplyMarkup', { chat_id: d.pair.chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    return answer(n ? 'Undone ↩️' : 'Already undone');
  }
  if (kind === 'q') {
    const ml = Number(rest[0]);
    addEvent('water', { ml }, currentDay());
    const v = todayView(d, Date.now());
    return answer(`💧 +${ml} ml · ${L(v.totals.water)} / ${L(d.state.targets.water)}`);
  }
  if (kind === 'st') {
    await answer('');
    return send(statusText(d, Date.now()), kb(quickRows()));
  }
  return answer('');
}

// ---------------------------------------------------------------- meal photos
async function downloadTelegramFile(fileId) {
  const f = await tg('getFile', { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${f.file_path}`, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('could not download the photo');
  const buf = Buffer.from(await r.arrayBuffer());
  const ext = (f.file_path.split('.').pop() || '').toLowerCase();
  const mediaType = { png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/jpeg';
  return { base64: buf.toString('base64'), mediaType, bytes: buf.length };
}

function photoText(est, footer = true) {
  if (!est.is_food) return "🤔 That doesn't look like food. Send a photo of your meal, or type it, e.g. <code>chicken rice 550 kcal 45p</code>.";
  const t = est.total;
  const lines = [`📸 <b>${esc(est.meal_name)}</b> <i>(${est.confidence} confidence)</i>`];
  for (const i of est.items) lines.push(`• ${esc(i.name)}, ${esc(i.portion)}: ${n0(i.kcal)} kcal · ${i.protein_g}P · ${i.carbs_g}C · ${i.fat_g}F`);
  lines.push(`<b>Total: ${n0(t.kcal)} kcal · ${t.protein_g} g protein · ${t.carbs_g} g carbs · ${t.fat_g} g fat</b>`);
  if (est.tip) lines.push(`💡 ${esc(est.tip)}`);
  if (footer) lines.push('', '<i>Wrong? Reply to this message with a fix, e.g. "it was 3 roti".</i>');
  return lines.join('\n');
}

async function analyzePhoto({ fileId, hint, msgId }) {
  const d = db();
  const chat_id = d.pair.chatId;
  try {
    tg('sendChatAction', { chat_id, action: 'typing' }).catch(() => {});
    const img = await downloadTelegramFile(fileId);
    if (img.bytes > 5 * 1024 * 1024) throw new Error('the photo is larger than 5 MB');
    const est = await estimateMeal({ ...img, hint, presets: d.state?.presets });
    const pid = crypto.randomBytes(4).toString('hex');
    const rows = est.is_food
      ? [
          [{ text: '✅ Log it', callback_data: `ph|${pid}|1` }],
          [
            { text: '½ portion', callback_data: `ph|${pid}|0.5` },
            { text: '1.5×', callback_data: `ph|${pid}|1.5` },
            { text: '2×', callback_data: `ph|${pid}|2` },
          ],
          [{ text: '✖ Discard', callback_data: `phx|${pid}` }],
        ]
      : [];
    if (est.is_food) d.photos[pid] = { fileId, hint, est, at: Date.now(), msgId };
    save();
    await tg('editMessageText', { chat_id, message_id: msgId, text: photoText(est), parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
    log('photo estimate', est.total.kcal, 'kcal', JSON.stringify(est.usage));
  } catch (e) {
    log('photo error', e.message);
    await tg('editMessageText', { chat_id, message_id: msgId, text: `⚠️ Couldn't analyse that photo (${esc(e.message)}). Try again, or type the meal.`, parse_mode: 'HTML' }).catch(() => {});
  }
}

async function onPhoto(msg) {
  if (!visionEnabled())
    return send('📸 Photo logging needs an Anthropic API key on the bot (<code>ANTHROPIC_API_KEY</code> in Railway). Until then, type the meal, e.g. <code>chicken rice 550 kcal 45p</code>.');
  const fileId = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;
  const wait = await send('🔍 Looking at your meal…');
  return analyzePhoto({ fileId, hint: (msg.caption || '').trim(), msgId: wait.message_id });
}

async function pollLoop() {
  if (!TOKEN) return;
  await tg('deleteWebhook', {}).catch(() => {});
  for (;;) {
    try {
      const updates = await tg('getUpdates', { offset: db().tgOffset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
      for (const u of updates) {
        db().tgOffset = u.update_id + 1;
        save();
        await onUpdate(u).catch((e) => log('update error', e.message));
      }
    } catch (e) {
      log('poll error', e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ---------------------------------------------------------------- HTTP API for the app
function cors(req) {
  const o = req.headers.origin;
  return {
    'access-control-allow-origin': o && ORIGINS.includes(o) ? o : ORIGINS[0],
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}
const reply = (req, res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json', ...cors(req) });
  res.end(JSON.stringify(data));
};
async function readJson(req, limit = 512 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('bad json'), { status: 400 });
  }
}
function authed(req) {
  const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  const h = sha(key);
  const d = db();
  const eq = (a, b) => a && b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (eq(h, d.pair?.keyHash)) return 'paired';
  if ((d.devices || []).some((x) => eq(h, x.keyHash))) return 'paired';
  if (eq(h, d.pending?.keyHash)) return 'pending';
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = `${req.method} ${url.pathname}`;
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors(req));
      return res.end();
    }
    if (route === 'GET /' || route === 'GET /health') return reply(req, res, 200, { ok: true, service: 'fuel-lift-bot', bot: db().bot?.username || null });
    if (route === 'GET /api/info')
      return reply(req, res, 200, { bot: db().bot?.username || null, configured: !!TOKEN, paired: !!db().pair, vision: visionEnabled(), vapidPublicKey: vapidKeys().publicKey });

    if (route === 'POST /api/pair') {
      const { code, key } = await readJson(req, 4096);
      if (!/^[a-z0-9]{8,32}$/.test(code || '') || !/^[a-f0-9]{64}$/.test(key || '')) return reply(req, res, 400, { error: 'bad_request' });
      if (!db().bot?.username) return reply(req, res, 503, { error: 'bot_not_configured' });
      if (db().pair && sha(key) !== db().pair.keyHash) return reply(req, res, 409, { error: 'already_paired' });
      db().pending = { code, keyHash: sha(key), exp: Date.now() + 15 * 60e3 };
      save();
      return reply(req, res, 200, { link: `https://t.me/${db().bot.username}?start=${code}`, bot: db().bot.username });
    }

    if (route === 'POST /api/devices/claim') {
      const { code, key, name } = await readJson(req, 4096);
      const d = db();
      const l = d.link;
      if (!l || l.exp < Date.now()) return reply(req, res, 410, { error: 'code_expired' });
      if (!/^[a-f0-9]{64}$/.test(key || '')) return reply(req, res, 400, { error: 'bad_request' });
      if (String(code || '').trim() !== l.code) {
        l.attempts = (l.attempts || 0) + 1;
        if (l.attempts >= 8) d.link = null; // too many wrong tries: the code dies
        save();
        return reply(req, res, 403, { error: 'wrong_code' });
      }
      d.devices = [...(d.devices || []).filter((x) => x.keyHash !== sha(key)), { keyHash: sha(key), name: String(name || 'Device').slice(0, 40), at: Date.now() }].slice(-6);
      d.link = null;
      flush();
      log('linked device', name);
      return reply(req, res, 200, { ok: true, bot: d.bot?.username || null });
    }

    const who = authed(req);
    if (route === 'GET /api/status') {
      if (who === 'paired') return reply(req, res, 200, { paired: true, username: db().pair.username, name: db().pair.name, bot: db().bot?.username });
      if (who === 'pending') return reply(req, res, 200, { paired: false, pending: true });
      return reply(req, res, 401, { error: 'unauthorized' });
    }
    if (who !== 'paired') return reply(req, res, 401, { error: 'unauthorized' });

    if (route === 'PUT /api/state') {
      const body = await readJson(req);
      if (!body || typeof body !== 'object' || !Array.isArray(body.reminders)) return reply(req, res, 400, { error: 'bad_state' });
      db().state = { ...body, savedAt: Date.now() };
      prune();
      save();
      return reply(req, res, 200, { ok: true });
    }
    if (route === 'GET /api/events') {
      // Events already folded into the shared synced state reach other devices through /api/sync.
      // Replaying them on a device that was closed for a while would undo newer edits.
      const after = Math.max(Number(url.searchParams.get('after')) || 0, Number(getSync().doc?.meta?.tg?.lastEventId) || 0);
      return reply(req, res, 200, { events: db().events.filter((e) => e.id > after).slice(0, 500) });
    }
    if (route === 'POST /api/estimate') {
      if (!visionEnabled()) return reply(req, res, 503, { error: 'vision_not_configured' });
      const { image, mediaType, hint } = await readJson(req, 7 * 1024 * 1024);
      if (typeof image !== 'string' || !/^image\/(jpeg|png|webp)$/.test(mediaType || '')) return reply(req, res, 400, { error: 'bad_image' });
      const est = await estimateMeal({ base64: image, mediaType, hint: String(hint || '').slice(0, 300), presets: db().state?.presets });
      log('app photo estimate', est.total.kcal, 'kcal', JSON.stringify(est.usage));
      return reply(req, res, 200, { estimate: est });
    }
    if (route === 'POST /api/devices/link') {
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      db().link = { code, exp: Date.now() + 10 * 60e3, attempts: 0 };
      save();
      return reply(req, res, 200, { code, exp: db().link.exp });
    }
    if (route === 'GET /api/devices') {
      const mine = sha((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      const d = db();
      const list = [
        { id: 'primary', name: 'Phone (first linked)', at: d.pair?.at || null, current: mine === d.pair?.keyHash },
        ...(d.devices || []).map((x) => ({ id: x.keyHash.slice(0, 12), name: x.name, at: x.at, current: mine === x.keyHash })),
      ];
      return reply(req, res, 200, { devices: list });
    }
    if (route === 'POST /api/devices/remove') {
      const { id } = await readJson(req, 1024);
      db().devices = (db().devices || []).filter((x) => x.keyHash.slice(0, 12) !== id);
      save();
      return reply(req, res, 200, { ok: true });
    }
    if (route === 'GET /api/sync') {
      const s = getSync();
      const since = Number(url.searchParams.get('since'));
      if (Number.isFinite(since) && since === s.rev) return reply(req, res, 200, { rev: s.rev, unchanged: true });
      return reply(req, res, 200, { rev: s.rev, doc: s.doc, at: s.at });
    }
    if (route === 'PUT /api/sync') {
      const { baseRev, doc } = await readJson(req, 10 * 1024 * 1024);
      if (!doc || typeof doc !== 'object' || !doc.days || !doc.program) return reply(req, res, 400, { error: 'bad_doc' });
      const cur = getSync();
      if (Number(baseRev) !== cur.rev) return reply(req, res, 409, { error: 'stale', rev: cur.rev });
      return reply(req, res, 200, { rev: putSync(doc) });
    }
    if (route === 'POST /api/push/subscribe') {
      const { subscription } = await readJson(req, 8192);
      if (!subscription || !/^https:\/\//.test(subscription.endpoint || '') || !subscription.keys?.p256dh || !subscription.keys?.auth)
        return reply(req, res, 400, { error: 'bad_subscription' });
      const d = db();
      d.pushSubs = [...(d.pushSubs || []).filter((x) => x.endpoint !== subscription.endpoint), { endpoint: subscription.endpoint, keys: subscription.keys }].slice(-5);
      save();
      return reply(req, res, 200, { ok: true, devices: d.pushSubs.length });
    }
    if (route === 'POST /api/push/unsubscribe') {
      const { endpoint } = await readJson(req, 4096);
      db().pushSubs = (db().pushSubs || []).filter((x) => x.endpoint !== endpoint);
      save();
      return reply(req, res, 200, { ok: true });
    }
    if (route === 'POST /api/test') {
      if (TOKEN && db().pair) await send('👋 <b>Fuel & Lift test</b>\nReminders and replies are working. Try replying <code>250</code> or <code>status</code>.', kb(quickRows()));
      const pushed = (db().pushSubs || []).length ? await pushAll({ title: '👋 Fuel & Lift test', body: 'Phone notifications are working.', url: appUrl(), key: 'test' }) : 0;
      return reply(req, res, 200, { ok: true, pushed });
    }
    if (route === 'POST /api/unpair') {
      await send('🔌 Disconnected from Fuel & Lift.').catch(() => {});
      db().pair = null;
      db().pending = null;
      flush();
      return reply(req, res, 200, { ok: true });
    }
    return reply(req, res, 404, { error: 'not_found' });
  } catch (e) {
    log('http error', route, e.message);
    return reply(req, res, e.status || 500, { error: e.status ? e.message : 'server_error' });
  }
});

server.listen(PORT, async () => {
  log(`listening on :${PORT}, data at ${dataFile}`);
  if (!TOKEN) {
    log('TELEGRAM_BOT_TOKEN not set: API only, no Telegram');
    return;
  }
  try {
    const me = await tg('getMe');
    db().bot = { username: me.username };
    save();
    await tg('setMyCommands', {
      commands: [
        { command: 'status', description: 'Today so far' },
        { command: 'undo', description: 'Undo the last log' },
        { command: 'help', description: 'What you can send' },
      ],
    }).catch(() => {});
    log(`telegram ready as @${me.username}`);
  } catch (e) {
    log('telegram init failed', e.message);
  }
  pollLoop();
  setInterval(() => tick().catch((e) => log('tick error', e.message)), 30000);
  setInterval(() => {
    try {
      processInbox();
    } catch (e) {
      log('inbox error', e.message);
    }
  }, 10000);
  setTimeout(() => tick().catch(() => {}), 5000);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    try {
      flush();
    } catch {}
    process.exit(0);
  });
}
