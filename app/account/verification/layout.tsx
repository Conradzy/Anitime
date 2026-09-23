import { requireSession } from '@/lib/require-session';

// Signed-in users only. Checked on the server for every request, so a
// logged-out browser can't reach this page (not even via Back/Forward).
export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return children;
}
