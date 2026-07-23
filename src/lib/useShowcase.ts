import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { computeEarnedBadges, resolveShowcaseIds } from './badges';
import { labelsForFriends } from './friends';

// Resolves the <=3 showcase badge ids to show next to each person's name,
// keyed by the same `person` label that tags workout sessions ('You' plus each
// friend's display label). Your own picks come from settings (falling back to
// your 3 most recently unlocked); a friend's come from their shared picks
// (falling back to badges derived from their visible history) — so a friend
// who hasn't picked, and has no badges at all, contributes nothing (no empty
// placeholder next to their name).
export function useShowcaseByPerson(): Map<string, string[]> {
  const ownSessions = useStore((s) => s.sessions);
  const friendSessions = useStore((s) => s.friendSessions);
  const routines = useStore((s) => s.routines);
  const friends = useStore((s) => s.friends);
  const friendShowcase = useStore((s) => s.friendShowcase);
  const settings = useStore((s) => s.settings);

  return useMemo(() => {
    const now = Date.now();
    const map = new Map<string, string[]>();

    const ownEarned = computeEarnedBadges({
      sessions: ownSessions,
      person: 'You',
      routines,
      weekStart: settings.weekStart,
      now,
      social: {
        hasFriend: friends.length > 0,
        firstFriendAt: settings.firstFriendAt ?? null,
        firstComparisonAt: settings.firstComparisonAt ?? null,
      },
    });
    map.set('You', resolveShowcaseIds(ownEarned, settings.showcaseBadges));

    const labels = labelsForFriends(friends);
    friends.forEach((f) => {
      const label = labels.get(f.profile.id);
      if (!label) return;
      const earned = computeEarnedBadges({
        sessions: friendSessions,
        person: label,
        routines: null,
        weekStart: settings.weekStart,
        now,
      });
      map.set(label, resolveShowcaseIds(earned, friendShowcase.get(f.profile.id)));
    });

    return map;
  }, [ownSessions, friendSessions, routines, friends, friendShowcase, settings.weekStart, settings.showcaseBadges, settings.firstFriendAt, settings.firstComparisonAt]);
}
