'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FortuneWheel } from '@/components/FortuneWheel';
import { Alert, Spinner } from '@/components/ui';
import { api } from '@/lib/client';
import type { WheelPerson } from '@/lib/fortune-wheel';

export default function SpinPage() {
  const [people, setPeople] = useState<WheelPerson[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api<{ people: WheelPerson[] }>('/api/world/people')
      .then((data) => setPeople(data.people))
      .catch((err) => setError((err as Error).message));
  }, []);

  async function sit(person: WheelPerson) {
    setError('');
    setBusy(person.id);
    try {
      const result = await api<{ conversation?: { id: string } | null }>('/api/world/invite', { body: { toId: person.id } });
      if (result.conversation?.id) {
        window.location.href = `/app/world/${result.conversation.id}`;
        return;
      }
      setError(`${person.name} still has to accept. The table has not started.`);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy('');
  }

  return (
    <div className="mx-auto max-w-3xl">
      {error && <Alert kind="error">{error}</Alert>}
      {!people && !error && <Spinner />}
      {people && people.length === 0 && (
        <p className="text-sm text-ink-300">
          Add your city on <Link href="/app/world" className="text-brand-300 hover:underline">your profile</Link> first. Then the wheel can pick someone.
        </p>
      )}
      {people && people.length > 0 && (
        <FortuneWheel
          people={people}
          busyId={people.some((person) => person.id === busy) ? busy : ''}
          onSit={(person) => void sit(person)}
          sitLabel={(person) => (person.guest ? `Sit with ${person.name}` : `Ask ${person.name}`)}
        />
      )}
    </div>
  );
}
