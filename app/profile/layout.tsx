import { requireSession } from '@/lib/require-session';

// Signed-in users only, checked on the server for every request.
export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return children;
}
