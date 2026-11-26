import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const interTight = localFont({
  src: [
    { path: './fonts/InterTight.ttf', weight: '100 900', style: 'normal' },
    { path: './fonts/InterTight-Italic.ttf', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-inter-tight',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AniTime',
  description: 'AniTime — farm-to-buyer produce marketplace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={interTight.variable}>
      <body>{children}</body>
    </html>
  );
}
