'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import styles from './NotificationsPanel.module.css';

export type NotificationRow = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const ICON: Record<string, string> = {
  OFFER: '₱', DEAL: '✓', DELIVERY: '🚚', PAYMENT: '₱', REVIEW: '★', VERIFICATION: '🛡', SYSTEM: '💬',
};

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** The bell menu. Opening it marks everything read, which is what the badge counts. */
export function NotificationsPanel({ onClose, onRead }: { onClose: () => void; onRead: () => void }) {
  const [rows, setRows] = useState<NotificationRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/notifications', { cache: 'no-store' });
        const data = await res.json();
        if (!alive) return;
        setRows(data.notifications ?? []);
        if ((data.counts?.notifications ?? 0) > 0) {
          await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          onRead();
        }
      } catch {
        if (alive) setRows([]);
      }
    })();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, onRead]);

  // Rendered on <body>: the sidebar it lives in is a sticky, stacked element,
  // so a panel left inside it would slide under the page's own cards.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.veil} onClick={onClose}>
      <aside className={styles.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Notifications">
        <header className={styles.head}>
          <h2 className={styles.title}>Notifications</h2>
          <button type="button" className={styles.x} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10" />
              <path d="M15 5L5 15" />
            </svg>
          </button>
        </header>

        {rows === null && <div className={styles.empty}>Loading…</div>}
        {rows?.length === 0 && (
          <div className={styles.empty}>
            Nothing yet. Offers, delivery updates and reviews will show up here.
          </div>
        )}

        <ul className={styles.list}>
          {rows?.map((n) => {
            const inner = (
              <>
                <span className={`${styles.icon} ${n.read ? '' : styles.iconNew}`}>{ICON[n.type] ?? '•'}</span>
                <span className={styles.text}>
                  <span className={styles.rowTitle}>{n.title}</span>
                  {n.body && <span className={styles.rowBody}>{n.body}</span>}
                  <span className={styles.when}>{ago(n.createdAt)}</span>
                </span>
              </>
            );
            return (
              <li key={n.id} className={n.read ? styles.row : `${styles.row} ${styles.rowNew}`}>
                {n.link ? (
                  <Link href={n.link} className={styles.rowLink} onClick={onClose}>
                    {inner}
                  </Link>
                ) : (
                  <span className={styles.rowLink}>{inner}</span>
                )}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>,
    document.body
  );
}
