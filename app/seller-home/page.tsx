'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AppSidebar } from '@/components/AppSidebar';
import { CROPS, PAYMENT_LABEL } from '@/lib/crops';
import { timeAgo, type FeedListing } from '@/lib/feed';
import type { LatLng } from '@/lib/routing';
import { openPostProduce, LISTING_POSTED_EVENT } from '@/lib/post-produce';
import Link from 'next/link';
import { useCurrentUser, getInitials } from '@/lib/use-current-user';
import styles from './page.module.css';

// The side panel pulls in map code, so it loads only when a product is opened.
const ListingPanel = dynamic(() => import('@/components/ListingPanel').then((m) => m.ListingPanel), { ssr: false });

/* ---------------------------------------------------------------- data ---- */

type Guide = { tag: string; step: string; img: string; title: string; body: string };
const GUIDES: Guide[] = [
  {
    tag: 'Getting started',
    step: 'Guide 1 of 5',
    img: '/images/guides/get-started.png',
    title: 'How AniTime works, end to end',
    body: 'Listings, buyer requests, negotiation and delivery all live in one place. Take the two-minute tour before your first post.',
  },
  {
    tag: 'Selling',
    step: 'Guide 2 of 5',
    img: '/images/guides/sell.png',
    title: 'Post produce buyers can actually price',
    body: 'Volume, grade, harvest window and clear photos. Listings with all four get inquiries roughly twice as often.',
  },
  {
    tag: 'Buying',
    step: 'Guide 3 of 5',
    img: '/images/guides/buy.png',
    title: 'Post a buying request for produce',
    body: 'Set the kilos you need, your price per kg and a pickup window so sellers can quote without guessing.',
  },
  {
    tag: 'Negotiating',
    step: 'Guide 4 of 5',
    img: '/images/guides/negotiate.png',
    title: 'Chat, agree terms, then leave a review',
    body: 'Keep hauling and payment terms in the thread — reviews after delivery are what build a trusted profile.',
  },
  {
    tag: 'Verification',
    step: 'Guide 5 of 5',
    img: '/images/guides/verified.png',
    title: 'Set up your profile and earn the badge',
    body: 'Farm details, a valid ID and a payout method take your profile to 100% and unlock the Verified Seller badge.',
  },
];

type FeedResponse = { listings: FeedListing[]; page: number; pageSize: number; total: number; totalPages: number; interests: string[] };

const SORT_SET = [
  { key: 'recent', label: 'Most recent' },
  { key: 'value', label: 'Highest value' },
];
const CROP_SET = ['Coconut', 'Pineapple', 'Corn', 'Banana', 'Mango'];
// Mirrors the steps of the verification wizard at /account/verification.
const CHECK_LABELS = [
  'Mobile number verified',
  'Personal information',
  'Residential address',
  'National ID verified',
  'Identity verification complete',
];

function peso(n: number, dec = 0) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/* ------------------------------------------------------------- component --- */

export default function SellerHomePage() {
  const { user } = useCurrentUser();
  const [mini, setMini] = useState(false);
  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState<'requests' | 'listings'>('requests');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'value'>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [crops, setCrops] = useState<string[]>([]);
  // Real verification progress, read from the server (see /api/verification/status).
  const [done, setDone] = useState([false, false, false, false, false]);
  const [weekStats, setWeekStats] = useState({ activeListings: 0, buyerInquiries: 0 });

  // ---- "Products posted" feed: real listings, 10 per page ------------------
  const router = useRouter();
  const [debouncedQ, setDebouncedQ] = useState('');
  const [pageState, setPageState] = useState({ filterKey: '', page: 1 });
  const [reloadTick, setReloadTick] = useState(0);
  const [feed, setFeed] = useState<{ key: string; data: FeedResponse | null; error: string } | null>(null);
  const [openListing, setOpenListing] = useState<FeedListing | null>(null);
  // Remembered so opening a second product doesn't ask for the location again.
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const rememberPos = useCallback((p: LatLng) => setUserPos(p), []);
  const [chatBusy, setChatBusy] = useState<number | null>(null);
  const [chatError, setChatError] = useState('');

  const cropsKey = crops.join(',');
  const filterKey = `${debouncedQ}|${cropsKey}|${sort}`;
  // Changing search, crops or sort starts back at page 1 without an effect.
  const feedPageNo = pageState.filterKey === filterKey ? pageState.page : 1;
  const feedKey = `${filterKey}|${feedPageNo}|${reloadTick}`;
  const feedLoading = tab === 'listings' && feed?.key !== feedKey;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Verification progress for the checklist in the right-hand rail.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/verification/status', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => {
          if (cancelled || !v) return;
          setDone([v.done.account, v.done.personal, v.done.address, v.done.document, v.identityVerified]);
        })
        .catch(() => {});
    const first = setTimeout(load, 0);
    // Coming back from the wizard should show the new state, not a stale one.
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      clearTimeout(first);
      window.removeEventListener('focus', load);
    };
  }, []);

  // "This week" card in the sidebar: this user's own numbers, not sample data.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/seller-home/week-stats', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => {
          if (cancelled || !v) return;
          setWeekStats({ activeListings: v.activeListings, buyerInquiries: v.buyerInquiries });
        })
        .catch(() => {});
    const first = setTimeout(load, 0);
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      clearTimeout(first);
      window.removeEventListener('focus', load);
    };
  }, []);

  // A newly published product should appear here straight away.
  useEffect(() => {
    const onPosted = () => {
      setTab('listings');
      setPageState({ filterKey: '', page: 1 });
      setReloadTick((n) => n + 1);
    };
    window.addEventListener(LISTING_POSTED_EVENT, onPosted);
    return () => window.removeEventListener(LISTING_POSTED_EVENT, onPosted);
  }, []);

  useEffect(() => {
    if (tab !== 'listings') return;
    let cancelled = false;
    const qs = new URLSearchParams({ scope: 'feed', page: String(feedPageNo), q: debouncedQ, crops: cropsKey, sort });
    fetch('/api/listings?' + qs.toString())
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!cancelled) setFeed({ key: feedKey, data: ok ? data : null, error: ok ? '' : (data.error ?? 'Could not load products.') });
      })
      .catch(() => {
        if (!cancelled) setFeed({ key: feedKey, data: null, error: 'Could not reach the server.' });
      });
    return () => {
      cancelled = true;
    };
  }, [tab, feedKey, feedPageNo, debouncedQ, cropsKey, sort]);

  async function chatWithSeller(listingId: number) {
    setChatBusy(listingId);
    setChatError('');
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not start the chat.');
      router.push('/messages?c=' + data.id);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Could not start the chat.');
      setChatBusy(null);
    }
  }

  useEffect(() => {
    const tick = setInterval(() => setSlide((s) => (s + 1) % GUIDES.length), 5000);
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (sortOpen && !t.closest?.('[data-sort-field]')) setSortOpen(false);
      if (filterOpen && !t.closest?.('[data-filter-field]')) setFilterOpen(false);
    };
    document.addEventListener('click', away);
    return () => {
      clearInterval(tick);
      document.removeEventListener('click', away);
    };
  }, [sortOpen, filterOpen]);

  const g = GUIDES[slide];
  const activeFilters = crops.length;
  const doneCount = done.filter(Boolean).length;
  const profilePct = doneCount * 20 + '%';

  const sortLabel = SORT_SET.filter((o) => o.key === sort)[0].label;
  const feedCount =
    tab === 'requests'
      ? 'No buyer requests yet'
      : !feed?.data
        ? feed?.error || 'Loading products…'
        : feed.data.total + ' products · ' + (feed.data.interests.length ? feed.data.interests.join(', ').toLowerCase() + ' first, then newest' : 'newest first');

  return (
    <div data-shell="" className={styles.shell} style={{ '--cols': mini ? '76px' : '246px' } as CSSProperties}>
      <AppSidebar active="home" mini={mini} onToggle={() => setMini((m) => !m)} />

      <div data-cols="" className={styles.colsGrid}>
        <main className={styles.mainCol}>
          {/* guide carousel */}
          <section className={styles.guideSection}>
            <div aria-hidden="true" className={styles.guideGradient} />
            <div className={styles.guideRow}>
              <div className={styles.guideText}>
                <div className={styles.guideStepRow}>
                  <span className={styles.guideDash} />
                  <span className={styles.guideStepLabel}>
                    {g.step}
                  </span>
                </div>
                <h2 className={styles.guideTitle}>
                  {g.title}
                </h2>
                <p className={styles.guideBody}>
                  {g.body}
                </p>
                <div className={styles.guideActionsRow}>
                  <a href="#" className={styles.learnMoreBtn}>
                    Learn more <span>→</span>
                  </a>
                  <div className={styles.guideDotsWrap}>
                    {GUIDES.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label="Guide"
                        onClick={() => setSlide(i)}
                        className={styles.guideDot}
                        style={{ '--dot-w': i === slide ? '26px' : '9px', '--dot-bg': i === slide ? '#A7C641' : 'rgba(246,245,239,.3)' } as CSSProperties}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.guideImgWrap}>
                <span aria-hidden="true" className={styles.guideImgGlow} />
                <Image
                  key={g.img}
                  src={g.img}
                  alt={g.title}
                  width={268}
                  height={172}
                  unoptimized
                  className={styles.guideImg}
                />
              </div>
            </div>
          </section>

          {/* search + post produce */}
          <div className={styles.searchRow}>
            <span className={styles.searchWrap}>
              <span aria-hidden="true" className={styles.searchIcon}>
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="#6A7A71" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="9" cy="9" r="5.6" />
                  <path d="M13.2 13.2 17 17" />
                </svg>
              </span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search buy and sell posts — crop, buyer, place"
                className={`auth-field ${styles.searchInput}`}
              />
            </span>
            <button type="button" onClick={openPostProduce} className={styles.postProduceBtn}>
              Post produce <span>+</span>
            </button>
          </div>

          {/* tabs + sort + saved + filter */}
          <div className={styles.tabsRow}>
            <div className={styles.tabPillWrap}>
              <button
                type="button"
                onClick={() => setTab('requests')}
                className={styles.tabBtn}
                style={{ '--tab-bg': tab === 'requests' ? '#062F24' : 'transparent', '--tab-fg': tab === 'requests' ? '#F6F5EF' : '#4B5C53' } as CSSProperties}
              >
                Buyers posted
              </button>
              <button
                type="button"
                onClick={() => setTab('listings')}
                className={styles.tabBtn}
                style={{ '--tab-bg': tab === 'listings' ? '#062F24' : 'transparent', '--tab-fg': tab === 'listings' ? '#F6F5EF' : '#4B5C53' } as CSSProperties}
              >
                Products posted
              </button>
            </div>

            <div data-sort-field="" className={styles.sortFieldWrap}>
              <button
                type="button"
                onClick={() => {
                  setSortOpen((o) => !o);
                  setFilterOpen(false);
                }}
                className={styles.sortTriggerBtn}
              >
                {sortLabel}
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#4B5C53" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5.5 8 10 12.5 14.5 8" />
                </svg>
              </button>
              {sortOpen && (
                <div className={styles.sortDropdown}>
                  {SORT_SET.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => {
                        setSort(o.key as 'recent' | 'value');
                        setSortOpen(false);
                      }}
                      className={styles.sortOption}
                      style={{ '--so-bg': o.key === sort ? '#F1F5E4' : 'transparent', '--so-fw': o.key === sort ? '600' : '400' } as CSSProperties}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div data-filter-field="" className={styles.filterFieldWrap}>
              <button
                type="button"
                onClick={() => {
                  setFilterOpen((o) => !o);
                  setSortOpen(false);
                }}
                className={styles.filterTriggerBtn}
                style={{ '--fb-border': activeFilters ? '#A7C641' : 'rgba(6,47,36,.12)', '--fb-bg': activeFilters ? '#F1F5E4' : '#FFFFFF' } as CSSProperties}
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#062F24" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M3 6h14" />
                  <path d="M6 10h8" />
                  <path d="M8.5 14h3" />
                </svg>
                Filters{activeFilters ? ' · ' + activeFilters : ''}
              </button>
              {filterOpen && (
                <div className={styles.filterDropdown}>
                  <div className={styles.filterSectionLabel}>Produce</div>
                  <div className={styles.cropChipsRow}>
                    {CROP_SET.map((cr) => {
                      const on = crops.indexOf(cr) > -1;
                      return (
                        <button
                          key={cr}
                          type="button"
                          onClick={() => setCrops((s) => (s.indexOf(cr) > -1 ? s.filter((x) => x !== cr) : s.concat([cr])))}
                          className={styles.cropChipBtn}
                          style={{ '--cc-border': on ? '#A7C641' : 'rgba(6,47,36,.16)', '--cc-bg': on ? '#F1F5E4' : '#FFFFFF' } as CSSProperties}
                        >
                          {cr}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCrops([]);
                      setQ('');
                      setFilterOpen(false);
                    }}
                    className={styles.clearFiltersBtn}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className={styles.feedCountText}>{feedCount}</div>

          {tab === 'requests' && (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateTitle}>No buyer requests yet</div>
              <p className={styles.emptyStateText}>
                When buyers post what they want to buy, their requests will show up here. Meanwhile, browse the
                products other sellers have posted under “Products posted”.
              </p>
            </div>
          )}

          {tab === 'listings' && (
            <>
              {feed?.error && !feed.data && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateTitle}>Could not load products</div>
                  <p className={styles.emptyStateText}>{feed.error}</p>
                </div>
              )}
              {!feed && <div className={styles.emptyState}><div className={styles.emptyStateTitle}>Loading products…</div></div>}
              {chatError && <div className={styles.chatError}>{chatError}</div>}

              {feed?.data && feed.data.listings.length === 0 && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateTitle}>No products match yet</div>
                  <p className={styles.emptyStateText}>
                    Nothing has been posted for these filters. Use “Post produce +” to add the first one.
                  </p>
                </div>
              )}

              <div className={`${styles.postsList} ${feedLoading ? styles.feedLoading : ''}`}>
                {feed?.data?.listings.map((l, idx, arr) => {
                  const prev = arr[idx - 1];
                  const interests = feed.data!.interests;
                  const stock = CROPS.find((c) => c.name === l.crop)?.img ?? '/images/crops/banana.png';
                  const headMatch = l.matchesInterest && (idx === 0 || !prev.matchesInterest);
                  const headOther = interests.length > 0 && !l.matchesInterest && (idx === 0 || prev.matchesInterest);
                  return (
                    <div key={l.id} className={styles.feedItem}>
                      {headMatch && (
                        <div className={styles.feedHeading}>
                          <span className={styles.feedHeadingDot} /> Matches your produce · {interests.join(', ')}
                        </div>
                      )}
                      {headOther && <div className={styles.feedHeadingMuted}>More from the marketplace</div>}
                      <article
                        className={`${styles.listingCard} ${styles.listingClickable} ${l.matchesInterest ? styles.listingHighlight : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`View ${l.crop} — ${l.variety}`}
                        onClick={() => {
                          setChatError('');
                          setOpenListing(l);
                        }}
                        onKeyDown={(e) => {
                          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            setChatError('');
                            setOpenListing(l);
                          }
                        }}
                      >
                        {l.photos[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.photos[0]} alt={`${l.crop} photo`} className={styles.listingPhotoImg} />
                        ) : (
                          <Image src={stock} alt={l.crop} width={74} height={74} className={styles.listingPhotoImg} />
                        )}
                        <div className={styles.listingInfo}>
                          <h3 className={styles.listingName}>
                            {l.crop} — {l.variety}
                            {l.matchesInterest && <span className={styles.matchTag}>Matches your produce</span>}
                          </h3>
                          <div className={styles.listingStock}>
                            {l.availableQuantity.toLocaleString('en-PH')} {l.unit} available · {peso(l.unitPrice)} / {l.unit}
                            {l.priceType === 'FIXED' ? ' · Fixed price' : ' · Negotiable'}
                          </div>
                          <div className={styles.listingMeta}>
                            Posted {timeAgo(l.createdAt)} · {l.location}
                            {l.paymentMethods.length > 0 && ' · Pays via ' + l.paymentMethods.map((m) => PAYMENT_LABEL[m] ?? m).join(', ')}
                          </div>
                          <div className={styles.listingSeller}>
                            {l.mine ? 'You' : l.seller?.name}
                            <span className={l.seller?.verified ? styles.tagVerified : styles.tagUnverified}>
                              {l.seller?.verified ? '✓ Verified' : 'Unverified'}
                            </span>
                            <span className={styles.listingStars}>
                              {l.seller?.reviewCount ? (
                                <>
                                  <span className={styles.starsOn}>★</span> {l.seller.rating.toFixed(1)} ({l.seller.reviewCount})
                                </>
                              ) : (
                                'No reviews yet'
                              )}
                            </span>
                          </div>
                        </div>
                        {l.mine ? (
                          <span className={styles.listingStatusBadge} style={{ '--ls-fg': '#062F24', '--ls-bg': '#E4EDC8' } as CSSProperties}>
                            Your listing
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={styles.chatBtn}
                            disabled={chatBusy === l.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              chatWithSeller(l.id);
                            }}
                          >
                            {chatBusy === l.id ? 'Opening…' : 'Chat with seller'}
                          </button>
                        )}
                      </article>
                    </div>
                  );
                })}
              </div>

              {feed?.data && feed.data.total > 0 && (
                <nav className={styles.pager} aria-label="Products pages">
                  <span className={styles.pagerInfo}>
                    Showing {(feed.data.page - 1) * feed.data.pageSize + 1}–{(feed.data.page - 1) * feed.data.pageSize + feed.data.listings.length} of {feed.data.total}
                  </span>
                  <button
                    type="button"
                    className={styles.pagerBtn}
                    disabled={feed.data.page <= 1 || feedLoading}
                    onClick={() => setPageState({ filterKey, page: feed.data!.page - 1 })}
                  >
                    ← Previous
                  </button>
                  <span className={styles.pagerPage}>
                    Page {feed.data.page} of {feed.data.totalPages}
                  </span>
                  <button
                    type="button"
                    className={styles.pagerBtn}
                    disabled={feed.data.page >= feed.data.totalPages || feedLoading}
                    onClick={() => setPageState({ filterKey, page: feed.data!.page + 1 })}
                  >
                    Next →
                  </button>
                </nav>
              )}
            </>
          )}
        </main>

        <aside data-rail="" className={styles.sidebarRail}>
          <section className={styles.sideCard}>
            <div className={styles.profileHeadRow}>
              <span className={styles.profileAvatar} style={{ overflow: 'hidden' }}>
                {user?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : user ? (
                  getInitials(user.fullname)
                ) : (
                  ''
                )}
              </span>
              <div className={styles.profileNameWrap}>
                <div className={styles.profileName}>{user?.fullname || 'Seller'}</div>
                <div className={styles.profileSub}>
                  {user ? `${user.product.split(',').map((p) => p.trim()).join(' · ')} grower` : ''}
                </div>
              </div>
            </div>

            <div className={styles.verifyBlock}>
              <div className={styles.verifyHeadRow}>
                <span className={styles.verifyLabel}>Profile verification</span>
                <span className={styles.verifyPct}>{profilePct}</span>
              </div>
              <div className={styles.verifyTrack}>
                <span className={styles.verifyFill} style={{ '--fill-w': profilePct } as CSSProperties} />
              </div>
              <p className={styles.verifyHint}>
                Reach 100% to earn the Verified Seller badge — verified sellers appear first in buyer searches.
              </p>

              <div className={styles.checklistWrap}>
                {CHECK_LABELS.map((label, i) => {
                  const on = done[i];
                  return (
                    <span key={i} className={styles.checklistItem}>
                      <span
                        className={styles.checklistCircle}
                        style={{ '--cc2-border': on ? '#A7C641' : 'rgba(6,47,36,.25)', '--cc2-bg': on ? '#A7C641' : '#FFFFFF' } as CSSProperties}
                      >
                        {on && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#062F24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12.6l4.6 4.6L19 6.8" />
                          </svg>
                        )}
                      </span>
                      <span className={styles.checklistLabel} style={{ '--cl-color': on ? '#062F24' : '#6A7A71' } as CSSProperties}>{label}</span>
                    </span>
                  );
                })}
              </div>

              <Link href="/account/verification" className={styles.completeVerifyBtn}>
                {done[4] ? 'View verification' : 'Complete verification'} <span>→</span>
              </Link>
            </div>
          </section>

          <section className={styles.sideCard}>
            <div className={styles.verifyLabel}>This week</div>
            <div className={styles.weekStatsGrid}>
              <div>
                <div className={styles.weekStatValue}>{weekStats.activeListings}</div>
                <div className={styles.weekStatLabel}>Active listings</div>
              </div>
              <div>
                <div className={styles.weekStatValue}>{weekStats.buyerInquiries}</div>
                <div className={styles.weekStatLabel}>Buyer inquiries</div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {openListing && (
        <ListingPanel
          key={openListing.id}
          listing={openListing}
          userPos={userPos}
          onUserPos={rememberPos}
          onClose={() => setOpenListing(null)}
          onNegotiate={chatWithSeller}
          negotiating={chatBusy === openListing.id}
          error={chatError}
        />
      )}
    </div>
  );
}
