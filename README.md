# FitFlow

A personal fitness PWA for building routines, logging workouts live, and tracking
progress with a small training crew. Built with Vite + React + TypeScript, styled to
the confirmed "Onyx Volt" direction (true-black canvas, mint accent, oversized
condensed type, monospaced stats).

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
  set, get a 🏆 flag on new personal records. Minimize to a persistent bar and
  resume from anywhere; discarding or ending a workout uses a custom in-app
  dialog (no native `confirm()`/`alert()`).
- **Profile ("You")** — workout count, total volume, personal records
  (heaviest set + estimated 1RM via Epley), weekly volume chart, muscle-split
  radar, and full history.
- **Stats** — leaderboard and head-to-head vs. two demo training partners
  (Sanne & Joost — seeded sample data standing in for real friends until
  Phase 5 social/auth is built).
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

## Attribution

Exercise photos, GIFs, and instructions are © Gym Visual, used under the
dataset's educational/non-commercial license. This app is for private use by
its owner and training partners only — not for public distribution or
monetization.
