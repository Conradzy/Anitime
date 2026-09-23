import { redirectIfSignedIn } from '@/lib/require-session';

// Visitors only: someone already signed in is sent to the dashboard.
export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  await redirectIfSignedIn();
  return children;
}
