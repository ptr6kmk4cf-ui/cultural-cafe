export type RequestInvite = {
  id: string;
  incoming: boolean;
  iAccepted: boolean;
  peer: { name: string; city?: string } | null;
};

export type CafePoll = {
  conversationId: string | null;
  invites: RequestInvite[];
};

/** Invites waiting on this person. One they already accepted is not a new request. */
export function requestsForMe(invites: RequestInvite[]) {
  return invites.filter((invite) => invite.incoming && !invite.iAccepted);
}

export function unheardRequestIds(ids: string[], heard: Iterable<string>) {
  const known = new Set(heard);
  return ids.filter((id) => !known.has(id));
}

type Listener = (state: CafePoll) => void;
const listeners = new Set<Listener>();
let latest: CafePoll | null = null;

export function publishCafePoll(state: CafePoll) {
  latest = state;
  for (const listener of listeners) listener(state);
}

export function subscribeCafePoll(listener: Listener) {
  listeners.add(listener);
  if (latest) listener(latest);
  return () => {
    listeners.delete(listener);
  };
}
