'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './client';
import { icePayload, parseSignalBody, type IceInit } from './world-signal';

export type PeerStatus = 'off' | 'connecting' | 'open' | 'failed';

type IceCfg = { iceServers: { urls: string | string[]; username?: string; credential?: string }[] };
type Signal = { id: string; type: string; payload: string; createdAt: string };

const CONNECT_POLL_MS = 900;
const OPEN_POLL_MS = 8_000;
const ICE_FLUSH_MS = 80;
const HANDSHAKE_MS = 12_000;
const DISCONNECT_GRACE_MS = 4_000;
const RESTART_MIN_AGE_MS = 1_500;

/**
 * WebRTC data-channel between the two café browsers.
 * The server only exchanges SDP/ICE. Chat text never goes through it.
 * Each try is a fresh connection. A dead try asks the other side for a new one.
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
    let generation = 0;
    let tries = 0;
    let pollTimer = 0;
    let handshakeTimer = 0;
    let disconnectTimer = 0;
    let restartTimer = 0;
    let conn: RTCPeerConnection | null = null;
    let channel: RTCDataChannel | null = null;
    let activeAttempt = '';
    let iceFlushTimer = 0;
    let bornAt = 0;
    const usedAttempts = new Set<string>();
    const seenSignals = new Set<string>();

    const live = (next: RTCPeerConnection) => !closed && conn === next;

    const closeSockets = () => {
      clearTimeout(pollTimer);
      clearTimeout(handshakeTimer);
      clearTimeout(disconnectTimer);
      clearTimeout(iceFlushTimer);
      pollTimer = 0;
      handshakeTimer = 0;
      disconnectTimer = 0;
      iceFlushTimer = 0;
      const oldChannel = channel;
      const oldConn = conn;
      channel = null;
      conn = null;
      oldChannel?.close();
      oldConn?.close();
      if (dc.current === oldChannel) dc.current = null;
      if (pc.current === oldConn) pc.current = null;
    };

    const post = (type: string, payload: string) =>
      api(`/api/world/conversations/${conversationId}/signal`, { body: { type, payload } }).catch(() => null);

    const restart = (fromAttempt?: string) => {
      if (closed || restarting) return;
      restarting = true;
      if (fromAttempt) void post('restart', JSON.stringify({ attemptId: fromAttempt }));
      closeSockets();
      clearTimeout(restartTimer);
      const wait = Math.min(4_000, 500 * 2 ** Math.min(tries, 3)) + Math.floor(Math.random() * 250);
      tries += 1;
      restartTimer = window.setTimeout(() => {
        restarting = false;
        if (!closed) start();
      }, wait);
    };

    const start = () => {
      if (closed) return;
      const gen = ++generation;
      setStatus('connecting');
      const attemptId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const born = Date.now();
      bornAt = born;
      const next = new RTCPeerConnection({
        iceServers: iceNow.iceServers,
        iceCandidatePoolSize: 4,
        bundlePolicy: 'max-bundle',
      });
      conn = next;
      pc.current = next;
      activeAttempt = attemptId;
      let remoteSet = false;
      let answeredOffer = '';
      let cursor = '';
      let inflight = false;
      const pending: IceInit[] = [];
      const localIce: IceInit[] = [];
      const iceBuf: IceInit[] = [];

      const currentAttempt = () => (offerer ? attemptId : answeredOffer);

      const flushIceBuf = () => {
        iceFlushTimer = 0;
        if (!live(next)) return;
        const id = currentAttempt();
        const batch = iceBuf.splice(0);
        if (!batch.length) return;
        if (!id) {
          localIce.push(...batch);
          return;
        }
        void post('ice', icePayload(id, batch));
      };

      const queueIce = (init: IceInit) => {
        if (!init.candidate) return;
        iceBuf.push(init);
        if (!iceFlushTimer) iceFlushTimer = window.setTimeout(flushIceBuf, ICE_FLUSH_MS);
      };

      const flushLocalIce = () => {
        const id = currentAttempt();
        if (!id || !localIce.length) return;
        void post('ice', icePayload(id, localIce.splice(0)));
      };

      const applyRemoteIce = async (candidates: IceInit[]) => {
        for (const init of candidates) {
          if (!remoteSet) pending.push(init);
          else {
            try {
              await next.addIceCandidate(init);
            } catch {
              /* stale */
            }
          }
        }
      };

      const flushPendingIce = async () => {
        const queued = pending.splice(0);
        await applyRemoteIce(queued);
      };

      const iceAlive = () => {
        const iceState = next.iceConnectionState;
        const connState = next.connectionState;
        return (
          iceState === 'checking' ||
          iceState === 'connected' ||
          iceState === 'completed' ||
          connState === 'connecting' ||
          connState === 'connected'
        );
      };

      const linkOpen = () => channel?.readyState === 'open' && iceAlive();

      let pollOnce = async () => {};
      const schedulePoll = (ms: number) => {
        clearTimeout(pollTimer);
        if (closed || conn !== next) return;
        pollTimer = window.setTimeout(() => {
          pollOnce()
            .catch(() => {})
            .finally(() => {
              if (!live(next)) return;
              schedulePoll(linkOpen() ? OPEN_POLL_MS : CONNECT_POLL_MS);
            });
        }, ms);
      };

      const attach = (ch: RTCDataChannel) => {
        channel = ch;
        dc.current = ch;
        ch.onopen = () => {
          if (!live(next)) return;
          tries = 0;
          clearTimeout(handshakeTimer);
          clearTimeout(disconnectTimer);
          setStatus('open');
          const id = currentAttempt();
          if (id) void post('state', JSON.stringify({ attemptId: id, phase: 'open' }));
          schedulePoll(OPEN_POLL_MS);
        };
        ch.onclose = () => {
          if (!live(next) || restarting) return;
          window.setTimeout(() => {
            if (live(next) && ch.readyState !== 'open') restart(currentAttempt() || attemptId);
          }, 1_500);
        };
        ch.onmessage = (ev) => {
          try {
            onRemoteRef.current(JSON.parse(String(ev.data)));
          } catch {
            /* ignore malformed */
          }
        };
      };

      const onPathChange = () => {
        if (!live(next)) return;
        const iceState = next.iceConnectionState;
        const connState = next.connectionState;
        if (iceState === 'connected' || iceState === 'completed' || connState === 'connected') {
          clearTimeout(disconnectTimer);
          disconnectTimer = 0;
          return;
        }
        const dead = iceState === 'failed' || connState === 'failed';
        const dropped = iceState === 'disconnected' || connState === 'disconnected';
        if (!dead && !dropped) return;
        if (dead) {
          clearTimeout(disconnectTimer);
          disconnectTimer = 0;
        }
        if (!disconnectTimer) {
          disconnectTimer = window.setTimeout(() => {
            if (!live(next)) return;
            if (channel?.readyState === 'open' && iceAlive()) return;
            restart(currentAttempt() || attemptId);
          }, dead ? 600 : DISCONNECT_GRACE_MS);
        }
        if (dropped) schedulePoll(CONNECT_POLL_MS);
      };

      next.ondatachannel = (e) => {
        if (live(next)) attach(e.channel);
      };
      next.oniceconnectionstatechange = onPathChange;
      next.onconnectionstatechange = onPathChange;
      next.onicecandidate = (e) => {
        if (!live(next) || !e.candidate) return;
        queueIce(e.candidate.toJSON());
      };
      next.onicegatheringstatechange = () => {
        if (next.iceGatheringState === 'complete') flushIceBuf();
      };

      if (offerer) {
        usedAttempts.add(attemptId);
        attach(next.createDataChannel('world', { ordered: true }));
        next
          .createOffer()
          .then(async (offer) => {
            if (!live(next) || gen !== generation) return;
            await next.setLocalDescription(offer);
            const ok = await post('offer', JSON.stringify({ attemptId, description: offer }));
            if (!ok && live(next)) restart(attemptId);
          })
          .catch(() => {
            if (live(next)) restart(attemptId);
          });
      }

      pollOnce = async () => {
        if (!live(next) || inflight) return;
        inflight = true;
        try {
          const q = new URLSearchParams();
          if (cursor) q.set('after', cursor);
          if (linkOpen()) q.set('live', '1');
          const suffix = q.toString();
          const r = await api<{ signals: Signal[]; cursor?: string; peer?: { attemptId: string; phase: string } | null }>(
            `/api/world/conversations/${conversationId}/signal${suffix ? `?${suffix}` : ''}`,
          );
          if (!live(next) || gen !== generation) return;
          if (r.cursor) cursor = r.cursor;
          const fresh: { id: string; type: string; createdAt: string; body: NonNullable<ReturnType<typeof parseSignalBody>> }[] = [];
          for (const s of r.signals) {
            if (seenSignals.has(s.id)) continue;
            seenSignals.add(s.id);
            if (seenSignals.size > 240) {
              const first = seenSignals.values().next().value;
              if (first) seenSignals.delete(first);
            }
            const body = parseSignalBody(s.payload);
            if (body) fresh.push({ ...s, body });
            if (!r.cursor && s.createdAt > cursor) cursor = s.createdAt;
          }

          const tooNewToRestart = Date.now() - born < RESTART_MIN_AGE_MS;
          if (!linkOpen() && !tooNewToRestart && fresh.some((s) => s.type === 'restart')) {
            restart(currentAttempt() || attemptId);
            return;
          }

          if (!offerer) {
            const offers = fresh.filter((s) => s.type === 'offer' && s.body.description?.type === 'offer' && !usedAttempts.has(s.body.attemptId));
            const latest = offers.at(-1);
            const description = latest?.body.description;
            if (latest && description && !linkOpen()) {
              if (answeredOffer) {
                restart(answeredOffer);
                return;
              }
              const offerAttempt = latest.body.attemptId;
              try {
                answeredOffer = offerAttempt;
                activeAttempt = offerAttempt;
                flushLocalIce();
                flushIceBuf();
                await next.setRemoteDescription(description as RTCSessionDescriptionInit);
                remoteSet = true;
                const answer = await next.createAnswer();
                if (!live(next)) return;
                await next.setLocalDescription(answer);
                await post('answer', JSON.stringify({ attemptId: offerAttempt, description: answer }));
                usedAttempts.add(offerAttempt);
                await flushPendingIce();
              } catch {
                answeredOffer = '';
                activeAttempt = attemptId;
                remoteSet = false;
                if (live(next)) restart(offerAttempt);
              }
            }
          } else {
            const answers = fresh.filter(
              (s) => s.type === 'answer' && s.body.attemptId === attemptId && s.body.description?.type === 'answer',
            );
            const latest = answers.at(-1);
            const description = latest?.body.description;
            if (latest && description && !remoteSet) {
              await next.setRemoteDescription(description as RTCSessionDescriptionInit);
              remoteSet = true;
              await flushPendingIce();
            }
          }

          for (const s of fresh) {
            if (s.type !== 'ice' || !s.body.candidates.length) continue;
            const expected = currentAttempt();
            if (!expected || s.body.attemptId !== expected) continue;
            await applyRemoteIce(s.body.candidates);
          }
        } finally {
          inflight = false;
        }
      };

      schedulePoll(0);
      handshakeTimer = window.setTimeout(() => {
        if (!live(next) || channel?.readyState === 'open') return;
        if (iceAlive()) {
          handshakeTimer = window.setTimeout(() => {
            if (live(next) && channel?.readyState !== 'open') restart(currentAttempt() || attemptId);
          }, 6_000);
          return;
        }
        restart(currentAttempt() || attemptId);
      }, HANDSHAKE_MS);
    };

    const onWake = () => {
      if (closed || document.hidden) return;
      const iceState = conn?.iceConnectionState;
      const iceDead = iceState === 'failed' || iceState === 'disconnected' || iceState === 'closed';
      if (channel?.readyState === 'open') {
        if (iceDead) restart(activeAttempt || undefined);
        return;
      }
      if (!iceDead && Date.now() - bornAt < HANDSHAKE_MS) return;
      restart(activeAttempt || undefined);
    };

    start();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    return () => {
      closed = true;
      generation += 1;
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
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
