import { createRoot } from 'react-dom/client';
import { adapterForLocation } from '../adapters';
import { Panel } from './Panel';
import { PANEL_CSS } from './styles';

/**
 * Content script entry. Only injected on supported sites (see manifest
 * `content_scripts.matches`), and does nothing unless a site adapter exists.
 */
const adapter = adapterForLocation();
if (adapter && !document.getElementById('conversa-ai-root')) {
  const host = document.createElement('div');
  host.id = 'conversa-ai-root';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  const mount = document.createElement('div');
  shadow.append(style, mount);
  createRoot(mount).render(<Panel adapter={adapter} />);
}
