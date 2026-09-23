import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getVerificationState } from '@/lib/verification';
import { smsConfigured } from '@/lib/philsms';

/** GET — everything the verification wizard needs to render, with the phone
 * masked and only the last 4 digits of the ID number included. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const state = await getVerificationState(user.id);
  return NextResponse.json({ ...state, smsConfigured });
}
