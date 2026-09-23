import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/require-session';

// Signed-in users only. Checked on the server for every request, so a
// logged-out browser can't reach this page (not even via Back/Forward).
export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  // The dashboard is the seller's workspace; buyers start from the market feed
  // until they are verified to sell.
  if (user.role === 'BUYER' && !user.sellerVerified) redirect('/seller-home');
  return children;
}
