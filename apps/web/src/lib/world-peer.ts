'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './client';

export type PeerStatus = 'off' | 'connecting' | 'open' | 'failed';

type IceCfg = { iceServers: { urls: string | string[]; username?: string; credential?: string }[] };

/**
 * WebRTC data-channel between the two World browsers.
 * The server only exchanges SDP/ICE (signalling). Chat text never goes through it.
 */
export function useWorldPeer(
  conversationId: string | undefined,
  offerer: boolean | undefined,
  ice: IceCfg | undefined,
  enabled: boolean,
  onRemote: (data: unknown) => void,
) {
  const [status, setStatus] = useState<PeerStatus>('off');
  const dc = useRef<RTCDataChannel | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const onRemoteRef = useRef(onRemote);
  const iceRef = useRef(ice);
  onRemoteRef.current = onRemote;
  iceRef.current = ice;
  const iceKey = ice ? JSON.stringify(ice.iceServers) : '';

  useEffect(() => {
    const iceNow = iceRef.current;
    if (!conversationId || !enabled || offerer === undefined || !iceNow) {
      setStatus('off');
      return;
    }
    let stop = false;
    const seen = new Set<string>();
    const pendingIce: RTCIceCandidateInit[] = [];
    let remoteSet = false;
    setStatus('connecting');

    const conn = new RTCPeerConnection({ iceServers: iceNow.iceServers });
    pc.current = conn;

    const attach = (channel: RTCDataChannel) => {
      dc.current = channel;
      channel.onopen = () => {
        if (!stop) setStatus('open');
      };
      channel.onclose = () => {
        if (!stop) setStatus((s) => (s === 'open' ? 'connecting' : s));
      };
      channel.onmessage = (ev) => {
        try {
          onRemoteRef.current(JSON.parse(String(ev.data)));
        } catch {
          /* ignore malformed */
        }
      };
    };

    conn.ondatachannel = (e) => attach(e.channel);
    conn.oniceconnectionstatechange = () => {
      if (stop) return;
      if (conn.iceConnectionState === 'failed' || conn.iceConnectionState === 'disconnected') setStatus('failed');
      if (conn.iceConnectionState === 'connected' || conn.iceConnectionState === 'completed') {
        if (dc.current?.readyState === 'open') setStatus('open');
      }
    };
    conn.onicecandidate = (e) => {
      if (!e.candidate || stop) return;
      api(`/api/world/conversations/${conversationId}/signal`, {
        body: { type: 'ice', payload: JSON.stringify(e.candidate) },
      }).catch(() => {});
    };

    if (offerer) {
      attach(conn.createDataChannel('world', { ordered: true }));
      conn.createOffer().then(async (offer) => {
        if (stop) return;
        await conn.setLocalDescription(offer);
        await api(`/api/world/conversations/${conversationId}/signal`, {
          body: { type: 'offer', payload: JSON.stringify(offer) },
        });
      }).catch(() => {
        if (!stop) setStatus('failed');
      });
    }

    const applyIce = async (init: RTCIceCandidateInit) => {
      if (!remoteSet) {
        pendingIce.push(init);
        return;
      }
      try {
        await conn.addIceCandidate(init);
      } catch {
        /* stale candidate */
      }
    };

    const poll = async () => {
      if (stop) return;
      try {
        const r = await api<{ signals: { id: string; type: string; payload: string; createdAt: string }[] }>(
          `/api/world/conversations/${conversationId}/signal`,
        );
        for (const s of r.signals) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          if (s.type === 'offer' && !offerer) {
            await conn.setRemoteDescription(JSON.parse(s.payload));
            remoteSet = true;
            const answer = await conn.createAnswer();
            await conn.setLocalDescription(answer);
            await api(`/api/world/conversations/${conversationId}/signal`, {
              body: { type: 'answer', payload: JSON.stringify(answer) },
            });
            for (const c of pendingIce.splice(0)) await applyIce(c);
          } else if (s.type === 'answer' && offerer) {
            await conn.setRemoteDescription(JSON.parse(s.payload));
            remoteSet = true;
            for (const c of pendingIce.splice(0)) await applyIce(c);
          } else if (s.type === 'ice') {
            await applyIce(JSON.parse(s.payload));
          }
        }
      } catch {
        /* keep polling */
      }
    };

    const t = setInterval(poll, 500);
    poll();
    const fail = setTimeout(() => {
      if (!stop && dc.current?.readyState !== 'open') setStatus('failed');
    }, 20_000);

    return () => {
      stop = true;
      clearInterval(t);
      clearTimeout(fail);
      dc.current?.close();
      conn.close();
      dc.current = null;
      pc.current = null;
    };
  }, [conversationId, offerer, enabled, iceKey]);

  function send(data: unknown) {
    if (dc.current?.readyState !== 'open') throw new Error('Peer connection is not open yet.');
    dc.current.send(JSON.stringify(data));
  }

  return { status, send };
}
