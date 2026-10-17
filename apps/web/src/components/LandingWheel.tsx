'use client';

import { useRouter } from 'next/navigation';
import { FortuneWheel } from '@/components/FortuneWheel';
import type { WheelPerson } from '@/lib/fortune-wheel';
import { registerHrefForSit, rememberLandingSit } from '@/lib/landing-sit';

export function LandingWheel({ people }: { people: WheelPerson[] }) {
  const router = useRouter();
  return (
    <FortuneWheel
      people={people}
      sitLabel={(person) => `Join to sit with ${person.name}`}
      onSit={(person) => {
        rememberLandingSit(person.id);
        router.push(registerHrefForSit(person.id));
      }}
    />
  );
}
