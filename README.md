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

Then open the URL on your phone:

- **iPhone (Safari)**: Share → *Add to Home Screen*. Open it from the home screen, then go to More → Reminders → *Enable notifications* (iOS 16.4+).
- **Android (Chrome)**: ⋮ → *Install app* (or More → Install app inside Fuel & Lift).

## How reminders work (and their limits)

- While the app is open or recently backgrounded, reminders show an in-app banner with a chime (plus vibration on Android) and a system notification when the app isn't in front.
- Browsers cannot wake a fully closed web app at a set time without a push server. Missed reminders (under 45 min old) appear when you reopen the app.
- For alarms that are **guaranteed** with the app closed, use More → Reminders → **Add to calendar**. It exports a repeating `.ics` calendar with alerts.
- Reminders you've already handled stay quiet (e.g. log your shake early and the 9:30 AM reminder won't fire).
- `public/sw.js` already handles `push` events, so a small Web Push backend can be added later for true background push.

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
