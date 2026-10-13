import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getOrCreateProfile, serializeProfile } from '@/lib/services/world';
import { ProfileForm } from './profile-form';

export const dynamic = 'force-dynamic';

export default async function WorldPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const profile = serializeProfile(await getOrCreateProfile(user.id));
  return (
    <ProfileForm
      initial={{
        optedIn: profile.optedIn,
        available: profile.available,
        city: profile.city,
        country: profile.country,
        bio: profile.bio,
        portraitPhotoId: profile.portraitPhotoId,
      }}
    />
  );
}
