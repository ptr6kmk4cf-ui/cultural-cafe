import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PLATFORMS } from '@conversa/shared';
import { API_BASE, bg } from '../lib/messages';

function Popup() {
  const [s, setS] = useState<any>(null);
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    bg({ type: 'status' }).then(setS);
  }, []);
  const open = (url: string) => chrome.tabs.create({ url });
  return (
    <div className="wrap">
      <div className="head"><span className="logo">C</span><b>Cultural Café</b></div>
      {!s ? (
        <p>Loading…</p>
      ) : s.connected ? (
        <>
          <p>Signed in as <b>{s.me.user.name}</b> ({s.me.user.plan})</p>
          <p className="muted">Autopilot: {s.me.autopilot.emergencyStop ? 'EMERGENCY STOP' : s.me.autopilot.enabled ? 'armed' : 'off'}</p>
        </>
      ) : (
        <p>Not connected. {s.error}</p>
      )}
      <button onClick={() => open(`${API_BASE}/app`)}>Open dashboard</button>
      {!s?.connected && <button onClick={() => open(`${API_BASE}/app/extension`)}>Connect account</button>}
      {Object.values(PLATFORMS).map((p) => (
        <button key={p.id} className="sec" onClick={() => open(p.origins[0])}>Open {p.demo ? 'demo site' : p.name}</button>
      ))}
      {s?.connected && (
        <button
          className="danger"
          onClick={async () => {
            await bg({ type: 'emergencyStop' });
            setStopped(true);
          }}
        >
          ■ EMERGENCY STOP
        </button>
      )}
      {stopped && <p className="ok">All Autopilot activity stopped.</p>}
      <p className="muted">Runs only on supported sites. No browsing data is collected.</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
