'use client';

import { useRouter } from 'next/navigation';
import { FortuneWheel } from '@/components/FortuneWheel';
import type { WheelPerson } from '@/lib/fortune-wheel';

export function LandingWheel({ people }: { people: WheelPerson[] }) {
  const router = useRouter();
  return (
    <FortuneWheel
      people={people}
      sitLabel={(person) => `Join to sit with ${person.name}`}
      onSit={() => router.push('/register')}
    />
  );
}
