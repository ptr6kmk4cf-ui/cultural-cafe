'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './client';

export type PeerStatus = 'off' | 'connecting' | 'open' | 'failed';

type IceCfg = { iceServers: { urls: string | string[]; username?: string; credential?: string }[] };
type Signal = { id: string; type: string; payload: string; createdAt: string };

/**
 * WebRTC data-channel between the two café browsers.
 * The server only exchanges SDP/ICE. Chat text never goes through it.
 * Each try is a fresh connection, and a failed try starts another on its own.
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

    let closed = false;
    let restarting = false;
    let poll = 0;
    let attemptTimer = 0;
    let restartTimer = 0;
    let conn: RTCPeerConnection | null = null;
    let channel: RTCDataChannel | null = null;

    let failTimer = 0;

    const closeSockets = () => {
      clearInterval(poll);
      clearTimeout(attemptTimer);
      clearTimeout(failTimer);
      poll = 0;
      const oldChannel = channel;
      const oldConn = conn;
      channel = null;
      conn = null;
      oldChannel?.close();
      oldConn?.close();
      if (dc.current === oldChannel) dc.current = null;
      if (pc.current === oldConn) pc.current = null;
    };

    const restart = () => {
      if (closed || restarting) return;
      if (channel?.readyState === 'open' || dc.current?.readyState === 'open') return;
      restarting = true;
      closeSockets();
      clearTimeout(restartTimer);
      restartTimer = window.setTimeout(() => {
        restarting = false;
        if (!closed) start();
      }, 600);
    };

    const post = (type: string, payload: string) =>
      api(`/api/world/conversations/${conversationId}/signal`, { body: { type, payload } }).catch(() => {});

    const start = () => {
      if (closed) return;
      setStatus('connecting');
      const attemptId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const next = new RTCPeerConnection({ iceServers: iceNow.iceServers });
      conn = next;
      pc.current = next;
      let remoteSet = false;
      let answeredOffer = '';
      const pending: RTCIceCandidateInit[] = [];
      const localIce: RTCIceCandidateInit[] = [];

      const flushIce = async () => {
        const queued = pending.splice(0);
        for (const init of queued) {
          try {
            await next.addIceCandidate(init);
          } catch {
            /* candidate for a previous try */
          }
        }
      };

      const sendIce = (init: RTCIceCandidateInit) => {
        const id = offerer ? attemptId : answeredOffer;
        if (!id) {
          localIce.push(init);
          return;
        }
        post('ice', JSON.stringify({ attemptId: id, candidate: init }));
      };

      const flushLocalIce = () => {
        const id = offerer ? attemptId : answeredOffer;
        if (!id) return;
        for (const init of localIce.splice(0)) post('ice', JSON.stringify({ attemptId: id, candidate: init }));
      };

      const attach = (ch: RTCDataChannel) => {
        channel = ch;
        dc.current = ch;
        ch.onopen = () => {
          if (closed || conn !== next) return;
          clearTimeout(attemptTimer);
          clearTimeout(failTimer);
          setStatus('open');
        };
        ch.onclose = () => {
          if (closed || conn !== next || restarting) return;
          window.setTimeout(() => {
            if (!closed && conn === next && ch.readyState !== 'open') restart();
          }, 2500);
        };
        ch.onmessage = (ev) => {
          try {
            onRemoteRef.current(JSON.parse(String(ev.data)));
          } catch {
            /* ignore malformed */
          }
        };
      };

      next.ondatachannel = (e) => {
        if (conn === next) attach(e.channel);
      };
      next.oniceconnectionstatechange = () => {
        if (closed || conn !== next) return;
        const ice = next.iceConnectionState;
        if (ice === 'connected' || ice === 'completed') {
          clearTimeout(failTimer);
          return;
        }
        if (ice !== 'failed') return;
        clearTimeout(failTimer);
        failTimer = window.setTimeout(() => {
          if (closed || conn !== next) return;
          if (next.iceConnectionState === 'failed' && channel?.readyState !== 'open') restart();
        }, 8000);
      };
      next.onicecandidate = (e) => {
        if (!e.candidate || closed || conn !== next) return;
        sendIce(e.candidate.toJSON());
      };

      if (offerer) {
        attach(next.createDataChannel('world', { ordered: true }));
        next
          .createOffer()
          .then(async (offer) => {
            if (closed || conn !== next) return;
            await next.setLocalDescription(offer);
            await post('offer', JSON.stringify({ attemptId, description: offer }));
          })
          .catch(() => {
            if (conn === next) restart();
          });
      }

      const pollOnce = async () => {
        if (closed || conn !== next) return;
        const since = new Date(Date.now() - 25_000).toISOString();
        const r = await api<{ signals: Signal[] }>(
          `/api/world/conversations/${conversationId}/signal?after=${encodeURIComponent(since)}`,
        );
        if (closed || conn !== next) return;
        const parsed = r.signals.map((s) => ({ ...s, body: readBody(s.payload) }));

        if (!offerer) {
          const offers = parsed.filter((s) => s.type === 'offer' && s.body?.description?.type === 'offer');
          const latest = offers[offers.length - 1];
          const description = latest?.body?.description;
          const offerIsNew = !!(latest?.body && description && latest.body.attemptId !== answeredOffer);
          const keepCurrent =
            channel?.readyState === 'open' ||
            (!!answeredOffer && next.iceConnectionState !== 'failed' && next.iceConnectionState !== 'closed');
          if (offerIsNew && !keepCurrent && latest?.body && description) {
            if (answeredOffer) {
              restart();
              return;
            }
            answeredOffer = latest.body.attemptId;
            flushLocalIce();
            await next.setRemoteDescription(description);
            remoteSet = true;
            const answer = await next.createAnswer();
            if (closed || conn !== next) return;
            await next.setLocalDescription(answer);
            await post('answer', JSON.stringify({ attemptId: answeredOffer, description: answer }));
            await flushIce();
          }
        } else {
          const answers = parsed.filter(
            (s) => s.type === 'answer' && s.body?.attemptId === attemptId && s.body.description?.type === 'answer',
          );
          const latest = answers[answers.length - 1];
          const description = latest?.body?.description;
          if (latest?.body && description && !remoteSet) {
            await next.setRemoteDescription(description);
            remoteSet = true;
            await flushIce();
          }
        }

        for (const s of parsed) {
          if (s.type !== 'ice' || !s.body?.candidate) continue;
          const expected = offerer ? attemptId : answeredOffer;
          if (!expected || s.body.attemptId !== expected) continue;
          if (!remoteSet) pending.push(s.body.candidate);
          else {
            try {
              await next.addIceCandidate(s.body.candidate);
            } catch {
              /* stale */
            }
          }
        }
      };

      poll = window.setInterval(() => {
        pollOnce().catch(() => {});
      }, 700);
      pollOnce().catch(() => {});
      let waits = 0;
      const arm = () => {
        attemptTimer = window.setTimeout(() => {
          if (closed || conn !== next || channel?.readyState === 'open') return;
          const ice = next.iceConnectionState;
          const settling = ice === 'checking' || ice === 'connected' || ice === 'completed' || ice === 'disconnected';
          if (settling && waits < 2) {
            waits += 1;
            arm();
            return;
          }
          restart();
        }, 20_000);
      };
      arm();
    };

    start();
    return () => {
      closed = true;
      clearTimeout(restartTimer);
      closeSockets();
    };
  }, [conversationId, offerer, enabled, iceKey]);

  function send(data: unknown) {
    if (dc.current?.readyState !== 'open') throw new Error('Peer connection is not open yet.');
    dc.current.send(JSON.stringify(data));
  }

  return { status, send };
}

function readBody(payload: string): { attemptId: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } | null {
  try {
    const data = JSON.parse(payload) as {
      attemptId?: string;
      description?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
      type?: string;
      sdp?: string;
      candidateLine?: string;
    };
    if (data?.attemptId && (data.description || data.candidate)) {
      return { attemptId: data.attemptId, description: data.description, candidate: data.candidate };
    }
    if (data?.type && data.sdp) return { attemptId: 'legacy', description: data as RTCSessionDescriptionInit };
    if (data && 'candidate' in data && !data.attemptId) return { attemptId: 'legacy', candidate: data as RTCIceCandidateInit };
    return null;
  } catch {
    return null;
  }
}
