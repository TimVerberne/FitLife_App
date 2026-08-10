import type { Routine, WorkoutSession, Person } from './types';
import type { WeekStart } from './settings';
import { epley, isLoggedSet, isWorkingSet, volumeOf, weeklyStreak } from './records';

// Achievements are derived entirely from things the user already does — no
// new logging. Every badge here is computed from workout history (plus, for a
// couple of one-offs, routine and friend/comparison signals). The only state
// persisted anywhere is which badges are already "known" (so a celebration
// fires exactly once) and which the user picked to showcase — see the store.

const DAY = 86_400_000;

// Display groups, in the order the collection lists them.
export type BadgeGroup =
  | 'Workouts'
  | 'Volume'
  | 'Streak'
  | 'PRs'
  | 'Consistency'
  | 'Variety'
  | 'Session Length'
  | 'Timing & Weekend'
  | 'Routines'
  | 'Set Types'
  | 'Social';

// Which SVG the badge draws (see BadgeIcon.tsx). Multiple groups can share one.
export type BadgeIconKey =
  | 'runner'
  | 'dumbbell'
  | 'flame'
  | 'trophy'
  | 'calendar'
  | 'shuffle'
  | 'clock'
  | 'checklist'
  | 'sunrise'
  | 'lightning'
  | 'people';

export type BadgeKind = 'ladder' | 'oneoff';

export interface BadgeDef {
  id: string;
  group: BadgeGroup;
  kind: BadgeKind;
  // Ladder badges of the same climbing metric share a ladderId (used for the
  // "current + next" progress readout). One-offs have no ladderId.
  ladderId?: string;
  name: string;
  desc: string; // one-liner for the celebration + collection subtitle
  threshold: number; // ladder threshold, or 1 for a one-off
  unit: string; // progress readout unit, e.g. 'workouts', 'kg', 'weeks'
  icon: BadgeIconKey;
  // Position within the visual tier ramp (0-based) and how many tiers exist —
  // drives the badge's colour + ornament, and marks the apex (max) tier.
  tierIndex: number;
  tierCount: number;
}

interface LadderSpec {
  ladderId: string;
  group: BadgeGroup;
  icon: BadgeIconKey;
  unit: string;
  desc: (name: string, threshold: number) => string;
  tiers: [string, number][]; // [name, threshold]
}

interface OneoffSpec {
  id: string;
  group: BadgeGroup;
  icon: BadgeIconKey;
  name: string;
  desc: string;
  // Where the one-off sits on the tier ramp for colouring (most read as a
  // gold/mid-tier crest).
  tierIndex: number;
}

const LADDERS: LadderSpec[] = [
  {
    ladderId: 'workouts',
    group: 'Workouts',
    icon: 'runner',
    unit: 'workouts',
    desc: (_n, t) => (t === 1 ? 'Logged your first workout.' : `${t.toLocaleString('en-US')} workouts logged.`),
    tiers: [
      ['First Step', 1],
      ['Getting Going', 10],
      ['Building Momentum', 25],
      ['Half Century', 50],
      ['Century', 100],
      ['Dedicated', 250],
      ['Lifer', 500],
      ['Thousand Club', 1000],
    ],
  },
  {
    ladderId: 'volume',
    group: 'Volume',
    icon: 'dumbbell',
    unit: 'kg',
    desc: (_n, t) => `${t.toLocaleString('en-US')} kg lifted all-time.`,
    tiers: [
      ['Warming Up', 10_000],
      ['Getting Serious', 50_000],
      ['Six Figures', 100_000],
      ['Heavy Hitter', 250_000],
      ['Half Million', 500_000],
      ['Million Club', 1_000_000],
      ['Iron Mountain', 2_500_000],
      ['Titan', 5_000_000],
    ],
  },
  {
    ladderId: 'streak',
    group: 'Streak',
    icon: 'flame',
    unit: 'weeks',
    desc: (_n, t) => `${t}-week training streak.`,
    tiers: [
      ['On A Roll', 2],
      ['One Month Strong', 4],
      ['Iron Habit', 10],
      ['Half a Year In', 25],
      ['Full Year', 52],
    ],
  },
  {
    ladderId: 'prs',
    group: 'PRs',
    icon: 'trophy',
    unit: 'PRs',
    desc: (_n, t) => (t === 1 ? 'Set your first personal record.' : `${t} personal records set.`),
    tiers: [
      ['Breakthrough', 1],
      ['Record Breaker', 5],
      ['On Fire', 10],
      ['Unstoppable', 25],
      ['PR Machine', 50],
      ['Legend', 100],
    ],
  },
  {
    ladderId: 'consistency',
    group: 'Consistency',
    icon: 'calendar',
    unit: 'in 30 days',
    desc: (_n, t) => `${t} workouts in 30 days.`,
    tiers: [
      ['Regular', 8],
      ['Three A Week', 12],
      ['Almost Daily', 16],
    ],
  },
  {
    ladderId: 'variety',
    group: 'Variety',
    icon: 'shuffle',
    unit: 'exercises',
    desc: (_n, t) => `${t} different exercises tried.`,
    tiers: [
      ['Exploring', 10],
      ['Well Rounded', 25],
      ['Full Toolkit', 50],
      ['Encyclopedic', 100],
    ],
  },
  {
    ladderId: 'sessionLength',
    group: 'Session Length',
    icon: 'clock',
    unit: 'min',
    desc: (_n, t) => `A ${t}-minute session.`,
    tiers: [
      ['Solid Session', 45],
      ['Full Hour', 60],
      ['Marathon', 90],
    ],
  },
  {
    ladderId: 'routinesCreated',
    group: 'Routines',
    icon: 'checklist',
    unit: 'routines',
    desc: (_n, t) => (t === 1 ? 'Created your first routine.' : `Created ${t} routines.`),
    tiers: [
      ['Planner', 1],
      ['Architect', 5],
    ],
  },
];

const ONEOFFS: OneoffSpec[] = [
  { id: 'routine-habit', group: 'Routines', icon: 'checklist', name: 'Creature of Habit', desc: 'Ran the same routine 10 times.', tierIndex: 3 },
  { id: 'early-bird', group: 'Timing & Weekend', icon: 'sunrise', name: 'Early Bird', desc: 'Started a workout before 7 AM.', tierIndex: 3 },
  { id: 'night-owl', group: 'Timing & Weekend', icon: 'clock', name: 'Night Owl', desc: 'Started a workout after 9 PM.', tierIndex: 3 },
  { id: 'weekend-warrior', group: 'Timing & Weekend', icon: 'calendar', name: 'Weekend Warrior', desc: 'Trained Saturday and Sunday.', tierIndex: 3 },
  { id: 'set-failure', group: 'Set Types', icon: 'lightning', name: 'Pushing Limits', desc: 'Logged your first set to failure.', tierIndex: 3 },
  { id: 'set-dropset', group: 'Set Types', icon: 'lightning', name: 'Dropping In', desc: 'Logged your first drop set.', tierIndex: 3 },
  { id: 'set-superset', group: 'Set Types', icon: 'lightning', name: 'Doubling Up', desc: 'Logged your first superset.', tierIndex: 3 },
  { id: 'social-friend', group: 'Social', icon: 'people', name: 'Not Training Alone', desc: 'Added your first training friend.', tierIndex: 3 },
  { id: 'social-rivalry', group: 'Social', icon: 'people', name: 'Rivalry', desc: 'Ran your first head-to-head comparison.', tierIndex: 3 },
  { id: 'social-hype', group: 'Social', icon: 'people', name: 'Hype Man', desc: 'Reacted to a friend\u2019s workout.', tierIndex: 3 },
  { id: 'social-cheered', group: 'Social', icon: 'people', name: 'Appreciated', desc: 'Someone reacted to one of your workouts.', tierIndex: 3 },
];

function buildDefs(): BadgeDef[] {
  const defs: BadgeDef[] = [];
  for (const l of LADDERS) {
    l.tiers.forEach(([name, threshold], i) => {
      defs.push({
        id: `${l.ladderId}-${threshold}`,
        group: l.group,
        kind: 'ladder',
        ladderId: l.ladderId,
        name,
        desc: l.desc(name, threshold),
        threshold,
        unit: l.unit,
        icon: l.icon,
        tierIndex: i,
        tierCount: l.tiers.length,
      });
    });
  }
  for (const o of ONEOFFS) {
    defs.push({
      id: o.id,
      group: o.group,
      kind: 'oneoff',
      name: o.name,
      desc: o.desc,
      threshold: 1,
      unit: '',
      icon: o.icon,
      tierIndex: o.tierIndex,
      tierCount: 1,
    });
  }
  return defs;
}

export const BADGE_DEFS: BadgeDef[] = buildDefs();

export const BADGE_BY_ID: Map<string, BadgeDef> = new Map(BADGE_DEFS.map((d) => [d.id, d]));

// Collection display order.
export const BADGE_GROUP_ORDER: BadgeGroup[] = [
  'Workouts',
  'Volume',
  'Streak',
  'PRs',
  'Consistency',
  'Variety',
  'Session Length',
  'Timing & Weekend',
  'Routines',
  'Set Types',
  'Social',
];

export const TOTAL_BADGE_COUNT = BADGE_DEFS.length;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts: number, weekStart: WeekStart): number {
  const d = new Date(startOfDay(ts));
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = weekStart === 'mon' ? (day + 6) % 7 : day;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export interface BadgeSocialSignals {
  hasFriend: boolean;
  firstFriendAt: number | null;
  firstComparisonAt: number | null;
  firstReactionGivenAt: number | null;
  firstReactionReceivedAt: number | null;
}

export interface BadgeContext {
  sessions: WorkoutSession[]; // all sessions (any person); filtered by person here
  person: Person;
  // Own routines (self); null for a friend, where "routines created" is
  // approximated from the distinct routineIds present in their sessions.
  routines: Routine[] | null;
  weekStart: WeekStart;
  now: number;
  // Present only when computing your own badges — a friend's friend list and
  // comparison history aren't visible, so their Social badges stay locked.
  social?: BadgeSocialSignals;
}

// Every earned badge id → the timestamp it was (or would have been) unlocked.
// Absence from the map means locked. Unlock timestamps are the real dates the
// underlying milestone was crossed, replayed from history — so a badge earned
// months ago reads with the correct date.
export function computeEarnedBadges(ctx: BadgeContext): Map<string, number> {
  const mine = ctx.sessions.filter((h) => h.person === ctx.person).sort((a, b) => a.startedAt - b.startedAt);
  const earned = new Map<string, number>();
  const mark = (id: string, ts: number) => {
    if (!earned.has(id)) earned.set(id, ts);
  };

  const tiersFor = (ladderId: string) => BADGE_DEFS.filter((d) => d.ladderId === ladderId);

  // Workouts — the Nth finished session unlocks threshold N.
  for (const tier of tiersFor('workouts')) {
    if (mine.length >= tier.threshold) mark(tier.id, mine[tier.threshold - 1].startedAt);
  }

  // Volume — cumulative lifetime volume crossing each threshold.
  {
    const tiers = tiersFor('volume');
    let cum = 0;
    for (const h of mine) {
      cum += volumeOf(h.entries);
      for (const tier of tiers) if (cum >= tier.threshold) mark(tier.id, h.startedAt);
    }
  }

  // Personal records — cumulative count of est-1RM PR events (same definition
  // as the Finish screen / crew 🏆), replayed oldest-first.
  {
    const tiers = tiersFor('prs');
    const best = new Map<string, number>();
    let prCount = 0;
    for (const h of mine) {
      h.entries.forEach((entry) => {
        const bestInSession = entry.sets
          .filter((s) => isWorkingSet(s) && s.weight > 0)
          .reduce((m, s) => Math.max(m, epley(s.weight, s.reps)), 0);
        if (bestInSession === 0) return;
        const prior = best.get(entry.exerciseId) ?? 0;
        if (bestInSession > prior) {
          prCount++;
          best.set(entry.exerciseId, bestInSession);
        }
      });
      for (const tier of tiers) if (prCount >= tier.threshold) mark(tier.id, h.startedAt);
    }
  }

  // Consistency — a rolling 30-day trailing window first reaching each count.
  // `mine` is sorted ascending, so the window is a sliding pair of indices
  // rather than a re-filter per session (which made this quadratic).
  {
    const tiers = tiersFor('consistency');
    let left = 0;
    for (let i = 0; i < mine.length; i++) {
      const windowStart = mine[i].startedAt - 30 * DAY;
      while (mine[left].startedAt <= windowStart) left++;
      const count = i - left + 1;
      for (const tier of tiers) if (count >= tier.threshold) mark(tier.id, mine[i].startedAt);
    }
  }

  // Variety — distinct exercises with at least one logged set.
  {
    const tiers = tiersFor('variety');
    const seen = new Set<string>();
    for (const h of mine) {
      h.entries.forEach((e) => {
        if (e.sets.some(isLoggedSet)) seen.add(e.exerciseId);
      });
      for (const tier of tiers) if (seen.size >= tier.threshold) mark(tier.id, h.startedAt);
    }
  }

  // Session length — the first session at or above each duration.
  for (const tier of tiersFor('sessionLength')) {
    const first = mine.find((h) => h.durationMin >= tier.threshold);
    if (first) mark(tier.id, first.startedAt);
  }

  // Streak — the first time a run of consecutive trained weeks reaches each
  // length. Same week boundary as weeklyStreak (respects weekStart).
  {
    const tiers = tiersFor('streak');
    const firstTsInWeek = new Map<number, number>();
    for (const h of mine) {
      const w = startOfWeek(h.startedAt, ctx.weekStart);
      if (!firstTsInWeek.has(w) || h.startedAt < firstTsInWeek.get(w)!) firstTsInWeek.set(w, h.startedAt);
    }
    const weeks = [...firstTsInWeek.keys()].sort((a, b) => a - b);
    let runLen = 0;
    let prev: number | null = null;
    for (const w of weeks) {
      runLen = prev !== null && Math.round((w - prev) / DAY) === 7 ? runLen + 1 : 1;
      for (const tier of tiers) if (runLen >= tier.threshold) mark(tier.id, firstTsInWeek.get(w)!);
      prev = w;
    }
  }

  // Routines created — Planner / Architect. Real routine createdAt when it's
  // your own account; first-appearance of each distinct routineId otherwise.
  {
    const tiers = tiersFor('routinesCreated');
    let createdDates: number[];
    if (ctx.routines) {
      createdDates = [...ctx.routines].map((r) => r.createdAt).sort((a, b) => a - b);
    } else {
      const firstSeen = new Map<string, number>();
      for (const h of mine) if (h.routineId && !firstSeen.has(h.routineId)) firstSeen.set(h.routineId, h.startedAt);
      createdDates = [...firstSeen.values()].sort((a, b) => a - b);
    }
    for (const tier of tiers) if (createdDates.length >= tier.threshold) mark(tier.id, createdDates[tier.threshold - 1]);
  }

  // Creature of Habit — ran a single routine 10 times.
  {
    const runsByRoutine = new Map<string, number[]>();
    for (const h of mine) {
      if (!h.routineId) continue;
      const list = runsByRoutine.get(h.routineId) ?? [];
      list.push(h.startedAt);
      runsByRoutine.set(h.routineId, list);
    }
    let earliestTenth: number | null = null;
    runsByRoutine.forEach((dates) => {
      if (dates.length >= 10) {
        const tenth = [...dates].sort((a, b) => a - b)[9];
        if (earliestTenth === null || tenth < earliestTenth) earliestTenth = tenth;
      }
    });
    if (earliestTenth !== null) mark('routine-habit', earliestTenth);
  }

  // Timing one-offs.
  for (const h of mine) {
    const hr = new Date(h.startedAt).getHours();
    if (hr < 7) mark('early-bird', h.startedAt);
    if (hr >= 21) mark('night-owl', h.startedAt);
  }

  // Weekend Warrior — a Saturday and Sunday of the same weekend both trained.
  {
    const weekends = new Map<string, { sat?: number; sun?: number }>();
    for (const h of mine) {
      const d = new Date(h.startedAt);
      const dow = d.getDay();
      if (dow === 6) {
        const key = dayKey(h.startedAt);
        const rec = weekends.get(key) ?? {};
        if (rec.sat === undefined || h.startedAt < rec.sat) rec.sat = h.startedAt;
        weekends.set(key, rec);
      } else if (dow === 0) {
        const sat = new Date(d);
        sat.setDate(d.getDate() - 1);
        const key = dayKey(sat.getTime());
        const rec = weekends.get(key) ?? {};
        if (rec.sun === undefined || h.startedAt < rec.sun) rec.sun = h.startedAt;
        weekends.set(key, rec);
      }
    }
    let earliest: number | null = null;
    weekends.forEach((rec) => {
      if (rec.sat !== undefined && rec.sun !== undefined) {
        const done = Math.max(rec.sat, rec.sun);
        if (earliest === null || done < earliest) earliest = done;
      }
    });
    if (earliest !== null) mark('weekend-warrior', earliest);
  }

  // Set-type one-offs — first failure set, drop set, superset.
  for (const h of mine) {
    h.entries.forEach((e) => {
      if (e.supersetWith) mark('set-superset', h.startedAt);
      e.sets.forEach((s) => {
        if (s.kind === 'failure') mark('set-failure', h.startedAt);
        if (s.kind === 'dropset') mark('set-dropset', h.startedAt);
      });
    });
  }

  // Social — self only (a friend's own friends/comparisons aren't visible).
  if (ctx.social) {
    if (ctx.social.hasFriend) mark('social-friend', ctx.social.firstFriendAt ?? ctx.now);
    if (ctx.social.firstComparisonAt != null) mark('social-rivalry', ctx.social.firstComparisonAt);
    if (ctx.social.firstReactionGivenAt != null) mark('social-hype', ctx.social.firstReactionGivenAt);
    if (ctx.social.firstReactionReceivedAt != null) mark('social-cheered', ctx.social.firstReactionReceivedAt);
  }

  return earned;
}

export interface BadgeMetrics {
  workouts: number;
  volume: number;
  prs: number;
  streakWeeks: number;
  consistency: number;
  variety: number;
  sessionMin: number;
  routinesCreated: number;
}

// Drives the "83 of 100" progress readouts.
//
// Most tracks are cumulative or personal-best by nature (workouts, volume,
// PRs, variety, longest session, routines), so best-ever is both correct and
// what the rest of the app shows. Streak and Consistency are not: they're
// explicitly about how you're training *now*, and the Home screen shows the
// *current* weekly streak. Reporting a best-ever streak here would have the
// badge sheet claim 10 weeks while Home says 2 — so those two report their
// live value and agree with Home by construction (streak reuses the very
// same weeklyStreak used there).
//
// Note this only affects the progress readout. Which badges are *earned* is
// decided by computeEarnedBadges replaying history, so a streak you once hit
// stays earned even after it lapses.
export function computeBadgeMetrics(ctx: BadgeContext): BadgeMetrics {
  const mine = ctx.sessions.filter((h) => h.person === ctx.person).sort((a, b) => a.startedAt - b.startedAt);

  let volume = 0;
  for (const h of mine) volume += volumeOf(h.entries);

  const best = new Map<string, number>();
  let prs = 0;
  const varietySeen = new Set<string>();
  let sessionMin = 0;
  for (const h of mine) {
    h.entries.forEach((entry) => {
      const bestInSession = entry.sets
        .filter((s) => isWorkingSet(s) && s.weight > 0)
        .reduce((m, s) => Math.max(m, epley(s.weight, s.reps)), 0);
      if (bestInSession > 0) {
        const prior = best.get(entry.exerciseId) ?? 0;
        if (bestInSession > prior) {
          prs++;
          best.set(entry.exerciseId, bestInSession);
        }
      }
      if (entry.sets.some(isLoggedSet)) varietySeen.add(entry.exerciseId);
    });
    if (h.durationMin > sessionMin) sessionMin = h.durationMin;
  }

  // How many workouts in the last 30 days — "lately", as the track is
  // described, not the best 30-day stretch you ever had.
  const consistency = mine.filter((h) => h.startedAt > ctx.now - 30 * DAY).length;

  // The *current* weekly streak, straight from the same helper the Home
  // screen uses, so the two can't drift apart.
  const streakWeeks = weeklyStreak(ctx.sessions, ctx.person, ctx.now, ctx.weekStart);

  const routinesCreated = ctx.routines
    ? ctx.routines.length
    : new Set(mine.filter((h) => h.routineId).map((h) => h.routineId)).size;

  return { workouts: mine.length, volume, prs, streakWeeks, consistency, variety: varietySeen.size, sessionMin, routinesCreated };
}

export function metricForLadder(ladderId: string, m: BadgeMetrics): number {
  switch (ladderId) {
    case 'workouts':
      return m.workouts;
    case 'volume':
      return m.volume;
    case 'streak':
      return m.streakWeeks;
    case 'prs':
      return m.prs;
    case 'consistency':
      return m.consistency;
    case 'variety':
      return m.variety;
    case 'sessionLength':
      return m.sessionMin;
    case 'routinesCreated':
      return m.routinesCreated;
    default:
      return 0;
  }
}

export interface LadderProgress {
  ladderId: string;
  current: BadgeDef | null; // highest earned tier
  next: BadgeDef | null; // next tier to work toward (null if maxed)
  value: number; // current metric value
  earnedCount: number;
  total: number;
}

// For a ladder, the highest earned tier and the next one, given the earned
// map. `value` is that ladder's current metric (see metricForLadder) — passed
// in rather than derived from a whole BadgeMetrics, so a caller can't hand
// over a placeholder object and silently get a zero back.
export function ladderProgress(ladderId: string, earned: Map<string, number>, value: number): LadderProgress {
  const tiers = BADGE_DEFS.filter((d) => d.ladderId === ladderId);
  let current: BadgeDef | null = null;
  let next: BadgeDef | null = null;
  let earnedCount = 0;
  for (const tier of tiers) {
    if (earned.has(tier.id)) {
      current = tier;
      earnedCount++;
    } else if (next === null) {
      next = tier;
    }
  }
  return { ladderId, current, next, value, earnedCount, total: tiers.length };
}

// The <=3 badge ids shown next to a name. The user's explicit picks win (kept
// only while still earned); otherwise the 3 most recently unlocked.
export function resolveShowcaseIds(earned: Map<string, number>, picks: string[] | undefined, n = 3): string[] {
  const valid = (picks ?? []).filter((id) => earned.has(id)).slice(0, n);
  if (valid.length > 0) return valid;
  return defaultShowcaseIds(earned, n);
}

export function defaultShowcaseIds(earned: Map<string, number>, n = 3): string[] {
  return [...earned.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}
