import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { API_BASE, bg } from '../lib/messages';

function Options() {
  const [s, setS] = useState<any>(null);
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => bg({ type: 'status' }).then(setS);
  useEffect(() => {
    load();
  }, []);

  async function save() {
    // Manual token entry: stored the same way as the automatic bridge.
    await chrome.storage.local.set({ conversaToken: token.trim() });
    setToken('');
    const st = await bg<any>({ type: 'status' });
    setS(st);
    setMsg(st.connected ? 'Connected.' : `Token rejected: ${st.error ?? 'unknown error'}`);
  }

  return (
    <div className="wrap" style={{ maxWidth: 520 }}>
      <div className="head"><span className="logo">C</span><b>Cultural Café — Options</b></div>
      <p>Server: <code>{API_BASE}</code></p>
      <p>Status: {s ? (s.connected ? `connected as ${s.me.user.name}` : 'not connected') : '…'}</p>
      <h3>Connect manually</h3>
      <p className="muted">Generate a token at {API_BASE}/app/extension → “Connect manually”.</p>
      <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste token" />
      <button onClick={save} disabled={token.trim().length < 20}>Save token</button>
      {s?.connected && (
        <button className="sec" onClick={async () => { await bg({ type: 'disconnect' }); load(); setMsg('Disconnected.'); }}>Disconnect</button>
      )}
      {msg && <p className="ok">{msg}</p>}
      <h3>Permissions</h3>
      <p className="muted">This extension can only access the Cultural Café server and the supported sites listed in its manifest. It stores only your account token locally.</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Options />);
