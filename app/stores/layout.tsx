import { requireSession } from '@/lib/require-session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stores | AniTime' };

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return children;
}
