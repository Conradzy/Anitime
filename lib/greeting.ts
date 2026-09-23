/**
 * AniTime is a Philippine farm marketplace, so the dashboard greeting always
 * follows Philippine time (Asia/Manila, UTC+8) regardless of the viewer's
 * own device timezone.
 */
export function getManilaHour(date: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Manila' }).format(date)
  );
}

/** 12am-11:59am -> morning, 12pm-5:59pm -> afternoon, 6pm-11:59pm -> evening. */
export function getManilaGreeting(date: Date = new Date()): 'Good morning' | 'Good afternoon' | 'Good evening' {
  const hour = getManilaHour(date);
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
