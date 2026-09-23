import type { Metadata } from 'next';
import { VerificationWizard } from '@/components/verification/VerificationWizard';

export const metadata: Metadata = {
  title: 'Complete your account · AniTime',
  description: 'Verify your identity to earn the AniTime Verified badge.',
};

export default function VerificationPage() {
  return <VerificationWizard />;
}
