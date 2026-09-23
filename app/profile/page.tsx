import { getCurrentUser } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';
import { ProfileView, type ProfileData } from './ProfileView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profile · AniTime' };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
const monthYear = (d: Date) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;

function ageOf(birth: Date): number {
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

export default async function ProfilePage() {
  // the layout already guarantees a session; this only narrows the type
  const user = (await getCurrentUser())!;

  const [profile, address, latest, listings, completed] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: user.id } }),
    prisma.residentialAddress.findUnique({ where: { userId: user.id } }),
    prisma.identityVerification.findFirst({ where: { userId: user.id }, orderBy: { id: 'desc' } }),
    prisma.listing.count({ where: { sellerId: user.id } }),
    prisma.transaction.count({ where: { status: 'COMPLETED', OR: [{ buyerId: user.id }, { sellerId: user.id }] } }),
  ]);

  const status: ProfileData['status'] = user.sellerVerified ? 'verified' : latest?.status === 'IN_REVIEW' ? 'pending' : 'unverified';
  const verifyNote =
    status === 'verified'
      ? `Identity verified${latest?.completedAt ? ` · ${monthYear(latest.completedAt)}` : ''}`
      : status === 'pending'
        ? 'National ID sent to the AniTime admin · awaiting confirmation'
        : 'Not verified yet · complete your account verification';

  const addressText = address
    ? [address.addressLine1, address.addressLine2, `Barangay ${address.barangay}`, address.municipality, address.province, address.postalCode, address.country]
        .filter(Boolean)
        .join(', ')
    : null;

  const updated = [user.updatedAt, profile?.updatedAt, address?.updatedAt].filter(Boolean) as Date[];
  const data: Omit<ProfileData, 'startSelling'> = {
    fullName: user.fullname,
    business: user.businessname,
    photoUrl: profile?.profilePhotoUrl ?? null,
    status,
    verifyNote,
    updated: longDate(new Date(Math.max(...updated.map((d) => d.getTime())))),
    quick: [
      { label: 'Member since', value: monthYear(user.createdAt) },
      { label: 'Crops listed', value: String(listings) },
      { label: 'Completed orders', value: String(completed) },
    ],
    fields: [
      { label: 'Full name', value: user.fullname },
      { label: 'Business name', value: user.businessname },
      { label: 'Email address', value: user.email },
      { label: 'Phone number', value: user.phoneNumber },
      { label: 'Age', value: profile?.birthdate ? `${ageOf(profile.birthdate)} years old` : null },
      { label: 'Birthday', value: profile?.birthdate ? longDate(profile.birthdate) : null },
      { label: 'Sex', value: profile?.sex ?? null },
      { label: 'Status', value: status === 'verified' ? 'Verified' : status === 'pending' ? 'Pending review' : 'Unverified' },
      { label: 'Address', value: addressText, wide: true },
    ],
  };

  const startSelling: ProfileData['startSelling'] =
    user.role === 'BUYER' && !user.sellerVerified ? (status === 'pending' ? 'pending' : 'offer') : null;

  return <ProfileView data={{ ...data, startSelling }} />;
}
