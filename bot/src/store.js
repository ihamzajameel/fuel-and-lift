// Tiny JSON-file store on the Railway volume. One process, one file, atomic writes.
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.resolve('data'));
const FILE = path.join(DIR, 'fuel-lift.json');

const empty = () => ({
  pair: null, // { chatId, keyHash, username, name, at }
  pending: null, // { code, keyHash, exp }
  state: null, // snapshot pushed by the app
  events: [], // { id, type, data, day, at }
  nextEventId: 1,
  sent: {}, // key -> { at, msgId, html, okey }
  snoozes: [], // { remId, okey, at }
  tgOffset: 0,
  photos: {}, // pending photo estimates: id -> { fileId, hint, est, at, msgId }
  pushSubs: [], // Web Push subscriptions from the installed app
  vapid: null, // { publicKey, privateKey } generated on first start
  bot: null, // { username }
});

let db = empty();
let timer = null;

export function load() {
  try {
    db = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    db = empty();
  }
  return db;
}

export const getDb = () => db;

export function flush() {
  clearTimeout(timer);
  timer = null;
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

export function save() {
  if (!timer) timer = setTimeout(flush, 150);
}

export function addEvent(type, data, day, at = Date.now()) {
  const e = { id: db.nextEventId++, type, data, day, at };
  db.events.push(e);
  save();
  return e;
}

/** Drop events the app has already applied (after a grace period) and stale bookkeeping. */
export function prune(now = Date.now()) {
  const applied = db.state?.lastEventId || 0;
  db.events = db.events.filter((e) => e.id > applied || now - e.at < 3 * 86400e3).slice(-3000);
  for (const [k, v] of Object.entries(db.sent)) if (now - v.at > 3 * 86400e3) delete db.sent[k];
  db.snoozes = db.snoozes.filter((z) => now - z.at < 86400e3);
  for (const [k, v] of Object.entries(db.photos || {})) if (now - v.at > 86400e3) delete db.photos[k];
}

export const dataFile = FILE;
