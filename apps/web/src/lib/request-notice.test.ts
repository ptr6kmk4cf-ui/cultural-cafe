import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestsForMe, unheardRequestIds, type RequestInvite } from './request-notice';

const incoming: RequestInvite = { id: 'in', incoming: true, iAccepted: false, peer: { name: 'Hana', city: 'Tokyo' } };

test('Only an unanswered request for me rings', () => {
  const invites: RequestInvite[] = [
    incoming,
    { id: 'mine', incoming: false, iAccepted: true, peer: { name: 'Elena' } },
    { id: 'yes', incoming: true, iAccepted: true, peer: { name: 'Mei' } },
  ];
  assert.deepEqual(requestsForMe(invites).map((invite) => invite.id), ['in']);
  assert.deepEqual(unheardRequestIds(['in', 'yes'], ['yes']), ['in']);
  assert.deepEqual(unheardRequestIds(['in'], ['in']), []);
});
