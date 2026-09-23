import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { sellerBadges } from '@/lib/marketplace';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const badge = (await sellerBadges([user.id])).get(user.id);

  return NextResponse.json({
    user: {
      id: user.id,
      fullname: user.fullname,
      businessname: user.businessname,
      email: user.email,
      product: user.product,
      role: user.role,
      buyerTier: user.buyerTier,
      emailVerified: Boolean(user.emailVerified),
      sellerVerified: user.sellerVerified,
      rating: badge?.rating ?? 0,
      reviewCount: badge?.reviewCount ?? 0,
      photoUrl: badge?.photoUrl ?? null,
    },
  });
}
