/** SDP / ICE payloads for café WebRTC signalling. Chat text never goes here. */

export type IceInit = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type SdpInit = { type?: string; sdp?: string };

export type SignalBody = {
  attemptId: string;
  description?: SdpInit;
  candidates: IceInit[];
};

export function icePayload(attemptId: string, candidates: IceInit[]) {
  return JSON.stringify({ attemptId, candidates });
}

export function signalPhase(type: string, payload: string): 'connecting' | 'open' | 'restarting' | null {
  if (type === 'restart') return 'restarting';
  if (type === 'offer' || type === 'answer') return 'connecting';
  if (type !== 'state') return null;
  try {
    const phase = (JSON.parse(payload) as { phase?: string }).phase;
    if (phase === 'open' || phase === 'connecting' || phase === 'restarting') return phase;
  } catch {
    /* ignore */
  }
  return null;
}

export function parseSignalBody(payload: string): SignalBody | null {
  try {
    const data = JSON.parse(payload) as {
      attemptId?: string;
      description?: SdpInit;
      candidate?: IceInit;
      candidates?: IceInit[];
      type?: string;
      sdp?: string;
    };
    if (data?.attemptId) {
      const extra = data.candidate && !data.candidates?.length ? [data.candidate] : [];
      return {
        attemptId: data.attemptId,
        description: data.description,
        candidates: [...(data.candidates ?? []), ...extra].filter((c) => !!c?.candidate),
      };
    }
    if (data?.type && data.sdp) return { attemptId: 'legacy', description: data, candidates: [] };
    if (data && 'candidate' in data && !data.attemptId) {
      const candidate = data as IceInit;
      return { attemptId: 'legacy', candidates: candidate.candidate ? [candidate] : [] };
    }
    return null;
  } catch {
    return null;
  }
}
