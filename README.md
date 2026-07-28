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

**Version 1.21.0**
- **Rebuilt the weight detail sheet around progress rather than a bare line.**
  - The chart's y-axis was anchored at zero, so an 82 kg reading sat at the
    top of a 0–100 axis and two months of real change rendered as a flat
    line. `ProgressChart` gained an opt-in `fitToData` axis that spans the
    data's own range (with margin); weight uses it. The other charts
    (1RM, volume, measurements, wellness) keep the zero baseline, which is
    the honest default when "how big" is the question.
  - New headline: total change over the selected period with the dates it
    spans, plus Start / Now / Per-week tiles and a low/high line with the
    dates each occurred and the number of entries.
  - New **Entries** list — every logged date with its weight and the change
    from the previous entry, newest first, collapsed behind a show-more.
    This is the "what was I on the 12th" view the chart couldn't give.
  - The two plotted series (logged points and the 7-day trend) are now named
    in a legend instead of being told apart by dash pattern alone.
  - Change colours follow your **goal**: on a cut, downward change reads as
    progress; on a bulk, upward does; on maintain, neither is singled out.
    Previously "down" was always coloured as good, which is wrong for anyone
    gaining.

**Version 1.20.0**
- **Chime volume slider** for the rest-timer alert, in Settings just under the
  sound toggle (and only shown while that's on). Releasing the slider — or
  tapping "Test rest timer alert" — plays the chime at the chosen level so you
  can set it by ear; it previews on release rather than on every step, so
  dragging doesn't machine-gun the sound.
- Sliding to 0 is a genuine mute: the chime is skipped entirely rather than
  played at an inaudible gain.
- The setting scales the chime *within* your phone's own media volume — it can
  make the alert quieter, never louder than the device is already playing.
- The value is clamped to 0–100% when loaded, so a hand-edited or corrupt
  backup can't set a gain multiplier that plays it painfully loud.

**Version 1.19.0**
- Fixes from a full review of everything added since 1.12.0 (~3,150 lines).
- **Badge progress now agrees with the Home screen.** Streak and Consistency
  reported their *best-ever* value, so the collection could claim a 10-week
  streak while Home showed 2, and a Consistency of 5 when you'd trained twice
  in the last 30 days. Both now report the live value — the streak reuses the
  very same `weeklyStreak` helper Home uses, so they can't drift. The other
  tracks (workouts, volume, PRs, variety, longest session, routines) are
  cumulative or personal-best by nature and are unchanged. This affects only
  the progress readout: which badges are *earned* still comes from replaying
  history, so a streak you once hit stays earned after it lapses.
- **The feed's trophy count can no longer disagree with the marked PR sets.**
  If one session ever contained the same exercise in two entries,
  `recordsPerSession` counted it twice while the workout detail marked it
  once. Records are now collapsed per exercise before counting, and
  `recordSetIndexesInWorkout` is keyed by entry index instead of exerciseId —
  the old key both collided and would have marked the same row in both
  entries. No current path produces duplicate entries (both add-exercise paths
  dedupe, and the Hevy importer groups sets by exercise), so this was latent
  rather than something you'd have seen. Verified across 1,823 randomised
  histories: previously 5 mismatches, now 0.
- **Badge computation is no longer quadratic.** The Consistency track
  re-filtered the whole history per session; it now slides a window. This runs
  on every set toggle (for mid-session celebrations), so it's on a hot path:
  at 1,000 sessions it went from 12.3ms to 4.4ms, and the metrics pass from
  10.6ms to 2.3ms.
- `ladderProgress` now takes the ladder's value directly rather than a whole
  metrics object, so a caller can't pass a placeholder and silently read zero.

**Version 1.18.1**
- **Tapping into a weight/reps field now puts the caret at the end.** Tapping
  the middle of "10" left it between the digits, so backspace deleted the 1
  instead of the 0. The set inputs are now `type="text"` with `inputMode`
  still driving the numeric keypad — `setSelectionRange` throws on a number
  input, so the caret genuinely can't be positioned there. Typed input is
  filtered to digits (plus one decimal point on weight fields), which the
  number input used to handle. Side benefit: no desktop spinner arrows.
- **"+ Add set" now copies the set you actually just did**, i.e. the most
  recently *completed* set rather than the trailing row. For an exercise
  you've done before, the app pre-fills several rows from last time; editing
  row 1 to what you really lifted and hitting "+ Add set" used to copy the
  stale bottom row and read as "it didn't remember".
- **A brand-new exercise no longer invents a starting weight.** Adding the
  first set to an exercise with no history left it at 10 reps x 20 kg; it now
  starts empty, since there's nothing to base a guess on and a wrong pre-fill
  is worse than none.

**Version 1.18.0**
- **Transition polish** across the four most-repeated moments in the app.
  Every one of them collapses to instant under `prefers-reduced-motion` — the
  CSS and the JS both check it, so they can't disagree.
  - **Sheets** already tracked the finger and already dismissed on a fast
    flick as well as on distance (one shared `SheetContainer` drives every
    sheet, so that was never per-sheet). What was missing was the return: a
    drag that doesn't earn a dismiss now springs back with a slight overshoot
    instead of sliding flatly home.
  - **Tab switches** get a 0.16s cross-fade with a few px of lift. The
    wrapper is keyed on the screen, so rapid tapping restarts the animation
    on a fresh element rather than stacking — the newest tap always wins.
  - **Minimise / restore** is no longer an instant mode flip: the session
    screen shrinks toward the bar and grows back out of it, with the bar
    rising to meet it, so it reads as one object changing size. The mode
    change is held back until the shrink has played. The rest timer carries
    over untouched (it was always absolute-time state in the store, so there
    was nothing to reset).
  - **Drag reorder** now takes a 6px slop before a press becomes a drag, so a
    tap stays a tap and a scroll stays a scroll — that ambiguity was most of
    what made it feel wonky. A lifted item scales up and casts a shadow, and
    on release it eases into its landing slot instead of snapping: the drag
    view (and the reorder commit) is held for the length of that motion, so
    the list can't reshuffle underneath the animation. Same behaviour in both
    places, since both already share `useDragReorder`.

**Version 1.17.0**
- **Fixed: the rest-timer alert never actually fired on iPhone.** The feature
  and its settings toggles already existed, but neither channel worked on iOS:
  - *Sound* — `playBeep()` created its `AudioContext` lazily inside the rest
    timer's `setTimeout` callback, which isn't a user gesture. iOS creates a
    context that way in the `suspended` state and nothing ever resumed it, so
    the oscillator played into a dead context. There's now an `unlockAudio()`
    called from the set-toggle tap (a real gesture, and the same tap that
    starts the timer), plus a `resume()` guard on every play since the OS can
    re-suspend the context when the app is backgrounded.
  - *Vibration* — iOS/WebKit doesn't implement the Vibration API at all, so
    both vibrate toggles were dead switches with no explanation. Vibration
    now goes through `lib/haptics.ts`, and Settings hides those rows on a
    device that can't vibrate, showing a one-line explanation instead
    (mirroring how the push section already handles an incapable device).
- The rest-timer chime is now a **three-tone rising pattern** rather than a
  single blip — easier to pick out in a gym, and on iPhone it's the only
  alert channel available.
- **New "Test rest timer alert" button** in Settings, so you can check the
  alert without starting a workout and waiting out a timer. Tapping it also
  serves as the iOS audio unlock.

**Version 1.16.0**
- **Animated celebration overlays**, transcribed from the FitFlow Badge
  System design (via the standalone "Full flow" export). Both share a set of
  primitives in `CelebrationFx.tsx` — a radial rays wash, an expanding ring,
  and a fan of sparks thrown outward by rotating each spark's parent so its
  "upward" flight becomes an outward arc — plus the design's own keyframes
  (`raysIn`, `ringOut`, `sparkFly`, `riseIn`, `crestPop`, `crestFloat`,
  `wipeIn`, `barGrow`, `streakUp`, `fadeIn`) at their original timings.
  - **Achievement unlocked** — replaces the old plain dialog. Cool-white rays
    and ring, 12 sparks, the crest popping in then floating, and the copy
    rising in beneath it. Renders the badge's *real* crest, so a max-tier
    unlock shows the platinum/crowned/winged version.
  - **New personal record (in-session)** — new. Mint light-streaks rising up
    a blurred backdrop, gold rays/ring, 10 sparks, the gold trophy crest, one
    of the design's four rotating headlines, and a card breaking the lift
    down: weight × reps, the delta, a gradient bar, previous best and e1RM.
  - Both honour `prefers-reduced-motion` (same layout, no flying parts).
- **PRs are now detected live, mid-set.** Completing a set checks it against
  your all-time best e1RM for that exercise — counting both finished history
  *and* earlier sets in the current workout, so a ramp-up only celebrates a
  set that genuinely raises the bar again. Warm-ups and 0-weight sets are
  excluded, as everywhere else.
  - If a set both sets a PR and unlocks a badge, the achievement plays first
    and the PR follows once dismissed.
  - A PR popup left open when a workout is finished or discarded is cleared.
- The PR overlay's Share button uses the OS share sheet where available,
  falling back to the clipboard.

**Version 1.15.0**
- **Workout detail now shows *which* sets were the records.** The crew feed
  already showed a 🏆 count on each workout, but opening it gave no way to see
  which set earned it. The record-setting set is now marked with a gold-
  outlined 🏆 pill, and its exercise gets a "🏆 NEW PR" flag — for your own
  workouts and friends' alike.
  - The marked set is the one with the highest estimated 1RM in that exercise,
    which is what the record is actually measured on — so the top set gets the
    trophy even when a different set was heavier or had more reps.
  - Warm-ups and bodyweight (0-weight) sets are never marked, matching how the
    rest of the app treats records.
  - `newRecordExerciseIdsInWorkout` is now derived from the same set-level
    function (`recordSetIndexesInWorkout`), so the number of marked sets can
    never disagree with the 🏆 count shown on the feed card or the names on
    the Finish screen.
  - Added `--gold` / `--gold-soft` theme tokens (with a darker light-mode
    value, since the dark-theme gold fails contrast on white) and pointed the
    feed's existing trophy colour at them, so PR gold is defined in one place.

**Version 1.14.2**
- **Fixed: achievement celebration sometimes never showed** (the collection
  count would go up but no pop-up). Root cause: `syncWithCloud` replaced local
  settings wholesale with the account's cloud blob; if that blob was written by
  a client without `badgesKnown` (older version, or a first-run race), it reset
  the "already celebrated" set to empty, so the next finished workout was
  treated as a silent first-time baseline instead of a celebration. Cloud
  settings are now *merged* (`badgesKnown` is unioned and never shrinks, the
  two Social timestamps take the earliest, showcase picks still sync), and the
  merged result is pushed back so the cloud blob heals itself. Also runs a
  silent badge reconcile after pulling history from the cloud, so a second
  device doesn't fire a burst of celebrations for old workouts.
- **Achievements now celebrate the moment they're earned — mid-session, not
  just on the finish screen.** Completing a set evaluates the in-progress
  workout as if finished, so crossing a volume tier, hitting a PR, or logging
  your first failure/drop/superset pops the celebration right there. Discarding
  the workout afterwards cleanly un-credits anything that wasn't really earned,
  so it can celebrate for real next time.

**Version 1.14.1**
- Removed the 6-week streak dot row under the Home stat grid (added in
  1.13.0) — it read as visual noise and didn't earn its place. The streak
  number itself stays in the stat tile.

**Version 1.14.0**
- **Achievements / badge system.** 48 badges across 11 tracks, using the
  FitFlow Badge System crest design (one banner-shield reused across every
  track, stepping up in colour + ornament — dots → gem → star → crown/wings
  at the platinum apex).
  - **Everything is derived from what you already do** — no new logging.
    Badges (and their real unlock dates) are computed by replaying your
    workout history: Workouts, Volume lifted, Training streak, Personal
    records, Consistency (last-30-days), Variety, Session length, Timing
    (Early Bird / Night Owl), Weekend Warrior, Routines (Planner / Architect /
    Creature of Habit), Set types (failure / drop / superset) and Social
    (first friend, first head-to-head). Warm-up sets don't count toward
    volume or PRs, streaks respect your week-start setting, and only finished
    workouts count — matching the rest of the app.
  - **Celebrated exactly once.** Finishing a workout pops an "Achievement
    unlocked" celebration for anything newly earned (a couple in sequence,
    the rest folded into a "+N more" note). Existing history is credited
    quietly on first run, so nobody gets flooded for milestones passed months
    ago; a celebration never re-shows.
  - **Showcase up to 3.** From your collection (reachable from Profile) you
    pin up to 3 badges to show next to your name — on your profile, the Home
    feed, and the Stats leaderboard. Trying to pin a 4th prompts you to unpin
    one first. If you haven't picked any, it defaults to your 3 most recently
    unlocked. Friends' showcases show next to their names too, and tapping a
    name opens their (read-only) collection.
  - **Collection view** groups badges by theme, showing your current badge +
    the next one to work toward with a progress readout ("60 of 100
    workouts"); tap to reveal the full ladder with unlock dates.
  - **Schema:** adds one additive, friend-readable column
    (`profiles.showcase_badges`) — see `supabase/schema.sql` Phase 11. The app
    degrades gracefully until it's run (friends fall back to badges derived
    from their visible history), so there's no hard deploy ordering.

**Version 1.13.0**
- Batch 1 of the "turn logged data into feedback" + "streaks as a feature"
  product push:
  - **Today card**: shows "N kcal left/over today" next to the ring, and a
    "N-day avg X kcal · target Y" line under the 7-day chart (averaged only
    over days actually logged, not padded with unlogged zero-days).
  - **Calibration suggestion is now actionable**: an "Apply" button on both
    the Today card and the Nutrition sheet sets the goal to the suggested
    kcal target in one tap, instead of requiring a manual mode switch + retype.
  - **Weight card**: shows a "🔥 N-day logging streak" once you've logged 2+
    days running (with the same "today not logged yet" grace as other
    streaks in the app — a day only breaks it once it's actually skipped).
  - **Finish screen**: names which exercise(s) hit a new record instead of
    just a count (for 3 or fewer), and shows "▲ N% volume · N min longer/
    shorter vs last time" by comparing against the most recent session from
    the same routine (or same name, for freeform workouts).
  - **Home streak**: the bare number is now backed by a 6-week dot row (this
    week is included, filled once trained) and a "Train this week to keep
    it" nudge when the current week is still open with an active streak.

**Version 1.12.1**
- Fixed a UTC/local-date gap the previous pass missed: `addWater`,
  `addCalories`, `clearWaterToday`, and `clearCaloriesToday` still keyed
  "today" off `new Date().toISOString()` (UTC) instead of the shared local
  `todayIso()` helper. For anyone off UTC, an evening log could land on the
  wrong calendar day and drop out of that day's ring/list. Now consistent
  with the rest of the Life tab.

**Version 1.12.0**
- Batch fix from a second full app-wide review (five parallel per-area audits
  that both read the code and executed the logic). Fixed the items chosen
  from that review:
  - **Cross-cutting**: a friend whose display name resolves to "You" is now
    disambiguated so their sessions can't merge into your own Workouts/
    Volume/Streak/records; the weekly streak no longer resets to 0 at the
    start of each week (the current in-progress week gets grace) and its
    week boundaries are DST-safe.
  - **Train / active session**: keyboard Enter/Space on a routine card's drag
    handle or ⋯ button no longer also launches the workout (keyboard reorder
    now works); the same fix applies to the picker's "i" button vs row
    selection. Supersets done as straight sets (all of A, then B) now start
    a rest timer instead of none. The 🏆 PR badge shows once per exercise,
    matching the Finish screen's record count. Drop sets keep the base set's
    done state and cardio duration/distance. The rest-timer bar stays
    proportional after ±5s. Set/rest/superset menus expose expanded state,
    close each other instead of stacking, and dismiss on Escape. The "Prev"
    column aligns by working-set position, not raw index.
  - **Home / Stats**: the Volume tile shows its kg/lb unit; volume
    abbreviation is consistent everywhere (adds an "M" tier, no more bare
    "1000"); period windows are calendar-day aligned (not time-of-day
    sensitive); friend labels re-sync when the friend list changes; shared
    head-to-head exercises require a real logged set; rival/muscle/exercise
    selectors and head-to-head bars are screen-reader labelled; the exercise
    head-to-head does far less repeated scanning.
  - **Life**: "today" is now the local calendar day, not UTC, so logs land on
    the right day and the ring resets at local midnight (the 7-day charts
    match); re-saving an unchanged weight in lb no longer drifts the stored
    kg; the on-track copy shows an unsigned rate with loss/gain; birth-year
    entry is range-validated; tappable tiles no longer scroll the page on
    Space.
  - **You / Friends / Settings**: "Export data" now includes all Life-tab
    data (weight/measurements/hydration/nutrition) and importing restores it;
    a corrupt/hand-edited backup with a bad theme/accent can no longer
    white-screen the app (settings are validated); deleting the account or
    clearing data now also clears local storage so nothing resurrects into
    the next account on the same device; a previously declined friend request
    can be re-sent; emails with `_`/`%` search correctly; the browse "+"
    reports failures; the import-mode toggle and "show all accounts"
    disclosure expose proper ARIA state; the email-add path points you at an
    incoming request instead of a misleading "already pending".
  - Note: the review flagged the Hevy CSV import as broken, but that was a
    false positive — the code uses a NUL-byte key separator that renders as a
    space in tooling; verified by running the real importer end-to-end. The
    invisible separator was replaced with a direct row read so it can't be
    misread again.

**Version 1.11.4**
- Moved the "Minimize" button up into the mint session header (grouped with
  "End" in the top row) instead of sitting on the dark background just below
  it. Now that the header pins to the top on scroll-up, Minimize rides along
  with it and stays reachable without scrolling back to the very top.

**Version 1.11.3**
- Actually fixed the active session header pinning. The previous attempts
  only toggled a CSS class that did nothing, because the header's
  `position: sticky` had no real scroll container to pin against: `.screen`
  had `overflow-y: auto` (making it the sticky context) but never actually
  scrolled — the whole document grew and scrolled instead — so the header
  just scrolled off the top with the page and only reappeared at the very
  top. Now, during a session, the app-shell is pinned to the viewport
  height so `.screen` scrolls internally, giving the sticky header a real
  container. Scrolling down hides it; any upward scroll brings it straight
  back, pinned to the top. Scoped to session mode only (there's no bottom
  nav during a session), so every other screen's scrolling is untouched.

**Version 1.11.2**
- Fixed the active session header (Recording/Live, timer, volume, session
  name) not reliably reappearing on scroll-up — it required scrolling all
  the way back to the very top, rather than reacting to a small upward
  scroll like it was meant to. The hide/reveal logic required a single
  scroll event's delta to exceed a few px before reacting; that's fine for
  a fast downward flick but real touch/momentum scrolling fires many small
  events, so a small deliberate upward correction rarely cleared the
  threshold. Now it reacts to scroll direction on every event, no minimum
  distance required — down hides it, up (even slightly) brings it back.

**Version 1.11.1**
- The "Pair superset" control was showing on every exercise card regardless
  of whether supersetting was actually in use. It now stays hidden until a
  set is marked with the Superset kind (via the set-number menu), and stays
  visible afterward while the exercise is actually paired so Unpair remains
  reachable even if that set's kind later changes.

**Version 1.11.0**
- Built the four items deliberately deferred from the 1.10.0 improvement
  pass, each a real design decision rather than a mechanical fix:
  - **Quick +/- steppers**: weight/reps/cardio fields in the active session
    now have compact −/+ buttons flanking the number input (weight steps by
    2.5kg/5lb, reps and cardio minutes by 1, distance by 0.1km), fit inside
    the existing tight 5-column set-row grid without widening it further.
  - **Import merge mode**: the import preview now offers Merge (default)
    alongside Replace all. Merge dedups instead of wiping — FitFlow backups
    match by their own stable id, Hevy CSV imports (whose ids are just
    positional placeholders regenerated on every parse) match by exercise
    name + start time instead, so re-importing a growing Hevy export no
    longer creates duplicate workouts.
  - **Active session render-splitting**: each exercise card is now its own
    memoized component instead of one large inline render for the whole
    list — editing or completing one exercise's set no longer re-renders
    every other exercise card in the workout.
  - **Real supersetting**: exercises can now be paired ("⛓ Pair superset"),
    replacing the old cosmetic-only per-set badge. Paired exercises share
    one rest boundary — completing a set doesn't start a rest timer while
    the partner's matching set is still pending, only completing the side
    that finishes the round for both starts the shared countdown.

**Version 1.10.0**
- Full app-wide improvement pass (opportunities and polish, not bugs — a
  separate review already covered those). Same page-by-page approach,
  scanned via parallel focused passes, then built directly:
  - **Home/Stats**: fixed a real perf bug where Stats' leaderboard/head-to-
    head math never actually cached (a fresh `Date.now()` read on every
    render was breaking `useMemo`); the "records this workout" count is now
    computed once per feed instead of re-scanning full history per card;
    unified the inconsistent "12.4k"-style volume formatting across
    Home/Stats; added a sort control to the leaderboard (Volume/Workouts/
    Sets/Streak); Home now shows "days since your last workout" when your
    streak breaks, and a proper empty state before your first workout.
  - **Train/Picker**: exercise search now matches target muscle/equipment
    too (not just the name) and ranks results (exact/starts-with/contains)
    instead of raw dataset order; added a "Recent" section to the picker;
    routines can now be duplicated; drag-to-reorder is now keyboard-
    operable (Enter to pick up, arrow keys to move, Enter to drop) and no
    longer duplicated near-identically between Train and the active
    session screen (extracted to one shared hook); toggle controls (body-
    part chips, exercise rows, metric tabs) now expose their selected state
    to screen readers; picker search has a clear button; the rename-routine
    field now submits on Enter.
  - **Life tab**: every tappable dashboard tile is now keyboard/screen-
    reader accessible; `todayIso()` and the calorie-target calculation
    pipeline were each copy-pasted across 5-7 files, now shared; water and
    calorie entries can be deleted individually instead of only "clear the
    whole day"; weight/measurements/wellness can now be logged for a past
    date, not just today; Measurements and Wellness charts got the same
    period picker Weight already had; disclosure buttons expose their
    expanded state to screen readers; the 7-day chart data no longer
    re-scans the whole log for each of the 7 days.
  - **Profile/Settings/Friends**: destructive actions consolidated into one
    "Danger zone" instead of split across two headings; "Member since" now
    uses your real signup date instead of your oldest logged workout (was
    wrong for anyone who's imported historical data); added a display-name
    field (previously friends only ever saw your email username); the
    import button now shows "Reading file…" instead of going quiet on a
    large export; segmented controls across Settings/Profile now expose
    their selected state; "browse all accounts" has a search filter; the
    show-more/show-less pattern (4 near-identical copies) is now one shared
    hook + component.
  - **Active session** (the most-used screen): every keystroke used to
    write the whole session to IndexedDB — now debounced, with a
    visibility-based flush so backgrounding still saves promptly; the
    "previous performance" lookup shown per set no longer re-scans full
    session history for every row; the Finish screen now shows a 🏆 count
    of new records set that workout; drag-to-reorder exercises is now
    keyboard-operable; the set-type badge and set-complete checkbox got
    larger tap targets; number inputs now have proper accessible labels.
  - A few items were deliberately left for a follow-up conversation rather
    than guessed at, since they involve real design decisions: quick +/-
    steppers for weight/reps (tight grid, needs a layout call), real
    supersetting (currently cosmetic-only), an import "merge" mode
    (currently always replaces), and splitting the active session screen
    into memoized subcomponents (large refactor).

**Version 1.9.0**
- Full app-wide bug review (every screen checked separately via parallel
  focused passes), then fixed directly rather than just reported. Most
  severe first:
  - **Data resurrection via cloud sync** — `clearAllData()`/`confirmImport()`
    used to call a bulk clear/replace against Supabase with no retry on
    failure; if that network call failed, local state already showed
    cleared/replaced while the server still had the old rows, and the next
    sync would silently restore ("resurrect") exactly what was just
    deleted. Both now go through the same per-row push/delete functions
    used everywhere else in the app, which already retry via a pending-sync
    queue.
  - **Malformed JSON backup import** — importing a hand-edited or corrupted
    backup only checked that `routines`/`sessions` were arrays, not that
    each item had the fields the rest of the app assumes exist — could
    crash the import preview. Now validates each item's shape and skips
    (with a toast) anything malformed instead of crashing.
  - **Workout progress ratio stuck below 100%** — the mini-bar and active
    session screen counted "done" sets excluding warmups but "total" sets
    including them, so a workout with any warmup rows could never show
    fully complete.
  - **Nutrition goal display regression** — the Profile summary and the
    "edit profile" screen still showed the old kg/week goal fields even
    when using the newer kcal/day manual target mode, which was misleading
    (editing them did nothing).
  - **History-edit "+ Add to workout" targeted the wrong workout** — the
    button on an exercise's detail sheet only ever knew about a live
    in-progress session, not a past workout being edited.
  - **Import preview count mismatch** — the preview could show more
    workouts than would actually import (sessions that aren't your own get
    filtered out at confirm time); it's now filtered up front so the count
    is accurate.
  - **Stale menu after reordering/removing exercises mid-session** — the
    set-type and rest-timer menus were keyed by array position, so a
    drag-reorder or a removal while a menu was technically open could point
    it at the wrong exercise. Now keyed by exercise id instead.
  - **Rest timer could silently steal another exercise's countdown** —
    checking off a set with its own rest timer configured would replace
    any other exercise's already-running countdown with no indication;
    now shows a toast when that happens.
  - Streak/today-highlight could go stale if a screen was left open across
    a day or week boundary with nothing else to trigger a re-render.
  - Smaller fixes: rest-timer vibration now has its own setting (was
    wrongly tied to "vibrate on set checked off"); tapping "See more" on a
    workout card with a keyboard no longer also opens the workout;
    searching your own email in Friends now says so instead of "no account
    found"; the exercise picker's virtual list no longer flashes blank
    right after narrowing a filter; the Life tab's Energy field no longer
    lets a value like 0.4 round down to 0 (outside its 1-5 scale); the
    Stats period selector (Week/Month/All) is now real buttons, operable
    by keyboard.

**Version 1.8.2**
- Battery drain investigation, two real findings fixed:
  - **"Keep screen awake during a workout"** now defaults to **off**. It
    was on by default, and a lit screen for the length of a whole workout
    is by far the single biggest power draw the app causes — much more
    than anything else. Still there as an opt-in in Settings → Session
    experience for anyone who wants it; only affects fresh installs, an
    existing device's saved choice is untouched.
  - The friends-feed background poll (`refreshFriendSessions`, every 45s)
    ran unconditionally even while the app was backgrounded/screen
    locked, repeatedly waking the network radio for no one to see. It now
    skips the request unless the app is actually visible — the existing
    refresh-on-focus-regain already covers catching up the moment you
    come back.
- Everything else checked (workout timer, rest-timer countdown, update
  check, no persistent realtime connection) was already scoped correctly
  and isn't a meaningful contributor.

**Version 1.8.1**
- Follow-up fixes after real-device testing of 1.8.0 showed three of its
  four fixes didn't actually hold up:
  - **Active session header** — switched to a capture-phase window
    listener so it catches whichever element actually scrolls (this
    varies by how a given browser resolves the `.app-shell` flex layout,
    not something reliably the same everywhere `window`-only listening
    assumed). Also fixes it appearing to "stay stuck" at the top.
  - **Nutrition kcal/day goal** — the previous version was a one-time,
    lossy conversion into the kg/week rate (using local component state
    for the toggle), so reopening the card reset to "Rate" mode and
    showed whatever the clamped rate happened to be — reads like "changes
    my goal back to 1kg/week." It's now a real persisted alternative:
    `goalMode`/`manualKcalTarget` on the profile itself, so the exact kcal
    number and mode survive closing and reopening, and the Life screen's
    Today card reflects it immediately.
  - **Sheet swipe-to-dismiss** — found the actual bug: React always
    attaches touch-derived pointer listeners as passive, so the previous
    version's `preventDefault()` was a silent no-op, leaving the browser's
    native scroll free to win the race half the time. Rewired to real
    non-passive `touchmove` listeners so intercepting the gesture (once
    scrolled to the top and pulling down) actually works, instead of
    racing against native scroll.
- Still investigating: rest-timer vibration reportedly does nothing on a
  real device. If you're on an iPhone, this may not be fixable — Safari
  (including installed PWAs) doesn't implement the Vibration API at all,
  by Apple's own design; Android has different but real restrictions
  around vibrating from a backgrounded tab. Let us know which platform
  you're on so this can be narrowed down properly.

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
