export const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; }
.launcher { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; width: 56px; height: 56px; border-radius: 18px; border: 0; cursor: pointer;
  background: linear-gradient(135deg,#f8306a,#c026d3); color: #fff; font-weight: 800; font-size: 22px; box-shadow: 0 10px 30px rgba(200,20,90,.45); }
.launcher .dot { position: absolute; top: 6px; right: 6px; width: 10px; height: 10px; border-radius: 50%; background: #22c55e; border: 2px solid #fff; }
.panel { position: fixed; top: 0; right: 0; bottom: 0; width: 390px; max-width: 100vw; z-index: 2147483647; background: #120f19; color: #e7e3ee;
  border-left: 1px solid rgba(255,255,255,.08); box-shadow: -20px 0 50px rgba(0,0,0,.35); display: flex; flex-direction: column; font-size: 13px; }
.head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.07); }
.logo { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; font-weight: 800; color: #fff; background: linear-gradient(135deg,#f8306a,#c026d3); }
.title { font-weight: 700; color: #fff; font-size: 14px; }
.sub { font-size: 11px; color: #9a92a8; }
.x { margin-left: auto; background: none; border: 0; color: #9a92a8; font-size: 18px; cursor: pointer; }
.tabs { display: flex; gap: 4px; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,.07); }
.tab { flex: 1; padding: 7px; border-radius: 10px; border: 0; background: transparent; color: #a9a3b6; cursor: pointer; font-weight: 600; font-size: 12px; }
.tab.on { background: rgba(248,48,106,.18); color: #fff; }
.body { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.card { background: #1b1724; border: 1px solid rgba(255,255,255,.06); border-radius: 14px; padding: 12px; }
.btn { border: 0; border-radius: 10px; padding: 8px 12px; font-weight: 700; font-size: 12px; cursor: pointer; background: linear-gradient(90deg,#f8306a,#c026d3); color: #fff; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn.sec { background: rgba(255,255,255,.08); color: #e7e3ee; }
.btn.danger { background: #dc2626; }
.btn.block { width: 100%; }
.row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.muted { color: #9a92a8; font-size: 11px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 700; background: rgba(255,255,255,.08); color: #ddd; }
.badge.brand { background: rgba(248,48,106,.2); color: #ffc6d5; }
.badge.green { background: rgba(34,197,94,.18); color: #bbf7d0; }
.badge.amber { background: rgba(245,158,11,.2); color: #fde68a; }
.badge.red { background: rgba(239,68,68,.2); color: #fecaca; }
textarea, input, select { width: 100%; background: #0f0d15; border: 1px solid rgba(255,255,255,.1); color: #fff; border-radius: 10px; padding: 8px; font-size: 13px; resize: vertical; }
textarea:focus, input:focus { outline: 1px solid #f8306a; }
.alert { border-radius: 10px; padding: 8px 10px; font-size: 12px; }
.alert.err { background: rgba(239,68,68,.15); color: #fecaca; }
.alert.warn { background: rgba(245,158,11,.15); color: #fde68a; }
.alert.ok { background: rgba(34,197,94,.15); color: #bbf7d0; }
.alert.info { background: rgba(56,189,248,.12); color: #bae6fd; }
.score { font-size: 20px; font-weight: 800; color: #ff9bb4; }
ul { margin: 6px 0 0; padding-left: 16px; }
li { margin: 2px 0; }
.log { font-family: ui-monospace, monospace; font-size: 11px; max-height: 220px; overflow-y: auto; background: #0b0910; border-radius: 10px; padding: 8px; }
.stop { position: sticky; bottom: 0; padding: 10px 16px; border-top: 1px solid rgba(255,255,255,.07); background: #120f19; }
.spin { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: s .8s linear infinite; vertical-align: middle; }
@keyframes s { to { transform: rotate(360deg); } }
img.thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 10px; }
`;
