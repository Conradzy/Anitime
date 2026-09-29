'use client';

import { useEffect, useState } from 'react';
import { CROPS, PAYMENT_LABEL } from '@/lib/crops';
import { timeAgo, type FeedBuyRequest } from '@/lib/feed';
// Same drawer look as the product listing panel — its classes are reused as they are.
import styles from '@/app/seller-home/page.module.css';
import own from './ListingPanel.module.css';

const peso = (n: number, dec = 0) =>
  '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: dec, maximumFractionDigits: dec });

type Completed = {
  id: number;
  code: string;
  quantity: number;
  unit: string;
  agreedUnitPrice: number;
  totalAmount: number;
  completedAt: string | null;
  seller: { name: string; fullname: string; verified: boolean; rating: number; reviewCount: number } | null;
  review: { rating: number; comment: string | null } | null;
};

/** A buy request's side panel: the mirror of ListingPanel, opened from
 * "Buyers posted". Instead of a route (there is nothing to route to until a
 * seller responds), it shows who has already fulfilled part of the request
 * and the review they got for it. */
export function BuyRequestPanel({
  request,
  onClose,
  onRespond,
  responding,
  error,
}: {
  request: FeedBuyRequest;
  onClose: () => void;
  onRespond: (id: number) => void;
  responding: boolean;
  error: string;
}) {
  const [completed, setCompleted] = useState<Completed[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/buy-requests/${request.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setCompleted(d.completed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [request.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cropImg = CROPS.find((c) => c.name === request.crop)?.img ?? '/images/crops/banana.png';
  const title = `${request.crop} — ${request.variety}`;
  // The "Buyers posted" feed never returns the viewer's own requests, so
  // whoever opens this panel is always looking at someone else's.
  const budgetTotal = request.targetPrice ? request.remainingQuantity * request.targetPrice : null;
  const filled = request.quantity - request.remainingQuantity;

  return (
    <div className={styles.drawerVeil} onClick={onClose}>
      <div className={styles.drawerPanel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.drawerHeader}>
          <button type="button" onClick={onClose} aria-label="Close" className={styles.drawerCloseBtn}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#4B5C53" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.5 5L6.5 10l5 5" />
            </svg>
          </button>
          <span className={styles.drawerKicker}>Buying request</span>
          <a href="#" className={styles.reportPostLink} onClick={(e) => e.preventDefault()}>
            Report post
          </a>
        </header>

        <div className={styles.drawerContent}>
          <div className={styles.drawerTopRow}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={request.photos[0] ?? cropImg} alt={`${request.crop} photo`} className={own.photo} />
            <div className={styles.drawerTitleWrap}>
              <h2 className={styles.drawerTitle}>{title}</h2>
              <div className={styles.buyerRow}>
                <span className={styles.buyerName}>{request.buyer?.name ?? 'A buyer'}</span>
                {request.buyer?.verified ? (
                  <span className={styles.verifiedBuyerBadge}>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#2F6B45" strokeWidth="1.8">
                      <circle cx="10" cy="10" r="7.2" />
                      <path d="M6.8 10.2l2.2 2.2 4.2-4.4" />
                    </svg>
                    Verified buyer
                  </span>
                ) : (
                  <span className={own.unverifiedBadge}>Unverified</span>
                )}
              </div>
              <div className={styles.shopMetaLine}>
                {request.location} · Posted {timeAgo(request.createdAt)}
                {request.neededBy && ` · Needed by ${new Date(request.neededBy).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </div>
              <div className={styles.drawerStarsWrap}>
                {request.buyer && request.buyer.reviewCount > 0 ? (
                  <span className={styles.drawerRatingText}>
                    <span className={styles.starsOnColor}>{'★★★★★'.slice(0, Math.round(request.buyer.rating))}</span>
                    <span className={styles.starsOffColor}>{'★★★★★'.slice(Math.round(request.buyer.rating))}</span>{' '}
                    {request.buyer.rating.toFixed(1)} of {request.buyer.reviewCount} review{request.buyer.reviewCount === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className={styles.drawerRatingText}>No reviews yet</span>
                )}
              </div>
            </div>
          </div>

          <div className={styles.dealStatsGrid}>
            <div className={styles.dealStatCard}>
              <div className={styles.dealStatLabel}>Still wanted</div>
              <div className={styles.dealStatValue}>
                {request.remainingQuantity.toLocaleString('en-PH')} {request.unit}
              </div>
            </div>
            <div className={styles.dealStatCard}>
              <div className={styles.dealStatLabel}>{request.targetPrice ? `Budget / ${request.unit}` : 'Budget'}</div>
              <div className={styles.dealStatValue}>
                {request.targetPrice ? `${peso(request.targetPrice, request.targetPrice % 1 ? 2 : 0)} / ${request.unit}` : 'Open to quotes'}
              </div>
            </div>
            <div className={styles.dealStatCardDark}>
              <div className={styles.dealStatLabelDark}>Estimated budget</div>
              <div className={styles.dealStatValueGreen}>{budgetTotal !== null ? peso(budgetTotal) : '—'}</div>
            </div>
          </div>

          {request.description && <p className={styles.dealNote}>{request.description}</p>}
          <p className={own.payLine}>
            <strong>{request.priceType === 'FIXED' ? 'Fixed budget' : 'Open to quotes'}</strong>
            {request.paymentMethods.length > 0 && (
              <> · Pays via {request.paymentMethods.map((m) => PAYMENT_LABEL[m] ?? m).join(', ')}</>
            )}
          </p>

          {filled > 0 && (
            <p className={own.payLine}>
              <strong>{filled.toLocaleString('en-PH')}</strong> of {request.quantity.toLocaleString('en-PH')} {request.unit} already fulfilled —
              the rest is still open to offers.
            </p>
          )}

          <div className={styles.reviewsBlock}>
            <div className={styles.subHeadRow}>
              <h3 className={styles.subHeadTitle}>Recently completed</h3>
            </div>
            {completed === null && <div className={own.noReviews}>Loading…</div>}
            {completed !== null && completed.length === 0 && (
              <div className={own.noReviews}>No completed transactions yet. Be the first to fulfill part of this request.</div>
            )}
            {completed !== null && completed.length > 0 && (
              <div className={styles.postsList}>
                {completed.map((c) => (
                  <div key={c.id} className={styles.feedItem}>
                    <div className={own.noReviews} style={{ padding: '10px 0' }}>
                      <strong>{c.seller?.name ?? 'A seller'}</strong>
                      {c.seller?.verified && ' ✓'} fulfilled <strong>{c.quantity.toLocaleString('en-PH')} {c.unit}</strong> at{' '}
                      {peso(c.agreedUnitPrice, c.agreedUnitPrice % 1 ? 2 : 0)}/{c.unit}
                      {c.completedAt && ` · ${timeAgo(c.completedAt)}`}
                      {c.review && (
                        <div>
                          <span className={styles.starsOnColor}>{'★★★★★'.slice(0, c.review.rating)}</span>
                          <span className={styles.starsOffColor}>{'★★★★★'.slice(c.review.rating)}</span>
                          {c.review.comment && <span> “{c.review.comment}”</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className={styles.drawerFooter}>
          <div className={styles.footerAmountWrap}>
            <div className={styles.footerAmountLabel}>Still needed</div>
            <div className={styles.footerAmountValue}>
              {request.remainingQuantity.toLocaleString('en-PH')} {request.unit}
            </div>
            {error && <div className={own.routeNoteWarn}>{error}</div>}
          </div>
          <button
            type="button"
            className={`${styles.negotiateBtn} ${own.negotiateBtnBtn}`}
            disabled={responding}
            onClick={() => onRespond(request.id)}
          >
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="#062F24" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.4 5.2h13.2v8.4H8.6L5 16.6v-3H3.4z" />
            </svg>
            {responding ? 'Opening…' : 'Respond with an offer'}
          </button>
        </footer>
      </div>
    </div>
  );
}
