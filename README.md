# FitFlow

A personal fitness PWA for building routines, logging workouts live, and tracking
progress with a small training crew. Built with Vite + React + TypeScript, styled to
the confirmed "Onyx Volt" direction (true-black canvas, mint accent, oversized
condensed type, monospaced stats).

**Try it live:** https://timverberne.github.io/FitLife_App/ (auto-deploys on every
push to this branch via GitHub Actions — see `.github/workflows/deploy-pages.yml`).

## Status: Phases 0–5

Sign in with a real account (Supabase Auth) and your routines, workouts, and
settings sync to the cloud under row-level security — IndexedDB (via Dexie)
still caches everything locally so the app keeps working offline, but a
signed-in account is now required to use it at all. Real friends (search by
email, accept/decline requests) replace the old Sanne/Joost demo comparison
data in Stats and Home.

### What works

- **Exercise library** — 31 real exercises (with actual photos + GIFs sourced
  from the [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset),
  © Gym Visual, non-commercial use) covering all 10 body-part categories.
  Search by name, filter by body part, view full instructions.
- **Routines** — saved routines with exercise thumbnails and muscle tags;
  build a new one from scratch or save one automatically after finishing an
  ad-hoc workout.
- **Active session logging** — add exercises mid-workout, edit reps/weight per
  set, mark sets done (which fully fills the kg/reps boxes with the accent
  color), see live volume and a "previous performance" hint per set, get a 🏆
  flag on new personal records. Tap a set's number to reclassify it as a
  warm-up, failure, drop set (with a configurable round count), or superset,
  or remove it — warm-up sets are excluded from volume/PR calculations. A
  never-before-logged exercise starts with zero rows instead of pre-filled
  guesses. Turn on an optional per-exercise rest timer (5s–2min presets); it
  pops up a countdown with −5s/+5s/skip after every completed set and
  dismisses itself when time's up. Removing a whole exercise asks for
  confirmation first. Minimize to a persistent bar and resume from anywhere;
  discarding or ending a workout uses a custom in-app dialog (no native
  `confirm()`/`alert()`), and Escape or swiping down the handle dismisses any
  sheet or dialog.
- **Profile ("You")** — workout count, total volume, personal records
  (heaviest set + estimated 1RM via Epley) and history (top 5 with a show
  more/less toggle), a volume/duration/reps chart and muscle-split radar that
  share one period selector (This week/This month/Past 3 months/All time),
  and a monthly training calendar you can page through — trained days show
  the workout title and open the full detail sheet on tap, with your current
  week streak and days since your last workout above it. Your own past
  workouts are editable (fix a logging mistake after the fact) via the edit
  toggle in the workout detail sheet.
- **Friends** — add a friend by email, accept/decline requests, and unfriend,
  all from a sheet reachable from the You page. Accepted friends' workouts
  sync in read-only (row-level security grants exactly that) for the crew
  feed and Stats comparisons — nothing else about their account is exposed.
- **Stats** — volume leaderboard and a head-to-head vs. any real friend,
  shown as pill-bar comparison tiles. Exercise-level head-to-head lets you
  pick a muscle group and ranks the top exercises you've both logged, each
  with its own heaviest-set/1RM/volume/frequency comparison. Add a friend
  from the You page to unlock this.
- **Accounts** — sign up/sign in with email + password (Supabase Auth); your
  session persists across reloads and works offline once signed in. All your
  data syncs to Postgres under row-level security, so it's scoped to your
  account and follows you to a second device.
- **Settings** — a gear icon on the You page opens units (kg/lb, applied
  everywhere weight and volume appear), week-starts-on, a default rest timer
  and default landing tab, the smart-routine-rotation and
  confirm-before-removing-an-exercise toggles, keep-screen-awake/haptics/
  rest-timer-sound, a dark/light theme with 8 accent color presets, and
  export/import/clear for your local data.
- **Home page** — a random line from a 50-quote pool stands in for the
  headline, picked fresh each time you open or reload the app.
- **PWA** — installable via "Add to Home Screen" on iOS/Android, offline
  app-shell + exercise media caching via `vite-plugin-pwa`.

### Not yet built (later phases per the project plan)

- Full 1,324-exercise dataset + hosted media (currently a curated 31-exercise
  subset bundled directly into the app, ~3 MB)

## Running it

```bash
npm install
npm run dev
```

Open the printed local URL on your phone (same network) or in a desktop
browser at mobile width. `npm run build` produces a production build;
`npm run preview` serves it locally to test the installed-PWA experience.

## Update notes

**Home page quote**
- The "Let's get to work." headline is now a random line from a 50-quote
  pool, in the same two-tone style (closing word/phrase in the accent
  color). Picked once per app load/reload — it stays put while you move
  between tabs, so it doesn't feel like it's flickering at you.

**Settings sheet**
- New gear icon on the You page opens a categorized Settings sheet: units
  (kg/lb — converts every weight and volume figure in the app, session
  logging through Stats, while data stays stored in kg), week-starts-on,
  default rest timer, default landing tab, smart-routine-rotation and
  confirm-before-removing-an-exercise toggles, keep-screen-awake (Wake
  Lock), haptics on set completion, a rest-timer-end sound, a dark/light
  theme, 8 accent color presets (all applied as live CSS variable
  overrides), and export/import/clear for your local backup.
- Fixed a couple of accent-consistency bugs found while building the color
  presets (the volume chart's highlighted bar and a couple of highlight
  backgrounds were hardcoded to mint instead of following the accent), and
  a bug where lb-converted weights showed long float tails instead of one
  decimal place.

**You page: shared period selector + training calendar**
- The volume/duration/reps chart and the muscle-split radar now share a
  single period picker (This week/This month/Past 3 months/All time) in
  the chart's top-right, instead of two separate ones.
- Replaced the training heatmap with a full monthly calendar you can page
  through with ‹/›: trained days show a filled accent circle and the
  workout's title, and tapping one opens the same workout detail sheet
  used elsewhere. A stats row above shows your current week streak and
  days since your last workout.

**Rest timer**
- Each exercise gets an optional rest timer: tap "Rest timer: Off" for a
  preset picker (5s up to 2min). Completing a set for an exercise with a
  timer configured docks a countdown bar at the bottom of the screen with
  −5s/+5s/skip controls; it dismisses itself when time runs out and
  reappears on the next completed set.
- Completed sets now fully fill the kg/reps boxes with the accent color
  (instead of a faint tinted border), matching the session header's look.

**Bug fixes & polish pass**
- Fixed workout history showing sets you never checked off as if you'd done
  them — only sets marked done are saved.
- "Do again" now preserves each set's warm-up/failure/drop/superset type
  instead of flattening everything to normal.
- History rows (You page) and exercise rows (Add exercise picker) are now
  keyboard-accessible, matching the rest of the app's clickable cards.
- Your own past workouts are now editable — an edit toggle in the workout
  detail sheet turns each set into weight/reps fields you can correct.
- Muscle-split radar chart now uses the app's actual color tokens instead of
  hardcoded off-theme colors.
- Escape now dismisses whatever sheet or dialog is open; bottom sheets also
  support swipe-down-to-dismiss via the grab handle.
- "Today's session" now avoids suggesting the same muscle group two days in
  a row instead of pure least-recently-trained ordering.
- Added **Superset** as a fifth set type (yellow **S**) alongside Warm
  up/Failure/Drop set, and removing a whole exercise mid-session now asks
  for confirmation first (removing a single set stays instant).

**Set types & drop sets**
- Tapping a set's number badge during a live session opens a menu to mark it
  as a Warm up (orange **W**), Failure (red **F**), or Drop set (blue
  **D1/D2/...**), or to remove it. Drop set asks for a round count (2–6, default
  3) and generates that many linked rows in one step.
- Warm-up sets no longer count toward volume, set totals, or personal
  records anywhere in the app.
- A freshly-added exercise you've never logged before now starts with zero
  set rows (just "+ Add set") instead of three guessed defaults.

**Stats page redesign**
- Head-to-head comparisons (both the overall stats and the per-exercise
  breakdown) now render as a grid of pill-bar tiles — two rounded bars per
  stat, sized proportionally, with a color legend — instead of one thin
  stacked bar per row.
- The exercise-comparison picker is now muscle-group chips + a ranked top-5
  leaderboard (by combined volume with your rival) with a show more/less
  toggle, instead of a plain dropdown of every shared exercise.
- Fixed Joost's accent color, which was too close to the app's mint green to
  read against the new colored comparison bars.

**You page redesign & Stats head-to-head**
- Personal records and history sections now show the top 5 with a "show
  N more" / "show less" toggle instead of an ever-growing list.
- Replaced the weekly volume bar chart with a bigger, higher-contrast
  training heatmap (with a legend and headline stat) that can toggle between
  volume, duration, and reps.
- Stats now lets you pick which training partner to compare against and
  head-to-head covers six metrics (workouts, volume, sets, time trained,
  records, streak) plus a dedicated exercise-level comparison.

**Fine-tuning pass (routines, session logging, accessibility)**
- Routines can now be renamed or deleted (tap "⋯" on a routine card) — previously
  create-only.
- Finishing a workout with zero completed sets is now blocked, instead of silently
  logging an empty session.
- New sets pre-fill from your last logged performance for that exercise instead of
  a flat 20kg × 10 default.
- Fixed weight/reps inputs snapping to "0" while clearing a value to retype it.
- "🏆 New record" now only fires for a genuine PR (compared against history *and*
  earlier sets in the same session), not for every set of a brand-new exercise.
- Added aria-labels to icon-only buttons (routine options, mini-bar controls,
  remove-exercise, exercise info, etc.) and friendlier empty states for routines
  and workout history.

**Crew feed redesign**
- Home's "The Crew" section now shows full workout cards (avatar, name, time,
  workout title, a stats row of Time/Volume/Records/Sets, and an exercise list
  with thumbnails that expands past the first 3) instead of a single summary line.
- "Records" is computed for real — an exercise counts only if its best set in that
  workout beats that person's best from every earlier session.

**Deployment**
- Added GitHub Pages deployment via GitHub Actions, auto-building and publishing
  on every push to this branch.
- Fixed a white-screen crash on some mobile browsers caused by the production
  build targeting overly modern JS syntax; build now targets ES2018. Added an
  error boundary and a local-storage fallback so a crash or blocked IndexedDB
  shows a real message instead of a blank page.

## Attribution

Exercise photos, GIFs, and instructions are © Gym Visual, used under the
dataset's educational/non-commercial license. This app is for private use by
its owner and training partners only — not for public distribution or
monetization.
