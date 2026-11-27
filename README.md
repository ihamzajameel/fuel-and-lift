# Fuel & Lift

A mobile-first, offline PWA for nutrition, hydration, supplements and strength training, built around a late-night schedule (gym at 10 PM, bed at 2 AM).

React 19 · Vite · Tailwind CSS 4 · Lucide icons · no backend, no login. All data stays in `localStorage` on your device.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also printed with your LAN address)
npm run build      # production build in dist/
npm run preview    # serve dist/ at http://localhost:4173 (service worker active)
```

## Put it on your phone

Service workers and notifications need **HTTPS**, so host the `dist/` folder on any static host:

- **Netlify Drop**: drag the `dist` folder onto https://app.netlify.com/drop
- **Cloudflare Pages / Vercel / GitHub Pages**: build command `npm run build`, output folder `dist`

The build uses relative paths, so it also works from a sub-folder (e.g. GitHub Pages project sites).

Live at **https://fit.fineradesk.com** (GitHub Pages with a custom domain; DNS CNAME `fit` → `ihamzajameel.github.io` at Namecheap). Then open the URL on your phone:

- **iPhone (Safari)**: Share → *Add to Home Screen*. Open it from the home screen, then go to More → Reminders → *Enable notifications* (iOS 16.4+).
- **Android (Chrome)**: ⋮ → *Install app* (or More → Install app inside Fuel & Lift).

## Telegram reminders & logging by reply

`bot/` is a small Node service (zero dependencies) running on Railway, project **fuel-lift**, service **bot**:
https://bot-production-7ba0497f.up.railway.app

- Every 30 s it checks your reminder schedule (in your phone's timezone, with the 4 AM day rollover) and sends due reminders to Telegram with buttons: **✅ Log**, **+150/+250/+500 ml**, **⏰ 10 min**, **👍 Done**. Reminders you've already handled are skipped.
- Reply in plain words to log: `500`, `water 300`, `shake`, `lunch`, `eggs`, `nuts`, `dates`, `roti chicken` / `rice chicken` / `mutton` / `daal` (or `dinner` to pick), `creatine`, `whey`, `vit c`, `ashwa`, `chicken rice 550 kcal 45p 60c 12f`, `gym done`, `w 74.2`, `waist 33`, `chest 38.5`, `bicep 15` (inches by default), `sleep 8`, `steps 9500`. Combine with commas. `/status`, `/undo`, `/help`.
- The app pushes your plan + today's totals to the bot and pulls what you logged in Telegram (every 20 s while open, and on every open).
- Pairing: More → Reminders → **Connect Telegram** → tap Start in Telegram. The app keeps a random device key (not included in JSON backups); the bot stores only its hash and only talks to the paired chat.
- Data on the bot: your plan, today's totals and recent Telegram logs, in `/data/fuel-lift.json` on a Railway volume. No history, body measurements or workouts are sent to it.

- **Meal photos**: send a photo in Telegram (caption optional, e.g. `3 roti`) or tap **Photo** on the Food screen. Claude Opus 5.5 estimates the items and macros (structured JSON); tap **Log it / ½ / 1.5× / 2×**, or reply to the estimate to correct it. Needs `ANTHROPIC_API_KEY` on the bot service. Roughly 2–4 cents per photo.
- **Supplement stock**: set capsules/scoops in More → Supplements (or `stock vit c 30`, `bought creatine 60`). Each tick uses one; reminders warn at 5 left and say when it's out.

Setup (one time): create a bot with @BotFather and add its token as `TELEGRAM_BOT_TOKEN` in Railway (fuel-lift → bot → Variables). Optional: `OWNER_USERNAME` (your Telegram @username) locks pairing to you.

Deploy bot changes: `cd bot && railway up . --path-as-root --service bot --detach`. Tests: `cd bot && npm test`.

## Fallback deploy (no GitHub Actions build)

```bash
npm run deploy:pages              # build locally, push dist/ to the gh-pages branch
npm run deploy:pages -- --switch  # ...and serve GitHub Pages from that branch
npm run pages:actions             # switch Pages back to the Actions workflow
```

Public repos get unlimited Actions minutes, so this is only needed if Actions is unavailable.

## Logging, missed items and corrections

- **Log my usual day** (Today / Food): your routine as a pre-ticked checklist, logged in one press. **Extra food** and **Photo of meal** sit next to it for anything outside the plan.
- **Missed**: mark any routine item missed from Today's plan, from Telegram (✗ Missed), or for any date in Progress → Habits → **Day check**. Habits also shows 30-day consistency per item (done / missed / unmarked).
- **Supplement stock**: stock, pack size and start date per supplement; each tick uses a dose, Today shows how long the stock lasts, reminders warn at 5 left and say when it's out.
- **Owner corrections**: a JSON array of events written to `/data/inbox.json` on the bot (`railway ssh --service bot`) becomes normal events the app applies (water, preset, food, supp, done, missed, body, stock, program, undo). Entries made in the app itself are removed in Food → Log.
- **Updates**: the app checks for a new build whenever it returns to the foreground and reloads once; the service worker revalidates the page on every load.

## How reminders work (and their limits)

- While the app is open or recently backgrounded, reminders show an in-app banner with a chime (plus vibration on Android) and a system notification when the app isn't in front.
- Browsers cannot wake a fully closed web app at a set time without a push server. Missed reminders (under 45 min old) appear when you reopen the app.
- For alarms that are **guaranteed** with the app closed, use More → Reminders → **Add to calendar**. It exports a repeating `.ics` calendar with alerts.
- Reminders you've already handled stay quiet (e.g. log your shake early and the 9:30 AM reminder won't fire).
- `public/sw.js` already handles `push` events, so a small Web Push backend can be added later for true background push.

## Current plan (v2, 27 Nov 2026)

- Goal: lean bulk 74 → 80 kg while keeping belly fat down; chest 38.5" → 40", bicep 15" → 16–17"
- Targets: 2,850 kcal · 160 g protein · 360 g carbs · 85 g fat · 2.8 L water · 8 h sleep · 8k steps
- Day: shake 10:45 AM · water 12:30 PM · lunch + water 4 PM · eggs + Vitamin C 6 PM · nuts 6:45 PM · water 7:30 PM · dates + 1 L lime water 9 PM · gym 10 PM · dinner + creatine midnight · ashwagandha 1:30 AM · weekly check-in Sunday 11 AM
- Split (by weekday): Mon/Thu Chest & Triceps · Tue/Fri Back & Biceps · Wed/Sat Shoulders & Legs (heavy + volume variants) · Sun rest
- Existing installs are moved to this plan automatically on next open (logs, workouts and custom items are kept)

## Features

**Your spec**
- Pre-loaded profile (31 M, 74 kg, 175 cm) and targets (2,200 kcal · 145 P · 220 C · 65 F · 2.8 L), all editable
- Reminder engine with the full daily schedule; toggle, edit time, add custom reminders (fixed or repeating, weekday filter, linked quick actions)
- Hydration pacing every 90 min from 11 AM to 9 PM, front-loaded so 80% is done before 9 PM
- One-tap presets (Morning Shake, 2 Eggs + 6 Almonds, 2 Dates, plus editable Lunch & Dinner estimates)
- Custom food logger with portion units: g, ml, 15 mL tbsp, 5 mL tsp, 2.5 mL ½ tsp, cup, scoop, piece, serving
- Calorie ring, macro bars, water bar with +150 / +250 / +500 ml
- Supplement checklist (ON Whey, Creatine 5 g, Ashwagandha) with streaks and 30-day tracking
- 3 / 4 / 5-day split templates; add, remove, rename, reorder days and exercises; sets, rep ranges, rest timers
- Auto-starting rest timer (60 / 90 / 120 s, ±15 s) and last-session weights/reps per set
- Progressive overload hints (add weight once every set hits the top of the range, otherwise +1–2 reps)
- Body weight & waist logs with charts and weekly averages; strength (estimated 1RM) charts
- JSON export / import / share backup; manifest + service worker for install and offline use

**Extras added**
- **Late-night day**: the day resets at 4 AM, so post-workout dinner at 12:45 AM counts toward today
- **Live water pace**: a marker shows where you should be right now; hydration reminders say how much to drink
- **Coach**: weight-trend analysis (targets 0.5–1% body weight per week) with one-tap ±150 kcal adjustments, recomposition detection (flat scale + shrinking waist), protein g/kg and per-meal spread, water front-loading %, creatine water-weight guidance, strength-plateau → deload suggestion, sleep and training consistency
- **Daily score** (protein, calories, water, workout/steps, creatine, sleep) with a 4-week heatmap
- **Recovery tracking**: sleep hours + quality, daily steps (9k goal)
- **Plate calculator + warm-up ramp** for barbell lifts
- PR trophies, weights carry forward to the next set, screen stays awake during workouts
- Waist-to-height ratio (healthy < 0.5), Mifflin–St Jeor maintenance estimate and deficit
- Bedtime countdown, smart reminders that skip what you've already done, calendar export
- Dark (default) / light / system themes, backup reminders, multi-tab safe storage

## Project layout

```
public/            manifest.json, sw.js, icons/
src/lib/           data model, defaults, reminders, coach, workout logic, storage
src/components/    UI primitives, charts, app chrome, food sheet
src/screens/       Today, Food, Train, Progress, More, Reminders
vite.config.js     injects the precache list into sw.js at build time
```
