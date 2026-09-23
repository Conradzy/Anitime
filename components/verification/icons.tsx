/** Line icons for the verification flow, drawn in the same 20x20 grid and
 * stroke weight as the rest of AniTime so nothing looks borrowed. */
import type { ReactNode } from 'react';

function Icon({ children, size = 17, stroke = 'currentColor', width = 1.6 }: { children: ReactNode; size?: number; stroke?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const SmartphoneIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="6" y="2.4" width="8" height="15.2" rx="2" />
    <path d="M9 15.2h2" />
  </Icon>
);

export const CalendarIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="3" y="4.6" width="14" height="12.6" rx="2.2" />
    <path d="M3 8.4h14M7 2.8v3.2M13 2.8v3.2" />
    <path d="M7 11.6h.01M10 11.6h.01M13 11.6h.01M7 14.4h.01M10 14.4h.01" />
  </Icon>
);

export const HouseIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M3.2 8.8 10 3.2l6.8 5.6" />
    <path d="M5 10.2v6.6h10v-6.6" />
    <path d="M8.4 16.8v-4h3.2v4" />
  </Icon>
);

export const ScanLineIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M3 7V5.2A2.2 2.2 0 0 1 5.2 3H7M13 3h1.8A2.2 2.2 0 0 1 17 5.2V7M17 13v1.8a2.2 2.2 0 0 1-2.2 2.2H13M7 17H5.2A2.2 2.2 0 0 1 3 14.8V13" />
    <path d="M5.4 10h9.2" />
  </Icon>
);

export const ScanFaceIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M3 7V5.2A2.2 2.2 0 0 1 5.2 3H7M13 3h1.8A2.2 2.2 0 0 1 17 5.2V7M17 13v1.8a2.2 2.2 0 0 1-2.2 2.2H13M7 17H5.2A2.2 2.2 0 0 1 3 14.8V13" />
    <path d="M7.6 8.4h.01M12.4 8.4h.01" />
    <path d="M7.6 12.2a3.2 3.2 0 0 0 4.8 0" />
  </Icon>
);

export const ShieldCheckIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M10 2.6 4.6 4.8v4.6c0 3.4 2.2 6.4 5.4 7.6 3.2-1.2 5.4-4.2 5.4-7.6V4.8z" />
    <path d="M7.8 9.8l1.6 1.6 3-3.2" />
  </Icon>
);

export const CheckIcon = ({ size = 13, stroke = '#062F24' }: { size?: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.6l4.6 4.6L19 6.8" />
  </svg>
);

export const LockIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="4.6" y="8.8" width="10.8" height="8" rx="2" />
    <path d="M7.2 8.8V6.6a2.8 2.8 0 0 1 5.6 0v2.2" />
  </Icon>
);

export const AlertIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.4" />
    <path d="M10 6.2v4.4M10 13.6h.01" />
  </Icon>
);

export const EyeOffIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M7.5 5.2A7.4 7.4 0 0 1 10 4.8c4 0 6.6 3.4 6.6 5.2a7 7 0 0 1-1.7 2.6M12.4 12.5A3 3 0 0 1 7.8 8.3" />
    <path d="M5.6 6.6A7.7 7.7 0 0 0 3.4 10c0 1.8 2.6 5.2 6.6 5.2a7.6 7.6 0 0 0 2.6-.45" />
    <path d="M3.4 3.4l13.2 13.2" />
  </Icon>
);

export const WalletIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="2.6" y="5" width="14.8" height="11" rx="2.2" />
    <path d="M2.6 8.2h14.8" />
    <path d="M13.4 12.2h.01" />
  </Icon>
);
