'use client';

import { useCallback, useEffect, useState } from 'react';

export type BadgeCounts = { notifications: number; messages: number };

/** Unread counts for the sidebar. Polled, and refreshable on demand so opening
 * the bell menu or a chat updates the badge straight away. */
export function useBadges(intervalMs = 25000) {
  const [counts, setCounts] = useState<BadgeCounts>({ notifications: 0, messages: 0 });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?countsOnly=1', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { counts?: BadgeCounts };
      if (data.counts) setCounts(data.counts);
    } catch {
      // offline for a moment: keep the last counts
    }
  }, []);

  useEffect(() => {
    // queued rather than called straight away, so the first paint isn't blocked
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, intervalMs);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, intervalMs]);

  return { counts, refresh, setCounts };
}
