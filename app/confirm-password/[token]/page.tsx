import { ConfirmButton } from './ConfirmButton';

export const metadata = { title: 'Confirm password change · AniTime', robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main style={{ minHeight: '100vh', background: '#F6F5EF', display: 'grid', placeItems: 'center', padding: 16, color: '#062F24' }}>
      <div style={{ width: 'min(440px,100%)', background: '#fff', border: '1px solid rgba(6,47,36,.1)', borderRadius: 22, padding: 28 }}>
        <ConfirmButton token={token} />
      </div>
    </main>
  );
}
