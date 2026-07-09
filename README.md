# FitFlow

A personal fitness PWA for building routines, logging workouts live, and tracking
progress with a small training crew. Built with Vite + React + TypeScript, styled to
the confirmed "Onyx Volt" direction (true-black canvas, mint accent, oversized
condensed type, monospaced stats).

**Try it live:** https://timverberne.github.io/FitLife_App/ (auto-deploys on every
push to this branch via GitHub Actions — see `.github/workflows/deploy-pages.yml`).

## Status: Phases 0–2 (browser-only, no backend yet)

Everything runs client-side. Routines and workout history persist in IndexedDB
(via Dexie), so your data survives reloads on this device but does not sync
anywhere yet — that's Phase 4+ (Supabase auth/sync) from the project plan.

### What works

- **Exercise library** — 31 real exercises (with actual photos + GIFs sourced
  from the [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset),
  © Gym Visual, non-commercial use) covering all 10 body-part categories.
  Search by name, filter by body part, view full instructions.
- **Routines** — saved routines with exercise thumbnails and muscle tags;
  build a new one from scratch or save one automatically after finishing an
  ad-hoc workout.
- **Active session logging** — add exercises mid-workout, edit reps/weight per
  set, mark sets done, see live volume and a "previous performance" hint per
  set, get a 🏆 flag on new personal records. Tap a set's number to reclassify
  it as a warm-up, failure, or drop set (with a configurable round count), or
  remove it — warm-up sets are excluded from volume/PR calculations. A
  never-before-logged exercise starts with zero rows instead of pre-filled
  guesses. Minimize to a persistent bar and resume from anywhere; discarding
  or ending a workout uses a custom in-app dialog (no native
  `confirm()`/`alert()`).
- **Profile ("You")** — workout count, total volume, personal records
  (heaviest set + estimated 1RM via Epley) and history (top 5 with a show
  more/less toggle), a volume/duration/reps training heatmap, and a
  muscle-split radar.
- **Stats** — volume leaderboard, and a head-to-head vs. either demo training
  partner (Sanne & Joost — seeded sample data standing in for real friends
  until Phase 5 social/auth is built) shown as pill-bar comparison tiles.
  Exercise-level head-to-head lets you pick a muscle group and ranks the top
  exercises you've both logged, each with its own heaviest-set/1RM/volume/
  frequency comparison.
- **PWA** — installable via "Add to Home Screen" on iOS/Android, offline
  app-shell + exercise media caching via `vite-plugin-pwa`.

### Not yet built (later phases per the project plan)

- Supabase auth, sync, and row-level security (Phase 4)
- Real friend invites / social feed (Phase 5)
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
