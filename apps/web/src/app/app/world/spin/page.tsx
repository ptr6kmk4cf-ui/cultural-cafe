'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FortuneWheel } from '@/components/FortuneWheel';
import { useUi } from '@/components/UiLocale';
import { Alert, Spinner } from '@/components/ui';
import { api } from '@/lib/client';
import type { WheelPerson } from '@/lib/fortune-wheel';

export default function SpinPage() {
  const { t } = useUi();
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
      setError(t('mustAccept', { name: person.name }));
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
          {t('wheelEmptyBefore')} <Link href="/app/world" className="text-brand-300 hover:underline">{t('profileLink')}</Link> {t('wheelEmptyAfter')}
        </p>
      )}
      {people && people.length > 0 && (
        <FortuneWheel
          people={people}
          busyId={people.some((person) => person.id === busy) ? busy : ''}
          onSit={(person) => void sit(person)}
          sitLabel={(person) => (person.guest ? t('sitWith', { name: person.name }) : t('askName', { name: person.name }))}
        />
      )}
    </div>
  );
}
