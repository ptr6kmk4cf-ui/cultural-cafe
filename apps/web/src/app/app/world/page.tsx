import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { cafeDisplayName, getOrCreateProfile, serializeProfile } from '@/lib/services/world';
import { ProfileForm } from './profile-form';

export const dynamic = 'force-dynamic';

export default async function WorldPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const profile = serializeProfile(await getOrCreateProfile(user.id), await cafeDisplayName(user.id, user.name));
  return (
    <ProfileForm
      initial={{
        optedIn: profile.optedIn,
        available: profile.available,
        name: profile.name,
        city: profile.city,
        country: profile.country,
        gender: profile.gender,
        bio: profile.bio,
        portraitPhotoId: profile.portraitPhotoId,
      }}
    />
  );
}
