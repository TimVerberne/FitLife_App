import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { daysSinceLastWorkout, primaryMuscleGroup, recentWeeksTrained, recordsPerSession, volumeOf, weeklyStreak } from '../lib/records';
import { formatTrainingVolume, toDisplayWeight } from '../lib/units';
import { WorkoutFeedCard } from '../components/WorkoutFeedCard';

export function HomeScreen() {
  // The date/time header, and anything memoized off Date.now() below (the
  // weekly streak), otherwise only recompute when something else triggers a
  // re-render — so both silently go stale while this screen just sits open
  // (e.g. left open across a week-boundary rollover with no new session
  // logged). `nowTick` is read by those useMemo deps purely to force a
  // fresh recompute every 30s; its own value is never used directly.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const routines = useStore((s) => s.routines);
  const ownSessions = useStore((s) => s.sessions);
  const friendSessionsRaw = useStore((s) => s.friendSessions);
  const sessions = useMemo(() => [...ownSessions, ...friendSessionsRaw], [ownSessions, friendSessionsRaw]);
  const startSession = useStore((s) => s.startSession);
  const openWorkoutSheet = useStore((s) => s.openWorkoutSheet);
  const go = useStore((s) => s.go);
  const settings = useStore((s) => s.settings);

  const mySessions = useMemo(() => sessions.filter((s) => s.person === 'You'), [sessions]);
  const totalVolume = useMemo(
    () => toDisplayWeight(mySessions.reduce((a, h) => a + volumeOf(h.entries), 0), settings.units),
    [mySessions, settings.units],
  );
  const volumeParts = useMemo(() => formatTrainingVolume(totalVolume), [totalVolume]);
  // nowTick is a deliberate cache-buster (forces a fresh Date.now() read
  // every 30s), not an input the computation itself reads.
  const streak = useMemo(
    () => weeklyStreak(sessions, 'You', Date.now(), settings.weekStart),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, settings.weekStart, nowTick],
  );
  const STREAK_WEEKS = 6;
  const recentWeeks = useMemo(
    () => recentWeeksTrained(sessions, 'You', Date.now(), settings.weekStart, STREAK_WEEKS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, settings.weekStart, nowTick],
  );
  const currentWeekTrained = recentWeeks[recentWeeks.length - 1];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const daysSince = useMemo(() => daysSinceLastWorkout(sessions, 'You', Date.now()), [sessions, nowTick]);

  const nextRoutine = useMemo(() => {
    if (routines.length === 0) return null;
    const lastTrainedAt = new Map<string, number>();
    mySessions.forEach((h) => {
      if (!h.routineId) return;
      const prev = lastTrainedAt.get(h.routineId) ?? 0;
      if (h.startedAt > prev) lastTrainedAt.set(h.routineId, h.startedAt);
    });
    const byRecency = [...routines].sort((a, b) => (lastTrainedAt.get(a.id) ?? 0) - (lastTrainedAt.get(b.id) ?? 0));
    if (byRecency.length <= 1 || !settings.smartRoutineRotation) return byRecency[0] ?? null;
    // Prefer a routine that trains a different muscle group than your last workout,
    // so back-to-back sessions don't hammer the same muscles two days running.
    const lastSession = [...mySessions].sort((a, b) => b.startedAt - a.startedAt)[0];
    const lastGroup = lastSession ? primaryMuscleGroup(lastSession.entries.map((e) => e.exerciseId)) : null;
    const freshGroup = byRecency.find((r) => primaryMuscleGroup(r.exerciseIds) !== lastGroup);
    return freshGroup ?? byRecency[0];
  }, [routines, mySessions, settings.smartRoutineRotation]);

  const estMinutes = nextRoutine
    ? (() => {
        const matches = mySessions.filter((h) => h.routineId === nextRoutine.id);
        if (matches.length > 0) return Math.round(matches.reduce((a, h) => a + h.durationMin, 0) / matches.length);
        return nextRoutine.exerciseIds.length * 13;
      })()
    : 0;

  const CREW_PAGE_SIZE = 4;
  const crewAll = useMemo(() => [...sessions].sort((a, b) => b.startedAt - a.startedAt), [sessions]);
  const crewRecords = useMemo(() => recordsPerSession(sessions), [sessions]);
  const [crewVisibleCount, setCrewVisibleCount] = useState(CREW_PAGE_SIZE);
  const crew = useMemo(() => crewAll.slice(0, crewVisibleCount), [crewAll, crewVisibleCount]);
  const hasMoreCrew = crewVisibleCount < crewAll.length;

  // Loads more of the feed as you scroll near the bottom, instead of
  // hard-capping it at 4 — the sentinel sits right after the rendered list,
  // so it only enters view once you've nearly scrolled past what's shown.
  const crewSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMoreCrew) return;
    const sentinel = crewSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setCrewVisibleCount((n) => n + CREW_PAGE_SIZE);
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreCrew]);

  const quote = useStore((s) => s.quote);
  const quoteWords = quote.split(' ');
  const quoteLastWord = quoteWords[quoteWords.length - 1];
  const quoteLead = quoteWords.slice(0, -1).join(' ');

  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: '2-digit' }).toUpperCase();
  const timeLabel = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="screen">
      <div className="top">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--accent)', textTransform: 'uppercase' }}>
          {dateLabel} — {timeLabel}
        </div>
        <div className="h1" style={{ fontSize: 34, lineHeight: 1.02, marginTop: 8 }}>
          {quoteLead && <>{quoteLead} </>}
          <span style={{ color: 'var(--accent)' }}>{quoteLastWord}</span>
        </div>
      </div>

      {nextRoutine ? (
        <div style={{ marginTop: 4, background: 'var(--accent)', borderRadius: 16, padding: '16px 16px 14px', color: 'var(--accent-ink)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            Today's session
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, lineHeight: 0.95, textTransform: 'uppercase', marginTop: 3 }}>
            {nextRoutine.name}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}>
              {nextRoutine.exerciseIds.length} EX · {estMinutes} MIN
            </div>
            <button
              onClick={() => startSession(nextRoutine.id)}
              style={{
                background: 'var(--accent-ink)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 15,
                padding: '9px 18px',
                borderRadius: 9,
                textTransform: 'uppercase',
                letterSpacing: '.03em',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Start ▶
            </button>
          </div>
        </div>
      ) : (
        <button className="new-routine-card" style={{ marginTop: 4 }} onClick={() => go('train')}>
          + Build your first routine
        </button>
      )}

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat-tile">
          <div className="n">{String(mySessions.length).padStart(2, '0')}</div>
          <div className="l">Workouts</div>
        </div>
        <div className="stat-tile">
          <div className="n" style={{ color: 'var(--accent)' }}>
            {volumeParts.main}
            {volumeParts.suffix}
          </div>
          <div className="l">Volume ({settings.units})</div>
        </div>
        <div className="stat-tile">
          <div className="n">{String(streak).padStart(2, '0')}</div>
          <div className="l">Streak</div>
        </div>
      </div>

      {mySessions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10 }}>
          {recentWeeks.map((trained, i) => (
            <div
              key={i}
              title={i === recentWeeks.length - 1 ? 'This week' : `${recentWeeks.length - 1 - i} week${recentWeeks.length - 1 - i === 1 ? '' : 's'} ago`}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: trained ? 'var(--accent)' : 'transparent',
                border: trained ? 'none' : '1px solid var(--line-dash)',
              }}
            />
          ))}
          {streak > 0 && !currentWeekTrained && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--accent)',
                marginLeft: 4,
                textTransform: 'uppercase',
                letterSpacing: '.04em',
              }}
            >
              Train this week to keep it
            </span>
          )}
        </div>
      )}

      {mySessions.length === 0 ? (
        <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>
          Log your first workout to start tracking stats.
        </p>
      ) : (
        streak === 0 &&
        daysSince > 0 && (
          <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>
            Last workout {daysSince} day{daysSince === 1 ? '' : 's'} ago — jump back in!
          </p>
        )
      )}

      <div className="section-h" style={{ margin: '20px 2px 0' }}>
        The crew
      </div>
      {crew.length === 0 && <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>No activity from your crew yet.</p>}
      {crew.map((h) => (
        <WorkoutFeedCard key={h.id} session={h} records={crewRecords.get(h.id) ?? 0} onOpen={() => openWorkoutSheet(h.id)} />
      ))}
      {hasMoreCrew && <div ref={crewSentinelRef} style={{ height: 1 }} />}
    </div>
  );
}
