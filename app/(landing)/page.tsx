'use client';

import { useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from './page.module.css';

/* ---------------------------------------------------------------------
 * AniTime Landing — public marketing homepage.
 *
 * The original Claude Design export has no {{ }} template bindings on
 * this page at all — every bit of interactivity (parallax tilt, scroll
 * reveals, the sticky horizontal product gallery, the scroll-scrubbed
 * video captions, the maturity timeline, crop modals, the mobile drawer,
 * form "submit") is done with plain imperative DOM manipulation keyed off
 * data-* attributes, wired up once in componentDidMount. That means the
 * markup below is a straight structural port, and the single big
 * useEffect at the bottom is a faithful transcription of that original
 * vanilla-JS logic running against the same data-* hooks.
 * ------------------------------------------------------------------- */

const ACCENT = '#A7C641';

const GALLERY_ITEMS = [
  { pattern: 'sprout-l', img: '/images/crops/banana.png', alt: 'Banana — Lakatan', badge: 'Harvest-ready', num: '01', crop: 'Banana', name: 'Lakatan', price: '₱24', kg: '1,200 kg', place: 'Davao de Oro' },
  { pattern: 'furrow-l', img: '/images/crops/coconut.png', alt: 'Coconut — Unpeeled nut', badge: 'Available now', num: '02', crop: 'Coconut', name: 'Unpeeled nut', price: '₱7', kg: '8,500 kg', place: 'Davao de Oro' },
  { pattern: 'contour-l', img: '/images/crops/mango.png', alt: 'Mango — Carabao', badge: 'Harvest-ready', num: '03', crop: 'Mango', name: 'Carabao', price: '₱75', kg: '640 kg', place: 'Davao del Norte' },
  { pattern: 'grain-l', img: '/images/crops/corn.png', alt: 'Corn — Yellow Sweet', badge: 'Available now', num: '04', crop: 'Corn', name: 'Yellow Sweet', price: '₱35', kg: '2,000 kg', place: 'Bukidnon' },
  { pattern: 'fence-l', img: '/images/crops/pineapple.png', alt: 'Pineapple — Queen', badge: 'Available now', num: '05', crop: 'Pineapple', name: 'Queen', price: '₱30', kg: '1,800 kg', place: 'South Cotabato' },
  { pattern: 'sprout-l', img: '/images/crops/banana.png', alt: 'Banana — Cardaba', badge: 'Harvest-ready', num: '06', crop: 'Banana', name: 'Cardaba', price: '₱14', kg: '3,200 kg', place: 'Davao de Oro' },
  { pattern: 'furrow-l', img: '/images/crops/coconut.png', alt: 'Coconut — Copra', badge: 'Available now', num: '07', crop: 'Coconut', name: 'Copra', price: '₱63', kg: '3,400 kg', place: 'Davao de Oro' },
  { pattern: 'grain-l', img: '/images/crops/corn.png', alt: 'Corn — White Grits', badge: 'Available now', num: '08', crop: 'Corn', name: 'White Grits', price: '₱40', kg: '900 kg', place: 'Bukidnon' },
  { pattern: 'contour-l', img: '/images/crops/mango.png', alt: 'Mango — Pico', badge: 'Harvest-ready', num: '09', crop: 'Mango', name: 'Pico', price: '₱70', kg: '520 kg', place: 'Davao del Norte' },
] as const;

const VIDEO_LINES = [
  'Farmers have supply. Businesses have demand. AniTime brings them together.',
  'Discover products and connect directly with the people who grow them.',
  'From harvest to destination, AniTime makes farm trade easier.',
] as const;

const ADVISORY_STEPS: Record<string, { title: string; body: string }[]> = {
  banana: [
    { title: '01 · Plant', body: 'Suckers or tissue-cultured plantlets, year-round, commonly at the onset of the rains.' },
    { title: '02 · Grow', body: '9–14 months of vegetative growth before the first bunch emerges.' },
    { title: '03 · Mature', body: 'Fingers fill out and ridges round off, roughly 80–110 days after flowering.' },
    { title: '04 · Harvest', body: 'Cut at trade maturity, then repeating ratoon cycles from the same mat.' },
  ],
  coconut: [
    { title: '01 · Plant', body: 'Seedlings from selected nuts, field-planted at the start of the rainy season.' },
    { title: '02 · Grow', body: '5–7 years before a palm comes into regular bearing.' },
    { title: '03 · Mature', body: 'Nuts reach full maturity around 11–12 months after flowering.' },
    { title: '04 · Harvest', body: 'Harvested on a repeating cycle, commonly every 45–60 days.' },
  ],
  mango: [
    { title: '01 · Plant', body: 'Grafted seedlings established in the rainy season with wide spacing.' },
    { title: '02 · Grow', body: '3–5 years of canopy development before the first commercial fruiting.' },
    { title: '03 · Mature', body: 'Fruit fills its shoulders roughly 110–125 days after flower induction.' },
    { title: '04 · Harvest', body: 'A concentrated main season, plus off-season fruit from induced flowering.' },
  ],
  corn: [
    { title: '01 · Plant', body: 'Two main cropping seasons, timed to the wet and dry planting windows.' },
    { title: '02 · Grow', body: '65–80 days for sweet corn; 100–120 days for grain types.' },
    { title: '03 · Mature', body: 'Silks brown and kernels dent as the crop moves past the milk stage.' },
    { title: '04 · Harvest', body: 'Green corn is picked fresh; grain corn dries down before shelling and milling.' },
  ],
  pineapple: [
    { title: '01 · Plant', body: 'Established from suckers, slips or crowns in dense rows.' },
    { title: '02 · Grow', body: '16–24 months from planting, depending on planting material.' },
    { title: '03 · Mature', body: 'Shell eyes flatten and colour breaks from the base upward.' },
    { title: '04 · Harvest', body: 'A main plant crop, followed by a smaller ratoon crop from the same field.' },
  ],
};

type CropInfo = {
  pattern: string;
  title: string;
  blurb: string;
  chipsLabel: string;
  chips: { label: string; dashed?: boolean }[];
  commonUses: string;
  maturity: string;
  planting: string;
  harvest: string;
};

const CROP_INFO: Record<string, CropInfo> = {
  banana: {
    pattern: 'sprout-d',
    title: 'Banana',
    blurb: 'A year-round crop grown widely across the Philippines, traded both as fresh dessert fruit and as cooking varieties for local processing.',
    chipsLabel: 'Varieties',
    chips: [{ label: 'Lakatan' }, { label: 'Latundan' }, { label: 'Saba / Cardaba' }, { label: 'Cavendish · can be added later', dashed: true }],
    commonUses: 'Fresh dessert fruit, cooking and frying varieties, banana chips, flour and processed products.',
    maturity: 'Fruit fills out roughly 80–110 days after flowering, depending on variety and elevation.',
    planting: 'Suckers or tissue-cultured plantlets, planted year-round, commonly at the onset of the rains.',
    harvest: 'First bunches about 9–14 months after planting, then repeating ratoon cycles.',
  },
  coconut: {
    pattern: 'furrow-d',
    title: 'Coconut',
    blurb: 'A perennial palm traded in several forms, from whole nuts to dried kernel and charcoal, each serving a different buyer.',
    chipsLabel: 'Product forms',
    chips: [{ label: 'Copra' }, { label: 'Uling / Charcoal' }, { label: 'Unpeeled nut' }, { label: 'Peeled nut' }],
    commonUses: 'Oil milling, fresh buko trade, charcoal and activated carbon, husk and shell by-products.',
    maturity: 'Nuts reach full maturity around 11–12 months after flowering; young nuts are cut earlier.',
    planting: 'Seedlings raised from selected nuts, field-planted at the start of the rainy season.',
    harvest: 'Bearing palms are harvested on a repeating cycle, commonly every 45–60 days.',
  },
  mango: {
    pattern: 'contour-d',
    title: 'Mango',
    blurb: 'A seasonal tree crop where variety, grade and timing drive price more than volume alone.',
    chipsLabel: 'Varieties',
    chips: [{ label: 'Carabao' }, { label: 'Pico' }, { label: 'Indian / Katchamita' }, { label: 'Cebu · local commercial label', dashed: true }],
    commonUses: 'Fresh market and export, dried mango, purée and juice, green mango for pickles.',
    maturity: 'Fruit is usually ready roughly 110–125 days after flower induction.',
    planting: 'Grafted seedlings established during the rainy season, with wide spacing for mature canopies.',
    harvest: 'Concentrated in a main season, with off-season fruit from induced flowering.',
  },
  corn: {
    pattern: 'grain-d',
    title: 'Corn',
    blurb: 'One crop, several markets: fresh cobs, native waxy types, and milled grits each move differently.',
    chipsLabel: 'Types',
    chips: [{ label: 'White Lagkitan' }, { label: 'Yellow Sweet Corn' }, { label: 'White Corn Grits' }, { label: 'Purple / Bicolor Morado' }],
    commonUses: 'Boiled and grilled fresh corn, corn grits as a staple, feed and processing.',
    maturity: 'Sweet corn around 65–80 days; grain corn commonly 100–120 days.',
    planting: 'Two main cropping seasons, timed to the wet and dry planting windows.',
    harvest: 'Green corn is picked at the milk stage; grain corn is left to dry down before shelling.',
  },
  pineapple: {
    pattern: 'fence-d',
    title: 'Pineapple',
    blurb: 'Grown from planting material rather than seed, with categories that buyers recognise by name.',
    chipsLabel: 'Categories',
    chips: [{ label: 'Hawaiian' }, { label: 'Queen / Formosa' }, { label: 'Native' }],
    commonUses: 'Fresh fruit, canning and juice, dried slices, fibre from leaves.',
    maturity: 'Roughly 16–24 months from planting, depending on planting material and climate.',
    planting: 'Established from suckers, slips or crowns in dense rows.',
    harvest: 'A main plant crop, followed by a smaller ratoon crop from the same field.',
  },
};

function Motif({ id, tone = 'l', bg }: { id: string; tone?: 'l' | 'd'; bg: string }) {
  return (
    <div data-motif="" data-tone={tone} className={styles.motif} style={{ '--motif-bg': bg } as CSSProperties}>
      <svg width="100%" height="56" preserveAspectRatio="none" aria-hidden="true" className={styles.motifSvg}>
        <rect width="100%" height="56" fill={`url(#m-${id}-${tone})`} />
      </svg>
    </div>
  );
}

function PriceCard({ label, sub, change, up, price }: { label: string; sub?: string; change: string; up: boolean; price: string }) {
  return (
    <div
      className={styles.priceCard}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-6px)';
        e.currentTarget.style.boxShadow = '0 26px 44px -30px rgba(6,47,36,.5)';
        e.currentTarget.style.background = '#FFFFFF';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.background = '#F6F5EF';
      }}
    >
      <div className={styles.priceCardTop}>
        <div>
          <span className={styles.priceCardLabel}>{label}</span>
          {sub && <div className={styles.priceCardSub}>{sub}</div>}
        </div>
        <span
          data-move=""
          className={styles.priceCardMove}
          style={{ '--move-fg': up ? '#2F6B45' : '#8C4B33', '--move-bg': up ? 'rgba(167,198,65,.2)' : 'rgba(140,75,51,.12)' } as CSSProperties}
        >
          {up ? '↑' : '↓'}
          {change}
        </span>
      </div>
      <div className={styles.priceCardValueRow}>
        <span className={styles.priceCardValue}>{price}</span>
        <span className={styles.priceCardUnit}>/ kg</span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    const stages = [
      { day: 1, label: 'Immature', cond: ['Deep green skin', 'Firm, angular fingers', 'Very low visual maturity'], filter: 'hue-rotate(50deg) saturate(1.05) brightness(.8) contrast(1.06)' },
      { day: 20, label: 'Developing', cond: ['Green skin, filling out', 'Ridges softening', 'Low visual maturity'], filter: 'hue-rotate(38deg) saturate(1) brightness(.86)' },
      { day: 35, label: 'Mature green', cond: ['Full green, rounded fingers', 'Trade-ready for long haul', 'Moderate visual maturity'], filter: 'hue-rotate(24deg) saturate(.96) brightness(.93)' },
      { day: 45, label: 'Yellowing', cond: ['Yellow skin', 'Minor green near stem', 'High visual maturity'], filter: 'hue-rotate(9deg) saturate(1) brightness(1)' },
      { day: 55, label: 'Fully ripe', cond: ['Even yellow skin', 'First freckling appears', 'Peak eating condition'], filter: 'none' },
      { day: 65, label: 'Overripe', cond: ['Heavy freckling', 'Skin softening', 'Short remaining window'], filter: 'saturate(1.05) brightness(.88) sepia(.2)' },
      { day: 75, label: 'Deteriorating', cond: ['Browning skin', 'Soft to the touch', 'Past marketable condition'], filter: 'saturate(.78) brightness(.7) sepia(.44) contrast(1.12)' },
    ];

    const routes: Record<string, { km: string; min: string; d: string }> = {
      Motorcycle: { km: '12.9', min: '24', d: 'M40 210 C 150 210 190 96 320 96 C 430 96 520 132 700 132' },
      'Light Truck': { km: '18.4', min: '31', d: 'M40 210 C 170 210 210 120 350 120 C 480 120 560 150 700 150' },
      'Large Truck': { km: '21.2', min: '42', d: 'M40 210 C 120 210 160 160 300 160 C 470 160 540 168 700 168' },
    };

    const accent = ACCENT;

    function applyProps() {
      document.querySelectorAll<HTMLElement>('[data-ac]').forEach((el) => {
        const m = el.getAttribute('data-ac') || '';
        if (m.indexOf('t') > -1) el.style.color = accent;
        if (m.indexOf('b') > -1) el.style.background = accent;
        if (m.indexOf('s') > -1) el.style.stroke = accent;
        if (m.indexOf('r') > -1) el.style.borderColor = accent;
      });
    }

    function primeReveals() {
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>('[data-reveal]:not([data-primed])').forEach((el) => {
        el.setAttribute('data-primed', '');
        if (reduce) return;
        if (el.getBoundingClientRect().top < vh * 0.94) return;
        el.style.opacity = '0';
        el.style.transform = 'translateY(26px)';
        const d = parseInt(el.getAttribute('data-reveal') || '0', 10) || 0;
        if (d) el.style.transitionDelay = d + 'ms';
        io.observe(el);
      });
    }
    function show(el: Element) {
      const e = el as HTMLElement;
      e.style.opacity = '1';
      e.style.transform = 'none';
      countUp(e);
    }
    function revealAll() {
      document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
        if (el.style.opacity === '0') show(el);
      });
    }

    function countUp(scope: HTMLElement) {
      const nodes = scope.querySelectorAll ? scope.querySelectorAll<HTMLElement>('[data-count]:not([data-counted])') : [];
      nodes.forEach((n) => {
        n.setAttribute('data-counted', '');
        if (reduce) return;
        const target = parseFloat(n.getAttribute('data-count') || '0');
        const dec = parseInt(n.getAttribute('data-dec') || '0', 10);
        const t0 = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / 850);
          const v = target * (1 - Math.pow(1 - p, 3));
          n.textContent = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }

    function onMove(e: MouseEvent) {
      if (reduce) return;
      const nx = e.clientX / window.innerWidth - 0.5;
      document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
        const k = parseFloat(el.getAttribute('data-tilt') || '12') || 12;
        el.style.setProperty('--px', (nx * k).toFixed(1) + 'px');
        if (el.hasAttribute('data-tilt3d')) el.style.setProperty('--rot', (nx * 3.2).toFixed(2) + 'deg');
      });
    }

    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        frame();
      });
    }

    function frame() {
      const vh = window.innerHeight;
      const nav = document.querySelector<HTMLElement>('[data-nav]');
      if (nav) {
        const on = window.scrollY > 40;
        nav.style.background = on ? 'rgba(6,47,36,.9)' : 'transparent';
        nav.style.backdropFilter = on ? 'blur(16px) saturate(1.3)' : 'none';
        nav.style.boxShadow = on ? '0 1px 0 rgba(167,198,65,.14),0 24px 48px -34px rgba(0,0,0,.9)' : 'none';
        nav.style.paddingTop = on ? '11px' : '18px';
        nav.style.paddingBottom = on ? '11px' : '18px';
      }
      if (!reduce) {
        document.querySelectorAll<HTMLElement>('[data-para]').forEach((el) => {
          const r = el.getBoundingClientRect();
          const k = parseFloat(el.getAttribute('data-para') || '0') || 0;
          const mid = r.top + r.height / 2 - vh / 2;
          el.style.setProperty('--py', (-mid * k).toFixed(1) + 'px');
        });
      }
      galleryFrame(vh);
      videoFrame(vh);
      maturityFrame(vh);
    }

    function progressOf(wrap: Element, vh: number) {
      const r = wrap.getBoundingClientRect();
      const total = Math.max(1, r.height - vh);
      return Math.min(1, Math.max(0, -r.top / total));
    }

    function galleryFrame(vh: number) {
      const wrap = document.querySelector('[data-gallery]');
      if (!wrap) return;
      const view = wrap.querySelector<HTMLElement>('[data-gview]');
      const track = wrap.querySelector<HTMLElement>('[data-gtrack]');
      if (!view || !track) return;
      const p = progressOf(wrap, vh);
      const padEnd = parseFloat(getComputedStyle(track).paddingRight) || 0;
      const max = Math.max(0, track.scrollWidth + padEnd - view.clientWidth);
      track.style.transform = 'translate3d(' + (-p * max).toFixed(1) + 'px,0,0)';

      const vr = view.getBoundingClientRect();
      const cx = vr.left + vr.width / 2;
      const cards = wrap.querySelectorAll<HTMLElement>('[data-gcard]');
      const first = cards[0];
      const pitch = first
        ? first.getBoundingClientRect().width / (parseFloat(first.style.transform.replace(/[^0-9.]/g, '')) || 1) +
          (parseFloat(getComputedStyle(track).columnGap) || 0)
        : 240;
      const span = Math.max(160, pitch);
      let active = 0;
      let best = Infinity;
      const dists: number[] = [];
      cards.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - cx);
        dists.push(d);
        if (d < best) {
          best = d;
          active = i;
        }
      });
      cards.forEach((c, i) => {
        const k = Math.min(1, dists[i] / span);
        const e = k * k * (3 - 2 * k);
        const s = i === active ? 1.16 - 0.16 * e : 0.94 - 0.12 * e;
        c.style.transform = 'scale(' + s.toFixed(3) + ')';
        c.style.opacity = (i === active ? 1 : 0.5 - 0.12 * e).toFixed(3);
        c.style.filter = i === active ? 'none' : 'brightness(' + (0.44 - 0.14 * e).toFixed(3) + ') saturate(' + (0.55 - 0.2 * e).toFixed(2) + ')';
        c.style.zIndex = i === active ? '100' : String(40 - Math.round(e * 30));
      });
      const bar = wrap.querySelector<HTMLElement>('[data-gbar]');
      if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
      const count = wrap.querySelector<HTMLElement>('[data-gcount]');
      if (count) {
        const label = String(active + 1).padStart(2, '0') + ' / ' + cards.length;
        if (count.textContent !== label) count.textContent = label;
      }
    }

    function videoFrame(vh: number) {
      const wrap = document.querySelector('[data-videoscroll]');
      if (!wrap) return;
      const p = progressOf(wrap, vh);
      const lines = document.querySelectorAll<HTMLElement>('[data-vline]');
      const seg = 1 / lines.length;
      lines.forEach((el, i) => {
        const txt = el.querySelector<HTMLElement>('[data-vtext]');
        const full = el.getAttribute('data-text') || '';
        const local = (p - i * seg) / seg;
        const last = i === lines.length - 1;
        if (local < 0) {
          el.style.opacity = '0';
          el.style.transform = 'translateY(30px)';
          if (txt) txt.textContent = '';
          return;
        }
        if (local > 1.02 && !last) {
          el.style.opacity = '0';
          el.style.transform = 'translateY(-36px)';
          return;
        }
        el.style.transform = 'translateY(0)';
        el.style.opacity = !last && local > 0.9 ? String(Math.max(0, (1.02 - local) / 0.12)) : '1';
        if (txt) txt.textContent = full.slice(0, Math.round(full.length * Math.min(1, local / 0.5)));
      });
      const bar = document.querySelector<HTMLElement>('[data-vbar]');
      if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
    }

    function maturityFrame(vh: number) {
      const wrap = document.querySelector('[data-matscroll]');
      if (!wrap) return;
      const p = progressOf(wrap, vh);
      const st = stages;
      const f = p * (st.length - 1);
      const i = Math.min(st.length - 1, Math.floor(f + 0.0001));
      const s = st[i];
      const nxt = st[Math.min(st.length - 1, i + 1)];
      const day = Math.round(s.day + (nxt.day - s.day) * (f - i));
      const set = (sel: string, v: string) => {
        const n = document.querySelector(sel);
        if (n && n.textContent !== v) n.textContent = v;
      };
      set('[data-mat-day]', String(day));
      set('[data-mat-stage]', s.label);
      document.querySelectorAll('[data-mat-cond] li').forEach((li, k) => {
        if (s.cond[k]) li.textContent = s.cond[k];
      });
      const img = document.querySelector<HTMLElement>('[data-mat-img]');
      if (img) {
        img.style.filter = s.filter === 'none' ? 'drop-shadow(0 40px 46px rgba(0,0,0,.6))' : s.filter + ' drop-shadow(0 40px 46px rgba(0,0,0,.6))';
        if (!reduce) {
          img.style.setProperty('--rot', (p * 16 - 8).toFixed(2) + 'deg');
          img.style.setProperty('--py', (p * -26).toFixed(1) + 'px');
        }
      }
      const bar = document.querySelector<HTMLElement>('[data-mat-bar]');
      if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
      document.querySelectorAll<HTMLElement>('[data-mat-tick]').forEach((t, k) => {
        const on = k <= i;
        t.style.color = on ? '#F6F5EF' : 'rgba(203,216,206,.4)';
        t.style.borderColor = on ? accent : 'rgba(203,216,206,.18)';
      });
    }

    function wireScrollers() {
      document.querySelectorAll<HTMLElement>('[data-hscroll]:not([data-wired])').forEach((track) => {
        track.setAttribute('data-wired', '');
        track.addEventListener(
          'wheel',
          (e: WheelEvent) => {
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            const max = track.scrollWidth - track.clientWidth;
            const at = (e.deltaY < 0 && track.scrollLeft <= 1) || (e.deltaY > 0 && track.scrollLeft >= max - 1);
            if (at) return;
            e.preventDefault();
            track.scrollLeft += e.deltaY;
          },
          { passive: false }
        );
        let down = false;
        let sx = 0;
        let sl = 0;
        let moved = 0;
        track.addEventListener('pointerdown', (e: PointerEvent) => {
          if (e.pointerType === 'touch') return;
          down = true;
          moved = 0;
          sx = e.clientX;
          sl = track.scrollLeft;
          track.style.cursor = 'grabbing';
        });
        track.addEventListener('pointermove', (e: PointerEvent) => {
          if (!down) return;
          moved = Math.abs(e.clientX - sx);
          track.scrollLeft = sl - (e.clientX - sx);
        });
        const up = () => {
          down = false;
          track.style.cursor = 'grab';
        };
        track.addEventListener('pointerup', (e: PointerEvent) => {
          if (moved > 6) e.preventDefault();
          up();
        });
        track.addEventListener('pointerleave', up);
      });
    }

    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      const near = (s: string) => t.closest && (t.closest(s) as HTMLElement | null);

      const burger = near('[data-drawer-toggle]');
      if (burger) {
        const d = document.querySelector<HTMLElement>('[data-drawer]');
        if (d) d.style.display = d.style.display === 'flex' ? 'none' : 'flex';
        return;
      }
      if (near('[data-drawer-link]')) {
        const d = document.querySelector<HTMLElement>('[data-drawer]');
        if (d) d.style.display = 'none';
      }

      const openCrop = near('[data-open-crop]');
      if (openCrop) {
        e.preventDefault();
        const key = openCrop.getAttribute('data-open-crop')!;
        const ov = document.querySelector<HTMLElement>('[data-modal-overlay]');
        document.querySelectorAll<HTMLElement>('[data-modal]').forEach((m) => {
          m.style.display = m.getAttribute('data-modal') === key ? 'block' : 'none';
        });
        if (ov) {
          ov.style.display = 'flex';
          document.body.style.overflow = 'hidden';
        }
        return;
      }
      if (near('[data-close-modal]') || t.hasAttribute?.('data-modal-overlay')) {
        const ov = document.querySelector<HTMLElement>('[data-modal-overlay]');
        if (ov) {
          ov.style.display = 'none';
          document.body.style.overflow = '';
        }
        return;
      }

      const tab = near('[data-advisory]');
      if (tab) {
        const key = tab.getAttribute('data-advisory')!;
        document.querySelectorAll<HTMLElement>('[data-advisory]').forEach((b) => {
          const on = b.getAttribute('data-advisory') === key;
          b.style.background = on ? '#062F24' : 'transparent';
          b.style.color = on ? '#F6F5EF' : '#4B5C53';
          b.style.borderColor = on ? '#062F24' : 'rgba(6,47,36,.16)';
        });
        document.querySelectorAll<HTMLElement>('[data-advisory-panel]').forEach((p) => {
          p.style.display = p.getAttribute('data-advisory-panel') === key ? 'block' : 'none';
        });
        return;
      }

      const veh = near('[data-vehicle]');
      if (veh) {
        const key = veh.getAttribute('data-vehicle')!;
        document.querySelectorAll<HTMLElement>('[data-vehicle]').forEach((b) => {
          const on = b.getAttribute('data-vehicle') === key;
          b.style.background = on ? '#062F24' : '#FFFFFF';
          b.style.color = on ? '#F6F5EF' : '#4B5C53';
          b.style.borderColor = on ? '#062F24' : 'rgba(6,47,36,.14)';
        });
        const r = routes[key];
        const path = document.querySelector('[data-route-path]');
        const set = (sel: string, v: string) => {
          const n = document.querySelector(sel);
          if (n) n.textContent = v;
        };
        if (r) {
          if (path) path.setAttribute('d', r.d);
          set('[data-route-km]', r.km);
          set('[data-route-min]', r.min);
          set('[data-route-vehicle]', key);
        }
      }
    }

    function onSubmit(e: SubmitEvent) {
      const target = e.target as HTMLElement;
      if (!target.hasAttribute?.('data-inquiry')) return;
      e.preventDefault();
      target.style.display = 'none';
      const done = document.querySelector<HTMLElement>('[data-inquiry-done]');
      if (done) done.style.display = 'block';
    }

    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            show(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );

    const onResize = () => primeReveals();

    document.addEventListener('click', onDocClick);
    document.addEventListener('submit', onSubmit as EventListener);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    primeReveals();
    const mo = new MutationObserver(() => {
      primeReveals();
      wireScrollers();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    wireScrollers();
    applyProps();
    document.querySelectorAll('video').forEach((v) => {
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      const go = () => {
        const r = v.play();
        if (r && r.catch) r.catch(() => {});
      };
      go();
      v.addEventListener('loadeddata', go, { once: true });
      v.addEventListener('canplay', go, { once: true });
    });
    frame();
    const failsafe = setTimeout(() => revealAll(), 4500);

    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('submit', onSubmit as EventListener);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      io.disconnect();
      mo.disconnect();
      clearTimeout(failsafe);
    };
  }, []);

  return (
    <>
      <svg aria-hidden="true" width="0" height="0" className={styles.svgDefs}>
        <defs>
          <g id="g-furrow" fill="none" strokeLinecap="round">
            <path d="M0 12 C 17 3 35 21 52 12 C 69 3 87 21 104 12" />
            <path d="M0 28 C 17 19 35 37 52 28 C 69 19 87 37 104 28" />
            <path d="M0 44 C 17 35 35 53 52 44 C 69 35 87 53 104 44" />
          </g>
          <g id="g-contour" fill="none" strokeLinecap="round">
            <path d="M0 54 H168" />
            <path d="M18 54 C 42 20 78 20 102 54" />
            <path d="M34 54 C 50 32 70 32 86 54" />
            <path d="M48 54 C 56 42 64 42 72 54" />
            <path d="M118 54 C 132 36 150 36 164 54" />
          </g>
          <g id="g-sprout" fill="none" strokeLinecap="round">
            <path d="M0 50 H84" />
            <path d="M42 50 V24" />
            <path d="M42 33 C 33 33 27 27 26 19 C 35 19 41 25 42 33" />
            <path d="M42 30 C 51 30 57 24 58 16 C 49 16 43 22 42 30" />
          </g>
          <g id="g-grain" fill="none" strokeLinecap="round">
            <path d="M30 52 V14" />
            <path d="M30 22 C 22 21 19 16 19 11 C 26 11 30 16 30 22" />
            <path d="M30 22 C 38 21 41 16 41 11 C 34 11 30 16 30 22" />
            <path d="M30 32 C 22 31 19 26 19 21 C 26 21 30 26 30 32" />
            <path d="M30 32 C 38 31 41 26 41 21 C 34 21 30 26 30 32" />
            <path d="M30 42 C 22 41 19 36 19 31 C 26 31 30 36 30 42" />
            <path d="M30 42 C 38 41 41 36 41 31 C 34 31 30 36 30 42" />
          </g>
          <g id="g-fence" fill="none" strokeLinecap="round">
            <path d="M0 50 H108" />
            <path d="M22 50 V16" />
            <path d="M76 50 V16" />
            <path d="M0 26 H108" />
            <path d="M0 38 H108" />
          </g>
          <pattern id="m-furrow-l" width="104" height="56" patternUnits="userSpaceOnUse"><use href="#g-furrow" stroke="#2F6B45" strokeWidth="1.3" opacity=".42" /></pattern>
          <pattern id="m-furrow-d" width="104" height="56" patternUnits="userSpaceOnUse"><use href="#g-furrow" stroke="#A7C641" strokeWidth="1.3" opacity=".34" /></pattern>
          <pattern id="m-contour-l" width="168" height="56" patternUnits="userSpaceOnUse"><use href="#g-contour" stroke="#2F6B45" strokeWidth="1.2" opacity=".38" /></pattern>
          <pattern id="m-contour-d" width="168" height="56" patternUnits="userSpaceOnUse"><use href="#g-contour" stroke="#A7C641" strokeWidth="1.2" opacity=".3" /></pattern>
          <pattern id="m-sprout-l" width="84" height="56" patternUnits="userSpaceOnUse"><use href="#g-sprout" stroke="#2F6B45" strokeWidth="1.3" opacity=".42" /></pattern>
          <pattern id="m-sprout-d" width="84" height="56" patternUnits="userSpaceOnUse"><use href="#g-sprout" stroke="#A7C641" strokeWidth="1.3" opacity=".34" /></pattern>
          <pattern id="m-grain-l" width="60" height="56" patternUnits="userSpaceOnUse"><use href="#g-grain" stroke="#2F6B45" strokeWidth="1.2" opacity=".4" /></pattern>
          <pattern id="m-grain-d" width="60" height="56" patternUnits="userSpaceOnUse"><use href="#g-grain" stroke="#A7C641" strokeWidth="1.2" opacity=".32" /></pattern>
          <pattern id="m-fence-l" width="108" height="56" patternUnits="userSpaceOnUse"><use href="#g-fence" stroke="#2F6B45" strokeWidth="1.3" opacity=".36" /></pattern>
          <pattern id="m-fence-d" width="108" height="56" patternUnits="userSpaceOnUse"><use href="#g-fence" stroke="#A7C641" strokeWidth="1.3" opacity=".3" /></pattern>
        </defs>
      </svg>

      {/* ---------------- Header / nav ---------------- */}
      <header data-nav="" className={styles.navHeader}>
        <div className={styles.navRow}>
          <a href="#home" className={styles.navBrand}>
            <span className={styles.navBrandIcon}>
              <Image src="/brand/logo-128.png" alt="AniTime logo" width={28} height={28} className={styles.brandImg} />
            </span>
            <span className={styles.navBrandText}>AniTime</span>
          </a>
          <nav data-desk className={styles.navLinks}>
            <a href="#home" className={styles.navLink}>Home</a>
            <a href="#marketplace" className={styles.navLink}>Marketplace</a>
            <a href="#crops" className={styles.navLink}>Crops</a>
            <a href="#how" className={styles.navLink}>How It Works</a>
            <a href="#contact" className={styles.navLink}>Contact</a>
          </nav>
          <div data-desk className={styles.navActions}>
            <a href="#contact" className={styles.navBecomeBuyer}>Become a Buyer</a>
            <Link href="/auth" className={styles.navLogin}>Login</Link>
            <Link
              data-ac="b"
              href="/auth?screen=register"
              className={styles.navRegisterBtn}
            >
              Register as Seller
            </Link>
          </div>
          <button
            data-mob
            data-drawer-toggle=""
            aria-label="Menu"
            className={styles.navBurger}
          >
            <span className={styles.navBurgerBarLong} />
            <span className={styles.navBurgerBarLong} />
            <span className={styles.navBurgerBarShort} />
          </button>
        </div>
        <div data-drawer className={styles.navDrawer}>
          <a href="#home" data-drawer-link="" className={styles.drawerLink}>Home</a>
          <a href="#marketplace" data-drawer-link="" className={styles.drawerLink}>Marketplace</a>
          <a href="#crops" data-drawer-link="" className={styles.drawerLink}>Crops</a>
          <a href="#how" data-drawer-link="" className={styles.drawerLink}>How It Works</a>
          <a href="#contact" data-drawer-link="" className={styles.drawerLinkLast}>Contact</a>
          <div className={styles.drawerActionsRow}>
            <Link data-ac="b" href="/auth?screen=register" data-drawer-link="" className={styles.drawerRegisterBtn}>Register as Seller</Link>
            <a href="#contact" data-drawer-link="" className={styles.drawerBuyerBtn}>Become a Buyer</a>
          </div>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section id="home" className={styles.heroSection}>
        <div aria-hidden="true" className={styles.heroGradient} />
        <svg aria-hidden="true" width="100%" height="100%" preserveAspectRatio="none" className={styles.heroContourSvg}>
          <rect width="100%" height="100%" fill="url(#m-contour-d)" />
        </svg>
        <div aria-hidden="true" className={styles.heroDustWrap}>
          <span className={styles.dust1} />
          <span className={styles.dust2} />
          <span className={styles.dust3} />
          <span className={styles.dust4} />
          <span className={styles.dust5} />
          <span className={styles.dust6} />
          <span className={styles.dust7} />
          <span className={styles.dust8} />
        </div>

        <div className={styles.heroGrid}>
          <div>
            <div className={styles.heroKickerRow}>
              <span data-ac="b" className={styles.dashA7} />
              <span className={styles.heroKickerLabel}>Agricultural marketplace</span>
            </div>
            <h1 className={styles.heroTitle}>
              <span className={styles.fw300}>Grow. Trade.</span><br />
              <span className={styles.fw700}>Deliver.</span>{' '}
              <span data-ac="t" className={styles.heroAccentItalic}>Smarter.</span>
            </h1>
            <p className={styles.heroBody}>
              A smarter way to connect agricultural supply with bulk demand — helping farmers showcase their produce, helping buyers discover supply, and helping every journey from farm to destination become easier to plan.
            </p>
            <div className={styles.heroBtnRow}>
              <a
                data-ac="b"
                href="#marketplace"
                className={styles.heroPrimaryBtn}
              >
                Explore Farm Products <span className={styles.arrowTransition}>→</span>
              </a>
              <a
                href="#farmers"
                className={styles.heroSecondaryBtn}
              >
                Sell Your Produce
              </a>
            </div>
            <a
              href="#contact"
              className={styles.heroInlineLink}
            >
              Looking to buy in bulk? Contact us →
            </a>
          </div>

          <div className={styles.heroArtWrap}>
            <div aria-hidden="true" className={styles.heroArtGlow} />
            <img
              src="/images/crops/coconut.png"
              alt="Coconut, whole and halved"
              data-para="-.05"
              data-tilt="16"
              data-tilt3d=""
              className={styles.heroMainImg}
            />

            <div data-tilt="-26" className={styles.heroCardLeft}>
              <div className={styles.heroCardKicker}>Coconut</div>
              <div className={styles.heroCardPriceRow}>
                <span className={styles.heroCardPrice}>₱18</span>
                <span className={styles.heroCardUnit}>/ kg</span>
              </div>
              <div className={styles.heroCardAvail}>2,400 kg available</div>
              <div className={styles.heroCardPlaceRow}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#A7C641" strokeWidth="1.3"><path d="M6 11s4-4.2 4-6.6A4 4 0 0 0 2 4.4C2 6.8 6 11 6 11z" /><circle cx="6" cy="4.4" r="1.2" /></svg>
                Davao de Oro
              </div>
            </div>

            <svg aria-hidden="true" viewBox="0 0 300 120" width="86%" height="auto" className={styles.heroDashedSvg}>
              <path d="M6 104 C 74 104 96 30 168 30 C 228 30 258 52 292 52" fill="none" stroke="rgba(167,198,65,.32)" strokeWidth="1.6" strokeDasharray="7 9" className={styles.dashRunLg} />
              <circle cx="6" cy="104" r="4.5" fill="#A7C641" />
              <circle cx="6" cy="104" r="9" fill="none" stroke="rgba(167,198,65,.5)" strokeWidth="1.2" className={styles.pulseRingLgOrigin} />
              <circle cx="292" cy="52" r="4" fill="#F6F5EF" />
            </svg>

            <div data-tilt="22" className={styles.heroCardRight}>
              <div className={styles.heroCardRightTop}>
                <span className={styles.heroCardRightKicker}>Farm → Buyer</span>
                <span data-ac="b" className={styles.dot6} />
              </div>
              <div className={styles.heroCardEstLabel}>Estimated</div>
              <div className={styles.heroCardEtaRow}>
                <span className={styles.heroCardEta}>32</span>
                <span className={styles.heroCardEtaUnit}>min ETA</span>
              </div>
              <div className={styles.heroCardTrack}>
                <span data-ac="b" className={styles.heroCardFill} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <Motif id="furrow" bg="#F6F5EF" />

      {/* ---------------- About ---------------- */}
      <section id="about" className={styles.aboutSection}>
        <svg aria-hidden="true" width="240" height="240" viewBox="0 0 240 240" className={styles.aboutRingsBig}>
          <g fill="none" stroke="#2F6B45" strokeWidth="1.2"><circle cx="120" cy="120" r="38" /><circle cx="120" cy="120" r="62" /><circle cx="120" cy="120" r="88" /><circle cx="120" cy="120" r="114" /></g>
        </svg>
        <svg aria-hidden="true" width="180" height="180" viewBox="0 0 240 240" className={styles.aboutRingsSmall}>
          <g fill="none" stroke="#2F6B45" strokeWidth="1.4"><circle cx="120" cy="120" r="46" /><circle cx="120" cy="120" r="78" /><circle cx="120" cy="120" r="110" /></g>
        </svg>
        <div className={styles.aboutInner}>
          <div data-reveal="0" className={styles.kickerRow12}>
            <span data-ac="b" className={styles.dash26green} />
            <span className={styles.kickerLabelGreen}>About AniTime</span>
          </div>
          <h2 data-reveal="80" className={styles.aboutTitle}>
            Where agricultural supply<br /><span className={styles.italicGreen300}>meets real demand.</span>
          </h2>
          <p data-reveal="160" className={styles.aboutBody}>
            AniTime is a digital agricultural marketplace designed to connect farmers with businesses and bulk buyers. Farmers can showcase available produce, while buyers can discover supply, compare platform-listed prices, communicate directly with sellers, and plan delivery. The platform combines marketplace discovery, agricultural information, and location-based logistics into one experience.
          </p>
          <div data-reveal="240" className={styles.aboutStatsGrid}>
            <div>
              <div className={styles.aboutStatValue}><span data-count="5" data-dec="0">5</span></div>
              <div className={styles.aboutStatLabel}>Crop categories on the platform</div>
            </div>
            <div>
              <div className={styles.aboutStatValue}><span data-count="14" data-dec="0">14</span></div>
              <div className={styles.aboutStatLabel}>Varieties &amp; product forms listed</div>
            </div>
            <div>
              <div className={styles.aboutStatValue}>2</div>
              <div className={styles.aboutStatLabel}>Sides of the market, one platform</div>
            </div>
          </div>
        </div>
      </section>

      <Motif id="contour" bg="#FFFFFF" />

      {/* ---------------- Prices intro ---------------- */}
      <section id="prices" className={styles.pricesSection}>
        <div className={styles.pricesGrid}>
          <div>
            <h2 className={styles.pricesTitle}>
              What&apos;s moving<br /><span className={styles.italicGreen300}>in the market?</span>
            </h2>
          </div>
          <div>
            <p className={styles.pricesBody}>Explore recent platform-listed prices across selected agricultural products and varieties.</p>
            <div className={styles.pricesUpdatedRow}>
              <span className={styles.pricesUpdatedBadge}>
                <span data-ac="b" className={styles.dot6} />Updated recently
              </span>
              <span className={styles.pricesDisclaimer}>Platform-listed prices, not official national market prices</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Coconut showcase ---------------- */}
      <section className={styles.showcaseSectionWhite}>
        <div className={styles.showcaseGrid}>
          <div data-reveal="0" className={styles.showcaseImgFlexCenter}>
            <div aria-hidden="true" className={styles.showcaseGlowCoconut1} />
            <div aria-hidden="true" className={styles.showcaseGlowCoconut2} />
            <img
              src="/images/crops/coconut.png"
              alt="Coconut, whole and halved"
              data-para="-.06"
              data-tilt="12"
              data-tilt3d=""
              className={styles.showcaseImgCoconut}
            />
          </div>
          <div>
            <div data-reveal="0" className={styles.showcaseKickerRow}>
              <span data-ac="b" className={styles.showcaseDash} />
              <span className={styles.showcaseLabel}>Coconut</span>
            </div>
            <h3 data-reveal="70" className={styles.showcaseTitle}>Coconut, beyond the shell.</h3>
            <p data-reveal="130" className={styles.showcaseBody}>Explore different forms of coconut supply, from whole nuts to processed products used across local markets.</p>
            <div className={styles.showcasePriceGrid}>
              <div data-reveal="180"><PriceCard label="Copra" change="4.8%" up price="₱63" /></div>
              <div data-reveal="240"><PriceCard label="Uling / Charcoal" change="2.1%" up={false} price="₱28" /></div>
              <div data-reveal="300"><PriceCard label="Unpeeled Coconut" change="1.4%" up price="₱7" /></div>
              <div data-reveal="360"><PriceCard label="Peeled Coconut" change="3.2%" up price="₱9" /></div>
            </div>
            <div className={styles.showcaseFooterRow}>
              <button
                type="button"
                data-open-crop="coconut"
                className={styles.showcaseLearnBtn}
              >
                Learn About This Crop →
              </button>
              <span className={styles.showcaseNote}>Latest listed prices · illustrative percentages</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Banana showcase ---------------- */}
      <section className={styles.showcaseSectionTint}>
        <div className={styles.showcaseGrid}>
          <div>
            <div data-reveal="0" className={styles.showcaseKickerRow}>
              <span data-ac="b" className={styles.showcaseDash} />
              <span className={styles.showcaseLabel}>Banana</span>
            </div>
            <h3 data-reveal="70" className={styles.showcaseTitle}>
              Different varieties.<br /><span className={styles.italicGreen300}>Different markets.</span>
            </h3>
            <p data-reveal="130" className={styles.showcaseBody}>Discover commonly traded banana varieties and compare their expected prices and available supply.</p>
            <div className={styles.showcasePriceGrid}>
              <div data-reveal="180"><PriceCard label="Latundan" change="2.6%" up price="₱18" /></div>
              <div data-reveal="240"><PriceCard label="Cardaba / Saba" change="1.8%" up={false} price="₱14" /></div>
              <div data-reveal="300"><PriceCard label="Lakatan / Binangay" change="5.1%" up price="₱24" /></div>
            </div>
            <div className={styles.showcaseFooterRow}>
              <button type="button" data-open-crop="banana" className={styles.showcaseLearnBtn}>Learn About This Crop →</button>
              <span className={styles.showcaseNote}>Platform-listed prices · illustrative percentages</span>
            </div>
          </div>
          <div data-reveal="0" className={styles.showcaseImgFlexCenter}>
            <div aria-hidden="true" className={styles.showcaseGlowBanana1} />
            <div aria-hidden="true" className={styles.showcaseGlowBanana2} />
            <img
              src="/images/crops/banana.png"
              alt="Bunch of ripe bananas"
              data-tilt="-12"
              data-tilt3d=""
              className={styles.showcaseImgBanana}
            />
          </div>
        </div>
      </section>

      {/* ---------------- Mango showcase ---------------- */}
      <section className={styles.showcaseSectionWhite}>
        <div className={styles.showcaseGrid}>
          <div data-reveal="0" className={styles.showcaseImgOuterPlain}>
            <div aria-hidden="true" className={styles.showcaseGlowMangoOuter} />
            <div className={styles.showcaseImgFlexCenter}>
              <div aria-hidden="true" className={styles.showcaseImgShadowSmall} />
              <img
                src="/images/crops/mango.png"
                alt="Mango"
                data-tilt="12"
                data-tilt3d=""
                className={styles.showcaseImgMango}
              />
            </div>
          </div>
          <div>
            <div data-reveal="0" className={styles.showcaseKickerRow}>
              <span data-ac="b" className={styles.showcaseDash} />
              <span className={styles.showcaseLabel}>Mango</span>
            </div>
            <h3 data-reveal="70" className={styles.showcaseTitle}>
              Every variety tells<br /><span className={styles.italicGreen300}>a different story.</span>
            </h3>
            <p data-reveal="130" className={styles.showcaseBody}>From the familiar Carabao to specialty varieties, mango supply can vary by type, quality, season, and market.</p>
            <div className={styles.showcasePriceGrid}>
              <div data-reveal="180"><PriceCard label="Carabao" change="3.4%" up price="₱75" /></div>
              <div data-reveal="230"><PriceCard label="Cebu" change="0.9%" up={false} price="₱65" /></div>
              <div data-reveal="280"><PriceCard label="Pico" change="1.7%" up price="₱70" /></div>
              <div data-reveal="330"><PriceCard label="Indian / Katchamita" change="2.2%" up price="₱60" /></div>
            </div>
            <div className={styles.showcaseFooterRow}>
              <button type="button" data-open-crop="mango" className={styles.showcaseLearnBtn}>Learn About This Crop →</button>
              <span className={styles.showcaseNote}>Example platform-listed prices</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Corn showcase ---------------- */}
      <section className={styles.showcaseSectionTint}>
        <div className={styles.showcaseGrid}>
          <div>
            <div data-reveal="0" className={styles.showcaseKickerRow}>
              <span data-ac="b" className={styles.showcaseDash} />
              <span className={styles.showcaseLabel}>Corn</span>
            </div>
            <h3 data-reveal="70" className={styles.showcaseTitle}>
              More than<br /><span className={styles.italicGreen300}>one kind of corn.</span>
            </h3>
            <p data-reveal="130" className={styles.showcaseBody}>From chewy waxy corn to sweet yellow kernels and corn grits, different corn products serve very different markets.</p>
            <div className={styles.showcasePriceGridWide}>
              <div data-reveal="180"><PriceCard label="White Lagkitan" sub="Native Glutinous / Waxy Corn" change="1.9%" up price="₱30" /></div>
              <div data-reveal="230"><PriceCard label="Yellow Sweet Corn" sub="Sugar Corn / “Japanese” Corn" change="4.2%" up price="₱35" /></div>
              <div data-reveal="280"><PriceCard label="White Corn Grits" sub="Bigas na Mais / Tinigib" change="1.1%" up={false} price="₱40" /></div>
              <div data-reveal="330"><PriceCard label="Purple / Bicolor Waxy Corn" sub="Morado" change="2.8%" up price="₱35" /></div>
            </div>
            <div className={styles.showcaseFooterRow}>
              <button type="button" data-open-crop="corn" className={styles.showcaseLearnBtn}>Learn About This Crop →</button>
              <span className={styles.showcaseNote}>Illustrative UI values · fresh, processed and grits</span>
            </div>
          </div>
          <div data-reveal="0" className={styles.showcaseImgOuterPlain}>
            <div aria-hidden="true" className={styles.showcaseGlowCornOuter} />
            <div className={styles.showcaseImgFlexCenter}>
              <div aria-hidden="true" className={styles.showcaseImgShadowSmall} />
              <img
                src="/images/crops/corn.png"
                alt="Corn"
                data-tilt="-12"
                data-tilt3d=""
                className={styles.showcaseImgCorn}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Pineapple showcase ---------------- */}
      <section className={styles.showcaseSectionWhiteTallBottom}>
        <div className={styles.showcaseGrid}>
          <div data-reveal="0" className={styles.showcaseImgOuterPlain}>
            <div aria-hidden="true" className={styles.showcaseGlowPineappleOuter} />
            <div className={styles.showcaseImgFlexCenter}>
              <div aria-hidden="true" className={styles.showcaseImgShadowSmall} />
              <img
                src="/images/crops/pineapple.png"
                alt="Pineapple"
                data-tilt="12"
                data-tilt3d=""
                className={styles.showcaseImgPineapple}
              />
            </div>
          </div>
          <div>
            <div data-reveal="0" className={styles.showcaseKickerRow}>
              <span data-ac="b" className={styles.showcaseDash} />
              <span className={styles.showcaseLabel}>Pineapple</span>
            </div>
            <h3 data-reveal="70" className={styles.showcaseTitle}>
              Different varieties.<br /><span className={styles.italicGreen300}>One market.</span>
            </h3>
            <p data-reveal="130" className={styles.showcaseBody}>Explore pineapple varieties commonly encountered in Philippine production and trade.</p>
            <div className={styles.showcasePriceGrid}>
              <div data-reveal="180"><PriceCard label="Hawaiian" change="2.4%" up price="₱25" /></div>
              <div data-reveal="230"><PriceCard label="Queen / Formosa" change="1.3%" up={false} price="₱30" /></div>
              <div data-reveal="280"><PriceCard label="Native" change="3.6%" up price="₱22" /></div>
            </div>
            <div className={styles.showcaseFooterRow}>
              <button type="button" data-open-crop="pineapple" className={styles.showcaseLearnBtn}>Learn About This Crop →</button>
              <span className={styles.showcaseNote}>Platform examples until backend data is connected</span>
            </div>
          </div>
        </div>
      </section>

      <Motif id="grain" bg="#F6F5EF" />

      {/* ---------------- Marketplace / scroll-jacking gallery ---------------- */}
      <section id="marketplace" data-gallery className={styles.gallerySection}>
        <div className={styles.gallerySticky}>
          <div aria-hidden="true" className={styles.galleryGradient} />
          <svg aria-hidden="true" width="100%" height="100%" preserveAspectRatio="none" className={styles.galleryFurrowSvg}>
            <rect width="100%" height="100%" fill="url(#m-furrow-d)" />
          </svg>
          <div aria-hidden="true" className={styles.galleryEdgeFade} />
          <div aria-hidden="true" className={styles.galleryVignette} />

          <div className={styles.galleryHead}>
            <div className={styles.kickerRow12}>
              <span data-ac="b" className={styles.showcaseDash} />
              <span className={styles.heroKickerLabel}>Available farm products</span>
            </div>
            <h2 className={styles.galleryTitle}>
              Fresh from<br /><span className={styles.italicAccent300}>the farm.</span>
            </h2>
            <p data-desk className={styles.galleryBody}>Explore available agricultural products from registered sellers.</p>
            <div data-desk className={styles.galleryScrollHintRow}>
              <span className={styles.galleryScrollHintText}>Keep scrolling</span>
              <span aria-hidden="true" className={styles.galleryScrollHintArrow}>→</span>
            </div>
          </div>

          <div data-gview className={styles.galleryView}>
            <div data-gtrack className={styles.galleryTrack}>
              {GALLERY_ITEMS.map((it) => (
                <article
                  key={it.num}
                  data-gcard
                  className={styles.galleryCard}
                >
                  <svg aria-hidden="true" width="100%" height="100%" preserveAspectRatio="none" className={styles.galleryCardPatternSvg}>
                    <rect width="100%" height="100%" fill={`url(#m-${it.pattern})`} />
                  </svg>
                  <div aria-hidden="true" className={styles.galleryCardGlow} />
                  <img
                    src={it.img}
                    alt={it.alt}
                    className={styles.galleryCardImg}
                  />
                  <span className={styles.galleryCardBadge}>
                    {it.badge}
                  </span>
                  <span data-gnum className={styles.galleryCardNum}>{it.num}</span>
                  <div className={styles.galleryCardFoot}>
                    <div className={styles.galleryCardCrop}>{it.crop}</div>
                    <h3 className={styles.galleryCardName}>{it.name}</h3>
                    <div className={styles.galleryCardPriceRow}>
                      <div className={styles.galleryCardPriceGroup}>
                        <span className={styles.galleryCardPrice}>{it.price}</span>
                        <span className={styles.galleryCardUnit}>/ kg</span>
                      </div>
                      <div className={styles.galleryCardRight}>
                        <div className={styles.galleryCardKg}>{it.kg}</div>
                        <div className={styles.galleryCardPlace}>{it.place}</div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              <div className={styles.galleryEndCard}>
                <h3 className={styles.galleryEndTitle}>See every listing on the platform.</h3>
                <a
                  href="#contact"
                  data-ac="b"
                  className={styles.galleryEndBtn}
                >
                  View Full Marketplace <span>→</span>
                </a>
              </div>
            </div>
          </div>

          <div className={styles.galleryFooter}>
            <div className={styles.galleryFooterRow}>
              <span data-gcount className={styles.galleryCount}>01 / 9</span>
              <span className={styles.galleryFooterNote}>Platform-listed prices from registered sellers</span>
            </div>
            <div className={styles.galleryProgressTrack}>
              <span data-gbar data-ac="b" className={styles.galleryProgressFill} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Video-scroll "What is AniTime" ---------------- */}
      <div data-videoscroll="" className={styles.videoScrollWrap}>
        <div className={styles.videoSticky}>
          <video
            src="/uploads/Whatisplatformsection.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            className={styles.videoEl}
          />
          <div aria-hidden="true" className={styles.videoGradient1} />
          <div aria-hidden="true" className={styles.videoGradient2} />
          <div aria-hidden="true" className={styles.videoInsetShadow} />
          <div className={styles.videoContentWrap}>
            <div className={styles.videoContentInner}>
              <div className={styles.videoKickerRow}>
                <span data-ac="b" className={styles.showcaseDash} />
                <span className={styles.heroKickerLabel}>What is AniTime</span>
              </div>
              <div className={styles.videoLinesWrap}>
                {VIDEO_LINES.map((line, i) => (
                  <p
                    key={line}
                    data-vline
                    data-text={line}
                    className={i === 0 ? styles.videoLine : styles.videoLineHidden}
                  >
                    <span data-vtext>{i === 0 ? line : ''}</span>
                    <span
                      data-ac="b"
                      aria-hidden="true"
                      className={styles.videoCaret}
                    />
                  </p>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.videoProgressTrack}>
            <span data-vbar="" data-ac="b" className={styles.galleryProgressFill} />
          </div>
        </div>
      </div>

      {/* ---------------- Crop info modal overlay ---------------- */}
      <div data-modal-overlay="" className={styles.modalOverlay}>
        <div className={styles.modalBox}>
          <button
            type="button"
            data-close-modal=""
            aria-label="Close"
            className={styles.modalCloseBtn}
          >
            ×
          </button>

          {Object.entries(CROP_INFO).map(([key, info]) => (
            <div key={key} data-modal={key} className={styles.hiddenModalPanel}>
              <header className={styles.modalHeader}>
                <svg aria-hidden="true" width="100%" height="100%" preserveAspectRatio="none" className={styles.modalHeaderSvg}>
                  <rect width="100%" height="100%" fill={`url(#m-${info.pattern})`} />
                </svg>
                <div className={styles.modalHeaderInner}>
                  <span className={styles.modalKicker}>Crop information</span>
                  <h3 className={styles.modalTitle}>{info.title}</h3>
                </div>
              </header>
              <div className={styles.modalBody}>
                <p className={styles.modalBlurb}>{info.blurb}</p>
                <div className={styles.modalChipsBlock}>
                  <div className={styles.modalChipsLabel}>{info.chipsLabel}</div>
                  <div className={styles.modalChipsRow}>
                    {info.chips.map((chip) => (
                      <span
                        key={chip.label}
                        className={chip.dashed ? styles.modalChipDashed : styles.modalChipSolid}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={styles.modalFactsGrid}>
                  <div>
                    <div className={styles.modalFactLabel}>Common uses</div>
                    <p className={styles.modalFactBody}>{info.commonUses}</p>
                  </div>
                  <div>
                    <div className={styles.modalFactLabel}>Typical maturity</div>
                    <p className={styles.modalFactBody}>{info.maturity}</p>
                  </div>
                  <div>
                    <div className={styles.modalFactLabel}>Planting</div>
                    <p className={styles.modalFactBody}>{info.planting}</p>
                  </div>
                  <div>
                    <div className={styles.modalFactLabel}>Harvest</div>
                    <p className={styles.modalFactBody}>{info.harvest}</p>
                  </div>
                </div>
                <p className={styles.modalDisclaimer}>Ranges shown for planning reference. Actual timing varies by variety, location and farm practice.</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Motif id="sprout" bg="#F6F5EF" />

      {/* ---------------- Crop advisory ---------------- */}
      <section id="crops" className={styles.advisorySection}>
        <div className={styles.advisoryInner}>
          <div className={styles.advisoryHeadGrid}>
            <div>
              <div className={styles.kickerRow12}>
                <span data-ac="b" className={styles.showcaseDash} />
                <span className={styles.kickerLabelGreen}>Crop advisory</span>
              </div>
              <h2 className={styles.advisoryTitle}>Know when to grow.</h2>
            </div>
            <p className={styles.advisoryHeadBody}>
              Plan ahead with crop information, estimated growing periods, harvest windows, and planting advisories.
            </p>
          </div>

          <div className={styles.advisoryTabsRow}>
            {(['banana', 'coconut', 'mango', 'corn', 'pineapple'] as const).map((key) => (
              <button
                key={key}
                data-advisory={key}
                className={key === 'banana' ? styles.advisoryTabOn : styles.advisoryTabOff}
              >
                {key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>

          <div className={styles.advisoryPanelCard}>
            {Object.entries(ADVISORY_STEPS).map(([key, steps]) => (
              <div key={key} data-advisory-panel={key} className={key === 'banana' ? styles.advisoryPanelBlock : styles.advisoryPanelNone}>
                <div className={styles.advisoryStepsGrid}>
                  {steps.map((s, i) => (
                    <div key={s.title} className={i === 0 ? styles.advisoryStepFirst : styles.advisoryStep}>
                      <div className={styles.advisoryStepTitle}>{s.title}</div>
                      <p className={styles.advisoryStepBody}>{s.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className={styles.advisoryFooterRow}>
              <div className={styles.advisoryPreviewCard}>
                <span className={styles.advisoryPulseWrap}>
                  <span data-ac="b" className={styles.advisoryPulseDot} />
                  <span data-ac="b" className={styles.advisoryPulseRing} />
                </span>
                <div>
                  <div className={styles.advisoryPreviewTitle}>Planting period approaching</div>
                  <div className={styles.advisoryPreviewSub}>Advisory preview · based on the selected crop</div>
                </div>
              </div>
              <span className={styles.advisoryFooterNote}>Estimated windows for planning. They are not a substitute for local agricultural advice.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Crop maturity experience ---------------- */}
      <div data-matscroll="" className={styles.maturityWrap}>
        <div className={styles.maturitySticky}>
          <div aria-hidden="true" className={styles.maturityGradient} />
          <svg aria-hidden="true" width="100%" height="100%" preserveAspectRatio="none" className={styles.maturityContourSvg}>
            <rect width="100%" height="100%" fill="url(#m-contour-d)" />
          </svg>

          <div className={styles.maturityHeadWrap}>
            <div className={styles.kickerRow12}>
              <span data-ac="b" className={styles.showcaseDash} />
              <span className={styles.heroKickerLabel}>Crop maturity experience</span>
            </div>
            <div className={styles.maturityHeadGrid}>
              <h2 className={styles.maturityTitle}>
                Watch a harvest<br /><span className={styles.italicAccent300}>move through time.</span>
              </h2>
              <p className={styles.maturityHeadBody}>
                Explore how a banana changes from fresh green fruit to ripe and eventually overripe through an interactive maturity experience. Keep scrolling to move the days forward.
              </p>
            </div>
          </div>

          <div className={styles.maturityStageRow}>
            <div className={styles.maturityDayCol}>
              <div className={styles.maturityLabel}>Day</div>
              <div data-mat-day="" className={styles.maturityDayNum}>1</div>
              <div data-mat-stage="" data-ac="t" className={styles.maturityStageName}>Immature</div>
            </div>
            <div className={styles.maturityImgCol}>
              <div aria-hidden="true" className={styles.maturityImgGlow} />
              <img
                src="/images/crops/banana.png"
                alt="Banana at the selected maturity stage"
                data-mat-img=""
                className={styles.maturityImg}
              />
            </div>
            <div className={styles.maturityCondCol}>
              <div className={styles.maturityLabel}>Visual condition</div>
              <ul data-mat-cond="" className={styles.maturityCondList}>
                <li className={styles.maturityCondItem}>Deep green skin</li>
                <li className={styles.maturityCondItem}>Firm, angular fingers</li>
                <li className={styles.maturityCondItem}>Very low visual maturity</li>
              </ul>
            </div>
          </div>

          <div className={styles.maturityHeadWrap}>
            <div className={styles.maturityBarTrack}>
              <span data-mat-bar="" data-ac="b" className={styles.galleryProgressFill} />
            </div>
            <div className={styles.maturityTicksRow}>
              <span data-mat-tick="" className={styles.maturityTickOn}>Day 1</span>
              {['20', '35', '45', '55', '65', '75+'].map((t) => (
                <span key={t} data-mat-tick="" className={styles.maturityTickOff}>
                  {t}
                </span>
              ))}
            </div>
            <p className={styles.maturityFootnote}>
              A visualization of predefined maturity stages built from the platform&apos;s own product photography. It is not a scientifically validated decay simulation.
            </p>
          </div>
        </div>
      </div>

      <Motif id="fence" bg="#FFFFFF" />

      {/* ---------------- For farmers ---------------- */}
      <section id="farmers" className={styles.farmersSection}>
        <div className={styles.farmersGrid}>
          <div>
            <div data-reveal="0" className={styles.kickerRow12}>
              <span data-ac="b" className={styles.showcaseDash} />
              <span className={styles.kickerLabelGreen}>For farmers</span>
            </div>
            <h2 data-reveal="60" className={styles.farmersTitle}>
              Your harvest<br /><span className={styles.italicGreen300}>deserves a market.</span>
            </h2>
            <p data-reveal="120" className={styles.farmersBody}>
              Create your seller account, showcase your available produce, set your expected price, and connect directly with interested buyers.
            </p>
            <div className={styles.farmersStepsGrid}>
              <div data-reveal="160" className={styles.farmersStepOn}>
                <div className={styles.farmersStepNum}>01</div>
                <div className={styles.farmersStepLabel}>Register</div>
              </div>
              <div data-reveal="220" className={styles.farmersStepOff}>
                <div className={styles.farmersStepNum}>02</div>
                <div className={styles.farmersStepLabel}>List your produce</div>
              </div>
              <div data-reveal="280" className={styles.farmersStepOff}>
                <div className={styles.farmersStepNum}>03</div>
                <div className={styles.farmersStepLabel}>Connect with buyers</div>
              </div>
              <div data-reveal="340" className={styles.farmersStepOff}>
                <div className={styles.farmersStepNum}>04</div>
                <div className={styles.farmersStepLabel}>Negotiate &amp; trade</div>
              </div>
            </div>
            <div className={styles.farmersFooterRow}>
              <a
                data-ac="b"
                href="#contact"
                className={styles.farmersRegisterBtn}
              >
                Register as Seller <span>→</span>
              </a>
              <span className={styles.farmersFooterNote}>Sellers can register directly, no manual approval needed.</span>
            </div>
          </div>
          <div data-reveal="80" className={styles.farmersArtWrap}>
            <div aria-hidden="true" className={styles.farmersArtBg}>
              <svg aria-hidden="true" width="100%" height="100%" preserveAspectRatio="none" className={styles.farmersArtSvg}>
                <rect width="100%" height="100%" fill="url(#m-furrow-l)" />
              </svg>
            </div>
            <img
              src="/images/crops/banana.png"
              alt=""
              aria-hidden="true"
              data-para="-.05"
              className={styles.farmersArtImg}
            />
            <div data-tilt="14" className={styles.farmersCardTop}>
              <div className={styles.farmersCardKicker}>New listing</div>
              <div className={styles.farmersCardName}>Banana — Lakatan</div>
              <div className={styles.farmersCardPriceRow}>
                <span className={styles.farmersCardPrice}>₱24</span>
                <span className={styles.farmersCardUnit}>/ kg</span>
              </div>
              <div className={styles.farmersCardMeta}>1,200 kg · Davao de Oro</div>
            </div>
            <div data-tilt="-18" className={styles.farmersCardBottom}>
              <div className={styles.farmersCardBottomKicker}>Buyer interest</div>
              <div className={styles.farmersCardBottomText}>3 buyers viewing</div>
              <div className={styles.farmersCardTrack}>
                <span data-ac="b" className={styles.farmersCardFill} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- For buyers ---------------- */}
      <section id="buyers" className={styles.buyersSection}>
        <svg aria-hidden="true" width="100%" height="100%" preserveAspectRatio="none" className={styles.buyersGrainSvg}>
          <rect width="100%" height="100%" fill="url(#m-grain-d)" />
        </svg>
        <div aria-hidden="true" className={styles.buyersGlow} />
        <div className={styles.buyersInner}>
          <div className={styles.buyersHeadGrid}>
            <div>
              <div className={styles.kickerRow12}>
                <span data-ac="b" className={styles.showcaseDash} />
                <span className={styles.heroKickerLabel}>For businesses &amp; bulk buyers</span>
              </div>
              <h2 className={styles.buyersTitle}>
                Looking for agricultural<br /><span className={styles.italicAccent300}>supply in bulk?</span>
              </h2>
            </div>
            <p className={styles.buyersHeadBody}>
              Businesses and serious bulk buyers can connect with farmers offering the products and quantities they need through a verified buyer onboarding process.
            </p>
          </div>

          <div className={styles.buyersStepsGrid}>
            {[
              { n: '01', title: 'Send inquiry', body: 'Tell us the products and volumes you need.' },
              { n: '02', title: 'Verification', body: 'We confirm your organization and contact details.' },
              { n: '03', title: 'Approval', body: 'An admin confirms the account before full access.' },
              { n: '04', title: 'Access the marketplace', body: 'Browse listings, prices and available supply.' },
              { n: '05', title: 'Connect & negotiate', body: 'Talk directly with the farmers behind the listing.' },
            ].map((s) => (
              <div
                key={s.n}
                className={styles.buyersStepCard}
              >
                <div data-ac="t" className={styles.buyersStepNum}>{s.n}</div>
                <div className={styles.buyersStepTitle}>{s.title}</div>
                <p className={styles.buyersStepBody}>{s.body}</p>
              </div>
            ))}
          </div>

          <div className={styles.buyersFooterRow}>
            <a
              data-ac="b"
              href="#contact"
              className={styles.buyersPrimaryBtn}
            >
              Become a Buyer <span>→</span>
            </a>
            <a
              href="#contact"
              className={styles.buyersSecondaryBtn}
            >
              Contact Us
            </a>
            <span className={styles.buyersFooterNote}>Buyer accounts need organization details and admin confirmation before full access.</span>
          </div>
        </div>
      </section>

      {/* ---------------- Delivery & routes ---------------- */}
      <section id="routes" className={styles.routesSection}>
        <div className={styles.routesInner}>
          <div className={styles.advisoryHeadGrid}>
            <div>
              <div className={styles.kickerRow12}>
                <span data-ac="b" className={styles.showcaseDash} />
                <span className={styles.kickerLabelGreen}>Delivery &amp; routes</span>
              </div>
              <h2 className={styles.routesTitle}>
                From the farm<br /><span className={styles.italicGreen300}>to your destination.</span>
              </h2>
            </div>
            <p className={styles.routesHeadBody}>
              View farm locations, estimate travel time, and explore routes based on the selected vehicle.
            </p>
          </div>

          <div className={styles.routesGrid}>
            <div data-reveal="0" className={styles.routesCard}>
              <div className={styles.routesCardKicker}>Route estimate</div>
              <div className={styles.routesStatsGrid}>
                <div>
                  <div className={styles.routesStatLabel}>Distance</div>
                  <div className={styles.routesStatRow}>
                    <span data-route-km="" className={styles.routesStatValue}>18.4</span>
                    <span className={styles.routesStatUnit}>km</span>
                  </div>
                </div>
                <div>
                  <div className={styles.routesStatLabel}>Estimated travel</div>
                  <div className={styles.routesStatRow}>
                    <span data-route-min="" className={styles.routesStatValue}>31</span>
                    <span className={styles.routesStatUnit}>min</span>
                  </div>
                </div>
                <div>
                  <div className={styles.routesStatLabel}>Vehicle</div>
                  <div data-route-vehicle="" className={styles.routesVehicleValue}>Light Truck</div>
                </div>
              </div>
              <div className={styles.routesSelectBlock}>
                <div className={styles.routesCardKicker}>Select vehicle</div>
                <div className={styles.routesVehicleRow}>
                  {(['Motorcycle', 'Light Truck', 'Large Truck'] as const).map((v) => (
                    <button
                      key={v}
                      data-vehicle={v}
                      className={v === 'Light Truck' ? styles.routesVehicleBtnOn : styles.routesVehicleBtnOff}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className={styles.routesDisclaimer}>Estimates are indicative. Actual travel time depends on road conditions, load and weather.</p>
              </div>
            </div>

            <div data-reveal="90" className={styles.routesMapCard}>
              <svg aria-hidden="true" width="100%" height="100%" preserveAspectRatio="none" className={styles.routesMapSvgBg}>
                <rect width="100%" height="100%" fill="url(#m-contour-d)" />
              </svg>
              <svg viewBox="0 0 740 300" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className={styles.routesMapSvgFg} aria-hidden="true">
                <path
                  data-route-path=""
                  d="M40 210 C 170 210 210 120 350 120 C 480 120 570 150 700 150"
                  fill="none"
                  stroke="rgba(167,198,65,.9)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeDasharray="9 11"
                  className={styles.routesPath}
                />
                <circle cx="40" cy="210" r="7" fill="#A7C641" />
                <circle cx="40" cy="210" r="15" fill="none" stroke="rgba(167,198,65,.45)" strokeWidth="1.6" className={styles.routesPulseOrigin} />
                <circle cx="700" cy="150" r="6.5" fill="#F6F5EF" />
                <circle cx="700" cy="150" r="14" fill="none" stroke="rgba(246,245,239,.35)" strokeWidth="1.4" />
              </svg>
              <div className={styles.routesLegend}>
                <span className={styles.routesLegendFarm}>Farm · Davao de Oro</span>
                <span className={styles.routesLegendBuyer}>Buyer destination</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Motif id="furrow" bg="#FFFFFF" />

      {/* ---------------- How it works ---------------- */}
      <section id="how" className={styles.howSection}>
        <div className={styles.howInner}>
          <div className={styles.howHead}>
            <div className={styles.kickerRow12}>
              <span data-ac="b" className={styles.showcaseDash} />
              <span className={styles.kickerLabelGreen}>How it works</span>
            </div>
            <h2 className={styles.howTitle}>
              One platform.<br /><span className={styles.italicGreen300}>Two sides of the market.</span>
            </h2>
          </div>
          <div className={styles.howGrid}>
            <div data-reveal="0" className={styles.howCardLight}>
              <div className={styles.howCardHeadRow}>
                <span data-ac="b" className={styles.howDotAccent} />
                <span className={styles.howCardKickerDark}>For farmers</span>
              </div>
              <ol className={styles.howList}>
                {['Register', 'List', 'Connect', 'Negotiate', 'Trade'].map((label, i) => (
                  <li
                    key={label}
                    className={i < 4 ? styles.howListItemBorder : styles.howListItem}
                  >
                    <span className={styles.howListNumDark}>{String(i + 1).padStart(2, '0')}</span>
                    <span className={styles.howListLabelDark}>{label}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div data-reveal="90" className={styles.howCardDark}>
              <svg aria-hidden="true" width="100%" height="100%" preserveAspectRatio="none" className={styles.howCardSprout}>
                <rect width="100%" height="100%" fill="url(#m-sprout-d)" />
              </svg>
              <div className={styles.howCardDarkInner}>
                <div className={styles.howCardHeadRow}>
                  <span className={styles.howDotLight} />
                  <span className={styles.howCardKickerLight}>For buyers</span>
                </div>
                <ol className={styles.howList}>
                  {['Apply', 'Verify', 'Discover', 'Negotiate', 'Purchase'].map((label, i) => (
                    <li
                      key={label}
                      className={i < 4 ? styles.howListItemBorderLight : styles.howListItem}
                    >
                      <span className={styles.howListNumLight}>{String(i + 1).padStart(2, '0')}</span>
                      <span className={styles.howListLabelLight}>{label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Motif id="sprout" bg="#EEF1EA" />

      {/* ---------------- Contact / buyer inquiry ---------------- */}
      <section id="contact" className={styles.contactSection}>
        <div className={styles.contactGrid}>
          <div>
            <div className={styles.kickerRow12}>
              <span data-ac="b" className={styles.showcaseDash} />
              <span className={styles.kickerLabelGreen}>Buyer inquiry</span>
            </div>
            <h2 className={styles.contactTitle}>
              Looking to source agricultural products in bulk?
            </h2>
            <p className={styles.contactBody}>
              Tell us what you need and start the process of becoming a verified AniTime buyer.
            </p>
            <div className={styles.contactBullets}>
              <div className={styles.contactBulletRow}>
                <span data-ac="b" className={styles.contactBulletDot} />
                <span className={styles.contactBulletText}>We only ask for what is needed to verify your organization.</span>
              </div>
              <div className={styles.contactBulletRow}>
                <span data-ac="b" className={styles.contactBulletDot} />
                <span className={styles.contactBulletText}>An admin reviews your inquiry before marketplace access opens.</span>
              </div>
            </div>
          </div>

          <div className={styles.contactFormCard}>
            <form data-inquiry="" className={styles.contactForm}>
              <label className={styles.contactLabel}>
                <span className={styles.contactLabelText}>Company / Organization</span>
                <input
                  required
                  type="text"
                  placeholder="AniTime Foods Inc."
                  className={styles.contactInput}
                />
              </label>
              <label className={styles.contactLabel}>
                <span className={styles.contactLabelText}>Contact Person</span>
                <input
                  required
                  type="text"
                  placeholder="Full name"
                  className={styles.contactInput}
                />
              </label>
              <label className={styles.contactLabel}>
                <span className={styles.contactLabelText}>Email</span>
                <input
                  required
                  type="email"
                  placeholder="name@company.com"
                  className={styles.contactInput}
                />
              </label>
              <label className={styles.contactLabel}>
                <span className={styles.contactLabelText}>Phone</span>
                <input
                  type="tel"
                  placeholder="+63"
                  className={styles.contactInput}
                />
              </label>
              <label className={styles.contactLabel}>
                <span className={styles.contactLabelText}>Products Needed</span>
                <select
                  className={styles.contactSelect}
                >
                  <option>Banana</option>
                  <option>Coconut</option>
                  <option>Mango</option>
                  <option>Corn</option>
                  <option>Pineapple</option>
                  <option>Multiple products</option>
                </select>
              </label>
              <label className={styles.contactLabel}>
                <span className={styles.contactLabelText}>Estimated Quantity</span>
                <input
                  type="text"
                  placeholder="2,000 kg per month"
                  className={styles.contactInput}
                />
              </label>
              <label className={styles.contactLabelFull}>
                <span className={styles.contactLabelText}>Message</span>
                <textarea
                  rows={4}
                  placeholder="Delivery location, timing, quality requirements"
                  className={styles.contactTextarea}
                />
              </label>
              <div className={styles.contactSubmitRow}>
                <button
                  type="submit"
                  data-ac="b"
                  className={styles.contactSubmitBtn}
                >
                  Submit Buyer Inquiry <span>→</span>
                </button>
                <span className={styles.contactSubmitNote}>No documents needed at this stage.</span>
              </div>
            </form>
            <div data-inquiry-done="" className={styles.contactDone}>
              <span data-ac="b" className={styles.contactDoneIcon}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#062F24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                </svg>
              </span>
              <h3 className={styles.contactDoneTitle}>Your inquiry has been received.</h3>
              <p className={styles.contactDoneBody}>
                Our team will review your organization details and get back to you about verified buyer access.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Final CTA ---------------- */}
      <section className={styles.ctaSection}>
        <div aria-hidden="true" className={styles.ctaGlow} />
        <svg aria-hidden="true" viewBox="0 0 1200 300" preserveAspectRatio="none" width="100%" height="100%" className={styles.ctaPathSvg}>
          <path d="M-20 250 C 240 250 300 90 620 90 C 900 90 1000 170 1220 170" fill="none" stroke="rgba(167,198,65,.34)" strokeWidth="1.6" strokeDasharray="8 12" className={styles.dashRunLg} />
        </svg>
        <div aria-hidden="true" className={styles.ctaDustWrap}>
          <span className={styles.ctaDust1} />
          <span className={styles.ctaDust2} />
          <span className={styles.ctaDust3} />
          <span className={styles.ctaDust4} />
        </div>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>
            <span className={styles.fw600}>Sell what you grow.</span><br /><span className={styles.italicAccent300}>Find what you need.</span>
          </h2>
          <p className={styles.ctaBody}>
            AniTime brings farmers, agricultural supply, buyers, and delivery planning into one connected marketplace.
          </p>
          <div className={styles.ctaBtnRow}>
            <a
              data-ac="b"
              href="#farmers"
              className={styles.ctaPrimaryBtn}
            >
              Register as Seller <span>→</span>
            </a>
            <a
              href="#contact"
              className={styles.ctaSecondaryBtn}
            >
              Become a Buyer
            </a>
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className={styles.footer}>
        <svg aria-hidden="true" width="100%" height="56" preserveAspectRatio="none" className={styles.footerGrainSvg}>
          <rect width="100%" height="56" fill="url(#m-grain-d)" />
        </svg>
        <div className={styles.footerInner}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrandCol}>
              <div className={styles.footerBrandRow}>
                <span className={styles.navBrandIcon}>
                  <Image src="/brand/logo-128.png" alt="AniTime logo" width={28} height={28} className={styles.brandImg} />
                </span>
                <span className={styles.footerBrandText}>AniTime</span>
              </div>
              <p className={styles.footerTagline}>Grow. Trade. Deliver. Smarter.</p>
            </div>
            <div>
              <div className={styles.footerColLabel}>Marketplace</div>
              <div className={styles.footerLinksCol}>
                <a href="#marketplace" className={styles.footerLink}>Browse Products</a>
                <a href="#prices" className={styles.footerLink}>Prices</a>
                <a href="#crops" className={styles.footerLink}>Crops</a>
              </div>
            </div>
            <div>
              <div className={styles.footerColLabel}>For Farmers</div>
              <div className={styles.footerLinksCol}>
                <Link href="/auth?screen=register" className={styles.footerLink}>Register</Link>
                <Link href="/auth" className={styles.footerLink}>Seller Login</Link>
              </div>
            </div>
            <div>
              <div className={styles.footerColLabel}>For Buyers</div>
              <div className={styles.footerLinksCol}>
                <a href="#buyers" className={styles.footerLink}>Become a Buyer</a>
                <a href="#contact" className={styles.footerLink}>Buyer Inquiry</a>
              </div>
            </div>
            <div>
              <div className={styles.footerColLabel}>Company</div>
              <div className={styles.footerLinksCol}>
                <a href="#about" className={styles.footerLink}>About</a>
                <a href="#how" className={styles.footerLink}>How It Works</a>
                <a href="#contact" className={styles.footerLink}>Contact</a>
              </div>
            </div>
          </div>
          <div className={styles.footerBottomRow}>
            <span className={styles.footerCopyright}>© 2026 AniTime</span>
            <span className={styles.footerCopyright}>Agricultural Marketplace Platform</span>
          </div>
        </div>
      </footer>
    </>
  );
}
