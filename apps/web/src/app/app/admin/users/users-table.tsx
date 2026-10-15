'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui';

type Account = {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  registeredAt: string;
};

function when(value: string) {
  return new Date(value).toLocaleString();
}

export function UsersTable({ users }: { users: Account[] }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => [user.email, user.name, user.role, user.plan].join(' ').toLowerCase().includes(q));
  }, [users, query]);

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-300">{users.length} account{users.length === 1 ? '' : 's'}</p>
        <input
          className="input max-w-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email or name"
        />
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-ink-400">No one matches.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-ink-400">
              <tr>
                <th className="py-2 pr-3 font-medium">Registered</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Password</th>
                <th className="py-2 pr-3 font-medium">Plan</th>
                <th className="py-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => (
                <tr key={user.id} className="border-t border-white/5">
                  <td className="py-2 pr-3 text-xs text-ink-300">{when(user.registeredAt)}</td>
                  <td className="py-2 pr-3 font-medium text-white">{user.email}</td>
                  <td className="py-2 pr-3">{user.name}</td>
                  <td className="py-2 pr-3">
                    <p>Email and password</p>
                    <p className="text-xs text-ink-400">Hashed · not shown</p>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={user.plan === 'PREMIUM' ? 'brand' : 'default'}>{user.plan}</Badge>
                  </td>
                  <td className="py-2">
                    {user.role === 'ADMIN' ? <Badge tone="brand">Admin</Badge> : <Badge>User</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
