import { useEffect, useState } from 'react';

export type CurrentUser = {
  id: number;
  fullname: string;
  businessname: string | null;
  email: string;
  product: string;
  role: 'SELLER' | 'BUYER';
  buyerTier: 'BASIC' | 'VERIFIED' | 'COMPANY' | null;
  emailVerified: boolean;
  sellerVerified: boolean;
  rating: number;
  reviewCount: number;
  photoUrl: string | null;
};

/** Client-side: fetches the signed-in user from /api/auth/me on mount. */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = () =>
      fetch('/api/auth/me', { cache: 'no-store' })
        .then((res) => {
          // Signed out (or the session expired) while this page was open or
          // restored from the browser's back/forward cache: leave right away.
          if (res.status === 401) {
            window.location.replace('/auth');
            return null;
          }
          return res.ok ? res.json() : null;
        })
        .then((data) => {
          if (!cancelled && data) setUser(data.user ?? null);
        })
        .catch(() => {
          if (!cancelled) setUser(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    check();
    // A page shown again from the back/forward cache never re-runs its
    // effects, so re-verify the session when it comes back.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };
    window.addEventListener('pageshow', onShow);
    return () => {
      cancelled = true;
      window.removeEventListener('pageshow', onShow);
    };
  }, []);

  return { user, loading };
}

export function getInitials(fullname: string): string {
  const parts = fullname.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
