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

### Workout-nudge push notifications (one-time backend setup)

The "remind me if I leave an active workout" setting needs backend
infrastructure the client alone can't provide — see
`supabase/functions/nudge-dispatcher/README.md` for the full setup (run the
Phase 6 section of `supabase/schema.sql`, generate a VAPID keypair, set it as
Edge Function secrets, deploy the function, add the public key as
`VITE_VAPID_PUBLIC_KEY` alongside the existing Supabase build secrets, then
schedule the dispatcher via `pg_cron`). The setting stays hidden/inert until
this is done.

## Update notes

**Version 1.8.0**
- Fixes and features from the first real training session with the app:
  - **Active session header** now hides while scrolling down (so more of
    the exercise list is visible) and slides back the instant you scroll
    up even slightly, instead of needing to scroll all the way back to the
    top to see the clock or hit Minimize.
  - **History editing** now goes beyond weight/reps: add or remove sets on
    an existing exercise, and add or remove whole exercises from a past
    workout (reuses the same exercise picker used for an in-progress
    session). Editing mode now survives adding an exercise instead of
    silently dropping back to read-only.
  - **Routines** on the Train screen can now be drag-reordered, same
    press-and-drag handle as reordering exercises mid-workout.
  - **Nutrition goal** can now be set either as a kg/week rate (as before)
    or directly as a kcal/day target — typing a number converts to the
    equivalent rate under the hood, so macros and calibration keep working
    off the same value either way.
  - Workout durations (home feed, history list) now read "1 hour and 10
    mins" instead of "70 minutes."
  - Fixed the protein target formula: a "lose" goal always jumped straight
    to the top of the recommended range regardless of how mild the rate
    was, so even a slow 0.1 kg/week cut got the same near-maximum protein
    number as an aggressive 1.0 kg/week one. It now scales between the
    two, matching how aggressive the actual deficit is.
  - Rest timers now vibrate (short-short-long pattern) when they end, in
    addition to the existing sound — noticeable in a pocket. Gated by the
    same haptics setting as the set-complete tap.
  - Fixed the sheet swipe-to-dismiss gesture: it only ever worked from the
    small handle bar at the very top, so a swipe starting anywhere in a
    sheet's header (which is what it looks like you should be able to grab)
    fell through to scrolling the content instead, or took several tries.
    The whole sheet is now draggable-to-dismiss once scrolled to the top
    (like a native bottom sheet), and a quick flick dismisses even without
    crossing the old distance threshold.

**Version 1.7.3**
- Split the exercise picker's "upper arms" filter chip into separate
  **Biceps** and **Triceps** chips (using each exercise's existing `target`
  field — 151 biceps, 141 triceps) so they're easier to find while
  searching for an exercise. Every other muscle-group chip is unchanged.

**Version 1.7.2**
- Fixed a bug on the **You** page: switching the top volume/duration/reps
  chart's period (This week / This month / Past 3 months / All time) only
  updated the big number, the % change, and the muscle split radar chart
  below it — the bar chart itself always kept showing a fixed 12-week
  window no matter which period was selected. It now re-buckets to match:
  daily bars for a week, weekly bars for a month or 3 months, monthly bars
  for all time.

**Version 1.7.1**
- The Profile and Body composition detail sheets were just re-showing the
  same numbers already visible on the compact card — not useful. Fixed:
  - **Profile** now opens the actual editable form (pre-filled), not a
    read-only repeat of the same four lines.
  - **Body composition** now also shows a BMI trend and a waist-to-height
    trend line (from your logged history), below the existing BMI/waist
    numbers.
  - **Relative strength**'s detail sheet now shows each lift's estimated
    1RM weight next to its ratio (the dashboard stays ratio-only to keep
    it compact).
- Fixed a visibility bug: the Profile card's tap-to-expand icon sat right
  on top of its "Edit" button. Removed the icon there specifically — the
  Edit button already signals the card has actions.

**Version 1.7.0**
- Every compartment on the Life dashboard (Today, each macro tile, Hydration,
  Weight, Relative strength, Profile, Body composition) is now tappable — a
  small expand icon in the top-right corner marks it — opening the same
  underlying full card as a focused detail sheet instead of duplicating that
  content further down the page. Weight, Nutrition, Macros, and Hydration's
  full cards moved out of the main scroll entirely (sheet-only now); Profile
  and Body composition stay visible inline too and are tappable in place.
  Quick actions on the compact tiles (hydration's +250/+500, weight's "Log
  today", profile's "Edit") still work without opening the sheet.
- Added a "Clear today's water" option inside the Hydration detail sheet,
  mirroring the existing "Clear today's kcal" — water logging was previously
  add-only.

**Version 1.6.1**
- Added a "Clear today's kcal" option next to the calorie quick-add (with a
  confirm step) — the calorie log was previously add-only, so a mis-typed
  entry could only be fixed by logging more, not by resetting.

**Version 1.6.0**
- Redesigned the top of the Life tab into a visual dashboard, based on a
  mockup the user liked: a calorie ring with a goal-phrased headline, three
  macro tiles with colored share bars, a 7-day calorie history, compact
  side-by-side hydration/weight tiles, and a "relative strength" section
  with bars per lift. Every existing detailed card (Profile, full Weight,
  Measurements, Body composition, Nutrition with its safety guardrails,
  Macros with ranges/portions/fibre, full Hydration with sweat-rate
  calibration, Wellness) is unchanged and still below it — this is additive,
  not a replacement.
- **Note on scope:** this required adding a simple daily calorie-eaten
  counter (tap +, type a number, add to today's total — same shape as the
  existing water counter). This is a deliberate, explicit reversal of this
  feature's original "no calorie/food logging, ever" rule — flagged to and
  confirmed by the user before building it. It's still just a running
  number, not a food diary: no meal names, no per-food macros, no database.

**Version 1.5.0**
- New **Today** card at the top of the Life tab — the "so what do I actually
  do" synthesis of everything else on the screen: today's calorie target
  phrased around your goal, the macro split, today's hydration target
  (training bonus included when relevant), and the calibration read (on
  track / a suggested adjustment / not enough data yet). No new data
  collection — still no food diary — just pulling together numbers every
  other card already computes. A single quiet nudge if today's weight
  isn't logged yet; nothing shown (no checkmark, no streak) once it is.

**Version 1.4.8**
- Fixed three bugs found in a full Life tab review: height in feet/inches
  could show as e.g. "5'12"" instead of rolling over to "6'0""; the weight
  card's "Log today" prefill could go stale if your data arrived from the
  cloud after the card had already rendered; and a cloud refresh could race
  a not-yet-synced local edit and briefly clobber it. No data loss occurred
  from any of these — worst case was a wrong number in the input box.

**Version 1.4.7**
- Life tab: the last pieces — an optional, light-touch Wellness card (sleep,
  resting heart rate, energy 1-5, each with its own trend chart, no
  streaks or scores), and a sweat-rate calibration form in the Hydration
  card (weigh in before/after a workout to replace the 500-1,000 ml/hour
  default with your own measured rate, since sweat rates vary several-fold
  between people). This completes the Life tab's full build-out: profile,
  weight + measurements, body composition, calorie target with safety
  guardrails, full macros, hydration, and calibration from real trend data.

**Version 1.4.6**
- Life tab: calorie calibration — once you've logged at least 14 days of
  weight, the Nutrition card compares your actual 7-day-rolling-average
  trend against what the target rate predicted and suggests a modest
  (~150 kcal) adjustment if they've drifted apart, e.g. "You've averaged
  −1.2 kg/week over the last 20 days on 2,318 kcal. To hit your −0.5
  kg/week goal, try ~2,468." Protein and fat stay pinned to bodyweight;
  carbs absorb the change automatically.

**Version 1.4.5**
- Life tab: hydration — a progress ring against today's target (bodyweight
  baseline + a hot-climate bonus + a training bonus that scales
  automatically with today's logged workout duration), quick-add buttons
  plus a custom amount, and a 7-day history. No nagging notifications, no
  "chug water to hit your goal" framing.

**Version 1.4.4**
- Life tab: full macro split — protein and fat anchor to bodyweight (or lean
  mass, if body fat % is logged, with the card stating which basis is
  active) and are shown as ranges plus a portions estimate, not bare grams;
  carbs absorb whatever's left of the calorie target, with a warning if
  that lands unusually low (a sign the deficit is too aggressive, not a
  deliberate low-carb plan); fibre target included.

**Version 1.4.3**
- Life tab: calorie target card — maintenance (TDEE, Mifflin-St Jeor) and a
  goal-adjusted target with every safety guardrail enforced in code, not
  just copy: a hard floor (1,500 kcal male / 1,200 female) that clamps and
  explains rather than silently going lower, a suppressed loss target when
  BMI is already under 18.5, and a flag on rates above 0.75 kg/week. Goal
  (lose/maintain/gain) and target rate are editable right on the card.

**Version 1.4.2**
- Life tab: body composition card — BMI with a neutral label (never the
  clinical under/normal/overweight/obese wording) and an inline caveat that
  it misclassifies muscular people, waist-to-height ratio flagged against
  the 0.5 guideline, and relative strength (best 1RM ÷ bodyweight) for your
  top lifts.

**Version 1.4.1**
- Life tab: weight logging with a trend chart (7-day rolling average
  overlaid on the raw daily line, so one heavy day doesn't read as a real
  swing), plus collapsible measurement rows (waist/chest/arm/thigh/hip/neck)
  with their own mini trend charts.

**Version 1.4.0**
- New **Life** tab (between Stats and You) — the start of body measurements,
  composition, nutrition targets, and hydration tracking, framed around
  fuelling training rather than restriction (no streaks, no food diary, no
  "over budget" states). This first slice adds the profile setup (height,
  birth year, sex at birth, activity level, goal, target rate, climate) —
  weight logging, body composition, calorie/macro targets, hydration, and
  calibration land in follow-up updates. Strictly private: never shared with
  friends, never in the crew feed or Stats.

**Version 1.3.2**
- The Home feed ("The crew") was hard-capped at 4 workouts with no way to see
  older ones. It now loads more automatically as you scroll near the bottom,
  4 at a time, instead of hiding your history.

**Version 1.3.1**
- Polished the "workout still in progress" push nudge: the notification title
  is now the workout name itself (e.g. "Chest & Triceps") instead of a generic
  header, and the second nudge 5 minutes later now actually re-alerts (buzzes,
  reappears on the lock screen) instead of silently replacing the first one
  in place.

**Version 1.3.0**
- **"Workout still in progress" push nudge**: while a workout is active and
  the app is backgrounded/locked, a server-scheduled push notification
  reminds you to come back — a client-side timer can't do this reliably
  (iOS freezes the service worker of a backgrounded PWA), so the schedule
  lives in Postgres and a `pg_cron`-triggered Edge Function sends the actual
  push via VAPID. First nudge ~1 minute after backgrounding, a second
  ~5 minutes after that if you're still away and the workout's still active
  (configurable off), none after that. Returning to the app, finishing, or
  discarding the workout cancels anything pending. New "Notifications"
  section in Settings; detects and explains when it's unavailable (a browser
  tab on iOS can't receive push at all — only an installed home-screen app
  can). Needs one-time backend setup — see "Running it" above.
- **Fixed a real risk this surfaced**: the active workout only ever lived in
  memory, never touching disk until you tapped Finish — so if the OS fully
  evicted a backgrounded PWA (which iOS does aggressively, precisely during
  the kind of extended background this feature is nudging you back from),
  reopening it would show no active session at all, silently losing
  whatever was unsaved. The in-progress session now mirrors to local storage
  as it changes and restores itself on launch, so tapping the notification
  reliably lands you back on the same workout instead of a fresh Home screen.

**Version 1.2.0**
- **Routine editing**: there was no way to edit an existing routine's
  exercises at all — only rename or delete. Adding, removing, or reordering
  exercises during a session started from a routine silently never saved
  back to the routine template, with no indication anything was dropped.
  Finishing a workout that changed a linked routine's exercises now shows an
  explicit choice: save the change to the routine, or keep the original as-is.
- Fixed routine edits not reaching an already-linked second device — the
  cloud sync for a device that's already linked only ever pulled brand-new
  routines/sessions across, never updates to something that already existed
  on that device, so an edit made on one device (e.g. the browser) stayed
  invisible on another (e.g. the installed app) indefinitely.
- Added a confirm-gated "Delete workout" button to the workout detail sheet,
  so a workout saved by mistake instead of discarded can actually be removed
  from history (own workouts only; friends' workouts are unaffected).
- **PWA installability**: a small "Install" pill in the You page header
  triggers the native install prompt on Android/Chrome, or reveals the
  Share → "Add to Home Screen" steps in a popover on iOS — neither Safari
  nor Chrome for iOS can trigger install programmatically, since Apple
  requires every iOS browser to run on WebKit regardless of which one it is.
- Fixed the installed (standalone) app clipping its own header content under
  the iOS status bar, and an incorrect initial zoom on first launch — both
  were missing safe-area/viewport handling that only matters once there's no
  browser chrome around the page.
- The app now actively checks for a newly deployed version the moment it
  regains focus instead of relying on the browser's own opportunistic
  checking — installed PWAs (especially on iOS) could otherwise sit on an
  old cached version for an extra app-open or more after a release.
- Fixed the exercise picker's search bar visibly jumping up and down as
  results narrowed toward a few matches — the whole sheet was shrink-wrapping
  its height to the filtered list instead of staying a fixed size.
- Fixed several iOS-only mobile bugs found in a full pass over the app: text
  inputs under the 16px font-size threshold (exercise search, email fields,
  the session name field) were auto-zooming the whole page on focus; the
  workout-cancel "END" button had an 18px-tall tap target, the smallest in
  the app.
- Friends' new workouts now show up on Home without restarting the app —
  refreshed automatically every 45s and the instant the app regains focus,
  instead of only on first load or opening the Friends sheet.
- Own workouts now appear in the Home page's crew feed alongside friends',
  merged into one recency-sorted timeline instead of friends-only.
- The Home page's date/time now ticks live instead of freezing at whatever
  it happened to show when the screen last rendered.
- Added a version indicator (e.g. `v1.2.0`, sourced from `package.json`) to
  the top of the Settings sheet — bumped on every deploy from here on, so
  it's easy to tell which build is actually running.

**Full app audit & bug fixes**
- Ran a systematic pass across the data/sync layer, UI/calculations, and
  auth/PWA code looking for real bugs. Fixed, worst first:
  - **Security**: friendship requests could be forged — the RLS policy that
    lets you accept/decline a request never pinned who the requester stays
    as, so anyone could rewrite a throwaway self-request to name a real
    victim and mark it accepted, instantly granting read access to that
    victim's workout history. Closed with a database trigger that locks
    `requester_id` on update.
  - Every finished workout was timestamped with the *finish* time instead of
    the actual start time.
  - A fast account switch could let a stale account's cloud sync or friends
    list get applied on top of the newly signed-in account (the in-flight
    guard is now keyed per account, not a single global flag).
  - A password-reset link could briefly show the live signed-in app before
    flipping to the "set new password" screen.
  - A 0-rep "done" set could register as a fake personal record; bodyweight
    exercises now show your best rep count instead of a static "0 est. 1RM"
    that never reflected real improvement.
  - Weekly streak now respects your Monday/Sunday week-start setting instead
    of a rolling 7-day window that disagreed with the training calendar next
    to it; `relativeDate` no longer mislabels workouts logged near midnight.
  - Stats: a friend with zero logged workouts no longer vanishes from the
    leaderboard; "shared exercises" is now an actual intersection of what
    you've both logged (was a union); the exercise picker list now respects
    the selected time period like its stats already did.
  - Accept/decline/remove-friend now shows an error instead of failing
    silently; Wake Lock now reacquires itself after the tab is backgrounded
    mid-workout; importing an old backup file can no longer resurrect
    retired demo data or collide with a friend's display name.

**Real friends**
- Replaced the two hardcoded demo training partners (Sanne & Joost) with a
  real friends system: search a friend by email or browse every account on
  the app, send a request, accept/decline, unfriend — from a sheet reachable
  next to the Settings gear on the You page. Accepted friends' workouts sync
  in read-only (a Postgres row-level-security policy grants exactly that,
  nothing else about their account is exposed), powering real Stats
  head-to-head comparisons and Home's crew feed. New accounts now start
  completely empty instead of pre-seeded with fake demo history.

**Accounts & cloud sync**
- The app now requires a real account (Supabase Auth, email + password) to
  use at all. Once signed in it still works offline via a local IndexedDB
  cache, syncing to Postgres under row-level security in the background —
  data follows you to a second device, and you can permanently delete your
  account (and everything tied to it) from Settings.

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
