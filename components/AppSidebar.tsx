'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { OPEN_BUY_REQUEST_EVENT, OPEN_POST_PRODUCE_EVENT } from '@/lib/post-produce';
import { preloadDeliveryMap } from '@/lib/preload-delivery-map';
import { Hover } from './Hover';
import { cssToStyle } from '@/lib/style';
import { useCurrentUser, getInitials } from '@/lib/use-current-user';
import { useBadges } from '@/lib/use-badges';
import { NotificationsPanel } from './NotificationsPanel';

// Loaded on first open only, so pages don't pay for the modal (or its map).
const PostProduceModal = dynamic(() => import('./PostProduceModal').then((m) => m.PostProduceModal), { ssr: false });
const BuyRequestModal = dynamic(() => import('./BuyRequestModal').then((m) => m.BuyRequestModal), { ssr: false });

export type ActiveNav =
  | 'dashboard'
  | 'home'
  | 'almanac'
  | 'notifications'
  | 'post'
  | 'buyer-requests'
  | 'messages'
  | 'deliveries'
  | 'reviews'
  | 'profile';

const inactiveNavBase =
  'display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:13px;font-size:14px;font-weight:500;color:rgba(246,245,239,.76)';
const inactiveNavHover = 'background:rgba(246,245,239,.07);color:#F6F5EF';
const activeNavStyle =
  'display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:13px;font-size:14px;font-weight:600;color:#F6F5EF;background:rgba(167,198,65,.16)';

/** 9+ keeps the little circle round. */
const badgeText = (n: number) => (n > 9 ? '9+' : String(n));

function NavIcon({ children, stroke = 'currentColor' }: { children: React.ReactNode; stroke?: string }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function NavLink({
  href,
  title,
  active,
  icon,
  badge,
  onClick,
  onIntent,
}: {
  href: string;
  title: string;
  active: boolean;
  icon: React.ReactNode;
  badge?: { text: string; fg: string; bg: string };
  // When set, the link runs this instead of navigating (e.g. opens a modal).
  onClick?: () => void;
  // Runs when the pointer/keyboard/touch shows intent to open the link.
  onIntent?: () => void;
}) {
  const handleClick = onClick
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        onClick();
      }
    : undefined;

  const inner = (
    <>
      {icon}
      <span data-label="">{title}</span>
      {badge && (
        <span
          data-label=""
          // a round dot, not a pill, so one unread reads as a notification badge
          style={{
            marginLeft: 'auto',
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            color: badge.fg,
            background: badge.bg,
            borderRadius: 999,
          }}
        >
          {badge.text}
        </span>
      )}
    </>
  );

  if (active) {
    return (
      <Link href={href} title={title} style={cssToStyle(activeNavStyle)} onClick={handleClick} onMouseEnter={onIntent} onFocus={onIntent}>
        {inner}
      </Link>
    );
  }

  return (
    <Hover as={Link} href={href} title={title} base={inactiveNavBase} hover={inactiveNavHover} onClick={handleClick} onMouseEnter={onIntent} onFocus={onIntent} onTouchStart={onIntent}>
      {inner}
    </Hover>
  );
}

export function AppSidebar({
  active,
  mini,
  onToggle,
  userInitials,
  userName,
  userRole,
}: {
  active: ActiveNav;
  mini: boolean;
  onToggle: () => void;
  userInitials?: string;
  userName?: string;
  userRole?: string;
}) {
  const { user } = useCurrentUser();
  const { counts, refresh: refreshBadges } = useBadges();
  const [bellOpen, setBellOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  // Stays mounted after the first open so the close animation can play.
  const [postLoaded, setPostLoaded] = useState(false);
  const openPost = useCallback(() => {
    setPostLoaded(true);
    setPostOpen(true);
  }, []);

  const [buyOpen, setBuyOpen] = useState(false);
  const [buyLoaded, setBuyLoaded] = useState(false);
  const openBuy = useCallback(() => {
    setBuyLoaded(true);
    setBuyOpen(true);
  }, []);

  // Any page can open the same modals via openPostProduce() / openBuyRequest().
  useEffect(() => {
    window.addEventListener(OPEN_POST_PRODUCE_EVENT, openPost);
    window.addEventListener(OPEN_BUY_REQUEST_EVENT, openBuy);
    return () => {
      window.removeEventListener(OPEN_POST_PRODUCE_EVENT, openPost);
      window.removeEventListener(OPEN_BUY_REQUEST_EVENT, openBuy);
    };
  }, [openPost, openBuy]);

  const displayName = userName ?? user?.fullname ?? 'Seller';
  const displayInitials = userInitials ?? (user ? getInitials(user.fullname) : '');
  // Buyers see the seller tools once they are verified to sell.
  const isBuyer = user?.role === 'BUYER' && !user.sellerVerified;
  const displayRole = userRole ?? user?.businessname ?? (isBuyer ? 'Buyer' : 'Seller');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // replace + a full reload: nothing from the signed-in session is left in
    // memory, and Back can't step into the dashboard again.
    window.location.replace('/auth');
  }

  return (
    <aside
      data-side=""
      data-mini={mini ? '1' : '0'}
      style={{
        background: '#062F24',
        padding: '18px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <div data-topbar="" style={cssToStyle('display:flex;align-items:center;gap:10px;padding:0 4px 0 6px')}>
        <button
          type="button"
          onClick={onToggle}
          data-brand=""
          className="brand-btn"
          aria-label={mini ? 'Expand sidebar' : 'Collapse sidebar'}
          title={mini ? 'Expand sidebar' : 'Collapse sidebar'}
          style={cssToStyle(
            'display:flex;align-items:center;gap:10px;color:#F6F5EF;min-width:0;flex:1;background:none;border:0;padding:0;cursor:pointer;text-align:left;font:inherit'
          )}
        >
          <span
            className="brand-tile"
            style={cssToStyle(
              'width:36px;height:36px;border-radius:11px;background:#F6F5EF;display:grid;place-items:center;flex:0 0 auto'
            )}
          >
            <Image src="/brand/logo-128.png" alt="AniTime logo" width={28} height={28} style={{ objectFit: 'contain' }} />
          </span>
          <span data-label="" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-.025em' }}>
            AniTime
          </span>
        </button>
        <Hover
          as="button"
          type="button"
          onClick={onToggle}
          aria-label="Toggle sidebar"
          base="width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(246,245,239,.16);border-radius:11px;background:transparent;cursor:pointer;flex:0 0 auto;transition:background .25s ease,border-color .25s ease"
          hover="background:rgba(246,245,239,.1);border-color:rgba(167,198,65,.5)"
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="#F6F5EF" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 5.4h14" />
            <path d="M3 10h14" />
            <path d="M3 14.6h14" />
          </svg>
        </Hover>
      </div>

      <Hover
        as={Link}
        href="/profile"
        title="View your profile"
        data-prof=""
        base={
          active === 'profile'
            ? 'display:flex;align-items:center;gap:11px;padding:10px;border-radius:16px;background:rgba(167,198,65,.16);border:1px solid rgba(167,198,65,.34)'
            : 'display:flex;align-items:center;gap:11px;padding:10px;border-radius:16px;background:rgba(246,245,239,.06);border:1px solid rgba(167,198,65,.16)'
        }
        hover="background:rgba(246,245,239,.12)"
      >
        <span
          style={cssToStyle(
            'width:36px;height:36px;border-radius:12px;background:#2F6B45;display:grid;place-items:center;flex:0 0 auto;font-size:13.5px;font-weight:600;color:#F6F5EF;overflow:hidden'
          )}
        >
          {user?.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            displayInitials
          )}
        </span>
        <span data-label="" style={{ minWidth: 0 }}>
          <span
            style={cssToStyle(
              'display:block;font-size:13.5px;font-weight:600;color:#F6F5EF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
            )}
          >
            {displayName}
          </span>
          <span style={cssToStyle('display:block;font-size:11.5px;font-weight:400;color:#A9BBAE')}>{displayRole}</span>
        </span>
      </Hover>

      <nav style={cssToStyle('display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin')}>
        {!isBuyer && (
          <NavLink
            href="/dashboard"
            title="Dashboard"
            active={active === 'dashboard'}
            icon={
              <NavIcon>
                <rect x="3" y="3.2" width="6" height="6.4" rx="1.6" />
                <rect x="11" y="3.2" width="6" height="4" rx="1.6" />
                <rect x="3" y="11.4" width="6" height="5.4" rx="1.6" />
                <rect x="11" y="9.2" width="6" height="7.6" rx="1.6" />
              </NavIcon>
            }
          />
        )}
        <NavLink
          href="/seller-home"
          title="Home"
          active={active === 'home'}
          icon={
            <NavIcon>
              <path d="M3 9.2 10 3.6l7 5.6" />
              <path d="M5 10.4v6.2h10v-6.2" />
            </NavIcon>
          }
        />
        <NavLink
          href="/almanac"
          title="Almanac"
          active={active === 'almanac'}
          icon={
            <NavIcon>
              <path d="M4 4.4h5.2a2 2 0 0 1 2 2v9.2a1.6 1.6 0 0 0-1.6-1.6H4z" />
              <path d="M16 4.4h-2.4a2 2 0 0 0-2 2v9.2a1.6 1.6 0 0 1 1.6-1.6H16z" />
            </NavIcon>
          }
        />
        <NavLink
          href="#"
          title="Notifications"
          active={active === 'notifications' || bellOpen}
          onClick={() => setBellOpen(true)}
          badge={counts.notifications > 0 ? { text: badgeText(counts.notifications), fg: '#FFFFFF', bg: '#B4462F' } : undefined}
          icon={
            <NavIcon>
              <path d="M10 16.4a1.8 1.8 0 0 0 1.8-1.8H8.2A1.8 1.8 0 0 0 10 16.4z" />
              <path d="M4.6 14.6h10.8l-1.3-2.2V9.4a4.1 4.1 0 0 0-8.2 0v3z" />
            </NavIcon>
          }
        />
        {!isBuyer && (
          <NavLink
            href="#"
            title="Post produce"
            active={active === 'post'}
            onClick={openPost}
            icon={
              <NavIcon>
                <path d="M10 4.4v11.2" />
                <path d="M4.4 10h11.2" />
              </NavIcon>
            }
          />
        )}
        <NavLink
          href="/seller-home?tab=requests"
          title="Buyer requests"
          active={active === 'buyer-requests'}
          icon={
            <NavIcon>
              <path d="M3.2 6.6h13.6l-1.4 8.8H4.6z" />
              <path d="M7.2 6.6V5a2.8 2.8 0 0 1 5.6 0v1.6" />
            </NavIcon>
          }
        />
        <NavLink
          href="/messages"
          title="Messages"
          active={active === 'messages'}
          badge={counts.messages > 0 ? { text: badgeText(counts.messages), fg: '#FFFFFF', bg: '#B4462F' } : undefined}
          icon={
            <NavIcon>
              <path d="M3.4 5.2h13.2v8.4H8.6L5 16.6v-3H3.4z" />
            </NavIcon>
          }
        />
        <NavLink
          href="/deliveries"
          title="Deliveries"
          onIntent={preloadDeliveryMap}
          active={active === 'deliveries'}
          icon={
            <NavIcon stroke={active === 'deliveries' ? '#A7C641' : 'currentColor'}>
              <path d="M2.6 13.4h11.2V6.2H2.6z" />
              <path d="M13.8 9h2.2l1.4 2.4v2h-3.6z" />
              <circle cx="6" cy="15.2" r="1.4" />
              <circle cx="14.6" cy="15.2" r="1.4" />
            </NavIcon>
          }
        />
        <NavLink
          href="#"
          title="Reviews"
          active={active === 'reviews'}
          icon={
            <NavIcon>
              <path d="M10 3.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 14l-4.2 2.2.8-4.7L3.2 8.2l4.7-.7z" />
            </NavIcon>
          }
        />
      </nav>

      <div
        style={cssToStyle(
          'flex:0 0 auto;display:flex;flex-direction:column;gap:2px;padding-top:12px;border-top:1px solid rgba(246,245,239,.1)'
        )}
      >
        <Hover
          as="a"
          href="#"
          data-foot=""
          title="Help and guides"
          base="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:13px;font-size:14px;font-weight:500;color:rgba(246,245,239,.6)"
          hover="background:rgba(246,245,239,.07);color:#F6F5EF"
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="10" cy="10" r="7.2" />
            <path d="M8.2 8a1.9 1.9 0 1 1 2.6 1.8v1.1" />
            <path d="M10 13.6v.3" />
          </svg>
          <span data-label="">Help &amp; guides</span>
        </Hover>
        <Hover
          as="button"
          type="button"
          onClick={handleLogout}
          data-foot=""
          title="Log out"
          base="display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:13px;font-size:14px;font-weight:500;color:rgba(246,245,239,.6);width:100%;text-align:left;border:0;background:transparent;cursor:pointer"
          hover="background:rgba(180,70,47,.16);color:#F6F5EF"
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 16.4H4.6V3.6H8" />
            <path d="M12.4 13.2 15.6 10l-3.2-3.2" />
            <path d="M15.2 10H8.2" />
          </svg>
          <span data-label="">Log out</span>
        </Hover>
      </div>
      {postLoaded && <PostProduceModal open={postOpen} onClose={() => setPostOpen(false)} seller={user} />}
      {buyLoaded && <BuyRequestModal open={buyOpen} onClose={() => setBuyOpen(false)} buyer={user} />}
      {bellOpen && <NotificationsPanel onClose={() => setBellOpen(false)} onRead={refreshBadges} />}
    </aside>
  );
}
